import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { ClipboardList, FilePlus2, Plus, Send, Trash2 } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import { QUESTION_TYPE_LABELS } from "@/lib/domain";
import { useClubContext } from "@/lib/hooks/use-club";
import { useViewerId } from "@/lib/queries";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  FormQuestionRow,
  FormResponseRow,
  FormRow,
  QuestionType,
  TablesInsert,
} from "@/lib/types/database";

/**
 * PRD 25: leaders build forms from ready-made question types; members complete
 * them and never see authoring controls.
 *
 * The member/form-manager split is not enforced here -- the `forms` select
 * policy already hides drafts from members, so this page simply renders what
 * the database is willing to return (PRD 41).
 */
export const Route = createFileRoute("/clubs/$clubId/forms")({
  component: FormsPage,
});

function FormsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <FormsContent />
      </AppShell>
    </RequireAuth>
  );
}

const QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];

/** Sentinel for "nothing chosen yet" -- Radix Select cannot hold "" as a value. */
const UNSET = "__unset__";

const YES_NO = ["Yes", "No"] as const;

interface QuestionDraft {
  type: QuestionType;
  question: string;
  required: boolean;
  /** Comma-separated; turned into the `options` array on save. */
  optionsText: string;
}

interface BuilderState {
  title: string;
  description: string;
  closesAt: string;
  questions: QuestionDraft[];
}

const EMPTY_BUILDER: BuilderState = {
  title: "",
  description: "",
  closesAt: "",
  questions: [{ type: "short_answer", question: "", required: false, optionsText: "" }],
};

function FormsContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/forms" });
  const context = useClubContext(clubId);
  const queryClient = useQueryClient();

  const permissions = context.data?.permissions ?? [];
  const isLinkedAdministrator = context.data?.isLinkedAdministrator ?? false;
  // PRD 45: management controls appear only when the permission is actually
  // held, so nobody is shown a form builder they cannot save.
  const mayManageForms = can(permissions, "manage_forms") || isLinkedAdministrator;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [builder, setBuilder] = useState<BuilderState>(EMPTY_BUILDER);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [responseError, setResponseError] = useState<string | null>(null);

  const viewer = useViewerId();

  const forms = useQuery({
    queryKey: ["club", clubId, "forms"],
    queryFn: async (): Promise<FormRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("forms")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FormRow[];
    },
    enabled: Boolean(clubId),
  });

  const formRows = forms.data ?? [];
  // Default to the newest form so a shared link or a returned session lands on
  // something useful instead of an empty pane.
  const activeFormId = selectedId ?? formRows[0]?.id ?? null;

  const questions = useQuery({
    queryKey: ["club", clubId, "form-questions", activeFormId],
    queryFn: async (): Promise<FormQuestionRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("form_questions")
        .select("*")
        .eq("form_id", activeFormId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FormQuestionRow[];
    },
    enabled: Boolean(activeFormId),
  });

  // RLS lets a member read only their own response, so filtering by user_id is
  // the same check the database makes -- it just keeps the rule in one place.
  const responses = useQuery({
    queryKey: ["club", clubId, "form-responses", activeFormId],
    queryFn: async (): Promise<FormResponseRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("form_responses")
        .select("*")
        .eq("form_id", activeFormId ?? "");
      if (error) throw error;
      return (data ?? []) as FormResponseRow[];
    },
    enabled: Boolean(activeFormId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["club", clubId, "forms"] });
    void queryClient.invalidateQueries({ queryKey: ["club", clubId, "form-questions"] });
    void queryClient.invalidateQueries({ queryKey: ["club", clubId, "form-responses"] });
  };

  const createForm = useMutation({
    mutationFn: async (input: BuilderState) => {
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const createdBy = userData.user?.id;
      if (!createdBy) throw new Error("You need to be signed in to create a form.");

      const { data, error } = await insertForm({
        club_id: clubId,
        created_by: createdBy,
        title: input.title.trim(),
        description: input.description.trim(),
        status: "draft",
        closes_at: input.closesAt === "" ? null : new Date(input.closesAt).toISOString(),
      });
      if (error) throw error;

      const created = (data as Array<{ id: string }> | null)?.[0];
      if (!created) throw new Error("The form could not be created.");

      const { error: questionError } = await insertQuestions(
        input.questions.map((draft, index) => ({
          form_id: created.id,
          type: draft.type,
          question: draft.question.trim(),
          // `question_options_consistent` (migration 06) rejects anything else.
          options: optionsFor(draft.type, draft.optionsText),
          required: draft.required,
          sort_order: index,
        })),
      );
      if (questionError) throw questionError;

      return created.id;
    },
    onSuccess: () => {
      invalidate();
      setBuilder(EMPTY_BUILDER);
      setBuilding(false);
      setBuilderError(null);
    },
  });

  const publish = useMutation({
    mutationFn: async (formId: string) => {
      const supabase = getSupabaseClient();
      // PRD 25 step 5: publishing is the only way a form becomes fillable, and
      // Postgres refuses to publish one with no questions.
      const { error } = await supabase.rpc("publish_form", { target_form: formId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const respond = useMutation({
    mutationFn: async (formId: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("submit_form_response", {
        target_form: formId,
        response_answers: answers,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setResponseError(null);
    },
  });

  const activeForm = formRows.find((form) => form.id === activeFormId) ?? null;
  const questionRows = questions.data ?? [];
  const viewerId = viewer.data ?? null;
  const alreadyResponded = (responses.data ?? []).some((response) => response.user_id === viewerId);
  const availability = activeForm ? availabilityOf(activeForm) : "draft";

  const selectForm = (formId: string) => {
    setSelectedId(formId);
    setAnswers({});
    setResponseError(null);
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const missing = builder.questions.filter((draft) => draft.question.trim() === "");
    if (builder.title.trim() === "") {
      setBuilderError("Give the form a title so members know what it is for.");
      return;
    }
    if (missing.length > 0) {
      setBuilderError("Every question needs some text, or remove it.");
      return;
    }
    // Postgres would reject the insert anyway; catching it here keeps the
    // message about the question the leader can actually fix.
    const choiceWithoutOptions = builder.questions.some(
      (draft) => isChoiceType(draft.type) && optionsFor(draft.type, draft.optionsText).length === 0,
    );
    if (choiceWithoutOptions) {
      setBuilderError(
        "Multiple choice and checkbox questions need at least one option (separate them with commas).",
      );
      return;
    }
    setBuilderError(null);
    createForm.mutate(builder);
  };

  const handleRespond = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeForm) return;
    const unfilled = questionRows.filter(
      (question) => question.required && (answers[question.id] ?? "").trim() === "",
    );
    const firstMissing = unfilled[0];
    if (firstMissing) {
      setResponseError(`Please answer: ${firstMissing.question}`);
      return;
    }
    setResponseError(null);
    respond.mutate(activeForm.id);
  };

  if (context.isLoading || forms.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  return (
    <>
      <PageHeader
        title="Forms"
        description="Collect information from members with questions you pick, not a blank grid."
        actions={
          mayManageForms ? (
            <Button
              variant={building ? "outline" : "default"}
              onClick={() => setBuilding((open) => !open)}
            >
              <FilePlus2 className="size-4" />
              {building ? "Close builder" : "New form"}
            </Button>
          ) : undefined
        }
      />

      {building && mayManageForms ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Build a form</CardTitle>
            <CardDescription>
              A form starts as a draft. Members only ever see it once you publish it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="form-title">Title</Label>
                  <Input
                    id="form-title"
                    value={builder.title}
                    onChange={(event) =>
                      setBuilder((state) => ({ ...state, title: event.target.value }))
                    }
                    placeholder="Spring competition sign-up"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="form-closes">Closes on (optional)</Label>
                  <Input
                    id="form-closes"
                    type="datetime-local"
                    value={builder.closesAt}
                    onChange={(event) =>
                      setBuilder((state) => ({ ...state, closesAt: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="form-description">What is this for?</Label>
                <Textarea
                  id="form-description"
                  value={builder.description}
                  onChange={(event) =>
                    setBuilder((state) => ({ ...state, description: event.target.value }))
                  }
                  placeholder="A sentence so members know why you are asking."
                  rows={2}
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-sm font-medium">Questions</p>
                {builder.questions.map((draft, index) => (
                  <div key={index} className="rounded-md border p-3">
                    <div className="flex items-end gap-2">
                      <div className="w-48 shrink-0 space-y-1.5">
                        <Label htmlFor={`question-type-${index}`} className="text-xs">
                          Answer type
                        </Label>
                        <Select
                          value={draft.type}
                          onValueChange={(value) =>
                            updateQuestion(setBuilder, index, { type: value as QuestionType })
                          }
                        >
                          <SelectTrigger id={`question-type-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {QUESTION_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {QUESTION_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor={`question-text-${index}`} className="text-xs">
                          Question
                        </Label>
                        <Input
                          id={`question-text-${index}`}
                          value={draft.question}
                          onChange={(event) =>
                            updateQuestion(setBuilder, index, { question: event.target.value })
                          }
                          placeholder="Which events can you attend?"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove question ${index + 1}`}
                        disabled={builder.questions.length === 1}
                        onClick={() =>
                          setBuilder((state) => ({
                            ...state,
                            questions: state.questions.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    {isChoiceType(draft.type) ? (
                      <div className="mt-2 space-y-1.5">
                        <Label htmlFor={`question-options-${index}`} className="text-xs">
                          Options (separate with commas)
                        </Label>
                        <Input
                          id={`question-options-${index}`}
                          value={draft.optionsText}
                          onChange={(event) =>
                            updateQuestion(setBuilder, index, {
                              optionsText: event.target.value,
                            })
                          }
                          placeholder="Competition, Practice, Social"
                        />
                      </div>
                    ) : null}

                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.required}
                        onCheckedChange={(checked) =>
                          updateQuestion(setBuilder, index, { required: checked === true })
                        }
                        aria-label="Required question"
                      />
                      Members must answer this
                    </label>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setBuilder((state) => ({
                      ...state,
                      questions: [
                        ...state.questions,
                        {
                          type: "short_answer",
                          question: "",
                          required: false,
                          optionsText: "",
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="size-4" />
                  Add question
                </Button>
              </div>

              {builderError ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {builderError}
                </p>
              ) : null}
              {createForm.error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {createForm.error.message}
                </p>
              ) : null}

              <Button type="submit" disabled={createForm.isPending}>
                {createForm.isPending ? (
                  <SkeletonSpinner />
                ) : (
                  <ClipboardList className="size-4" />
                )}
                Save as draft
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {formRows.length === 0 ? (
          <Card>
            <CardContent>
              <p className="py-6 text-center text-sm text-muted-foreground">
                There are no forms in this club yet.
                {mayManageForms ? " Use “New form” to create the first one." : ""}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {formRows.map((form) => (
                <li key={form.id}>
                  <Button
                    variant={form.id === activeFormId ? "default" : "outline"}
                    size="sm"
                    onClick={() => selectForm(form.id)}
                  >
                    {form.title}
                  </Button>
                </li>
              ))}
            </ul>

            {activeForm ? (
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{activeForm.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {activeForm.description || "No description."}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={availability === "open" ? "default" : "outline"}>
                        {availabilityLabel(availability)}
                      </Badge>
                      {mayManageForms && activeForm.status === "draft" ? (
                        <Button
                          size="sm"
                          disabled={publish.isPending}
                          onClick={() => publish.mutate(activeForm.id)}
                        >
                          {publish.isPending ? (
                            <SkeletonSpinner />
                          ) : (
                            <Send className="size-4" />
                          )}
                          Publish
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeForm.closes_at ? (
                    <p className="text-xs text-muted-foreground">
                      Closes {new Date(activeForm.closes_at).toLocaleString()}
                    </p>
                  ) : null}

                  {availability !== "open" ? (
                    <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {availability === "draft"
                        ? "This form is not open yet. A leader has to publish it before members can fill it in."
                        : "This form is closed. It is no longer accepting answers."}
                    </p>
                  ) : alreadyResponded ? (
                    <div className="rounded-md bg-accent/50 px-3 py-2 text-sm">
                      <p className="font-medium">You already responded to this form</p>
                      <p className="text-muted-foreground">
                        Your answers were saved, and leaders can see them alongside everyone
                        else&apos;s. Submitting again replaces what you sent before.
                      </p>
                    </div>
                  ) : null}

                  {questions.isLoading ? <Skeleton className="h-40 w-full" /> : null}

                  {questionRows.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      This form has no questions yet.
                    </p>
                  ) : (
                    <form onSubmit={handleRespond} className="space-y-4">
                      {questionRows.map((question) => (
                        <QuestionField
                          key={question.id}
                          question={question}
                          value={answers[question.id] ?? ""}
                          onChange={(next) =>
                            setAnswers((current) => ({ ...current, [question.id]: next }))
                          }
                          disabled={respond.isPending}
                        />
                      ))}

                      {responseError ? (
                        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          {responseError}
                        </p>
                      ) : null}
                      {respond.error ? (
                        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          {respond.error.message}
                        </p>
                      ) : null}

                      <Button type="submit" disabled={respond.isPending || availability !== "open"}>
                        {respond.isPending ? (
                          <SkeletonSpinner />
                        ) : (
                          <Send className="size-4" />
                        )}
                        {alreadyResponded ? "Update my response" : "Submit"}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

/** One input per question type, so members never face raw configuration (PRD 25/44). */
function QuestionField({
  question,
  value,
  onChange,
  disabled,
}: {
  question: FormQuestionRow;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const label = (
    <Label htmlFor={`answer-${question.id}`} className="text-sm">
      {question.question}
      {question.required ? <span className="text-destructive"> *</span> : null}
    </Label>
  );

  return (
    <div className="space-y-1.5">
      {label}
      <span className="sr-only">{QUESTION_TYPE_LABELS[question.type]}</span>

      {question.type === "long_answer" ? (
        <Textarea
          id={`answer-${question.id}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          disabled={disabled}
        />
      ) : question.type === "multiple_choice" ? (
        <ChoiceSelect
          id={`answer-${question.id}`}
          value={value}
          options={question.options}
          onChange={onChange}
          disabled={disabled}
          placeholder="Choose one"
        />
      ) : question.type === "checkbox" ? (
        // PRD 44: a comma-separated box is the plainest way to collect several
        // answers without asking members to learn a multi-select control.
        <Input
          id={`answer-${question.id}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`Separate with commas: ${question.options.join(", ")}`}
          disabled={disabled}
        />
      ) : question.type === "yes_no" ? (
        <ChoiceSelect
          id={`answer-${question.id}`}
          value={value}
          options={[...YES_NO]}
          onChange={onChange}
          disabled={disabled}
          placeholder="Choose one"
        />
      ) : (
        <Input
          id={`answer-${question.id}`}
          type={question.type === "number" ? "number" : question.type === "date" ? "date" : "text"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function ChoiceSelect({
  id,
  value,
  options,
  onChange,
  disabled,
  placeholder,
}: {
  id: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <Select
      value={value === "" ? UNSET : value}
      onValueChange={(next) => onChange(next === UNSET ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function isChoiceType(type: QuestionType): boolean {
  return type === "multiple_choice" || type === "checkbox";
}

/**
 * `question_options_consistent` (migration 06) demands a non-empty array for
 * multiple choice and checkbox questions, and an empty array for every other
 * type. Encoding the rule once here is what keeps the insert from bouncing.
 */
function optionsFor(type: QuestionType, optionsText: string): string[] {
  if (!isChoiceType(type)) return [];
  return optionsText
    .split(",")
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
}

function updateQuestion(
  setBuilder: (updater: (state: BuilderState) => BuilderState) => void,
  index: number,
  patch: Partial<QuestionDraft>,
): void {
  setBuilder((state) => ({
    ...state,
    questions: state.questions.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
  }));
}

type Availability = "draft" | "open" | "closed";

function availabilityOf(form: FormRow): Availability {
  if (form.status === "draft") return "draft";
  if (form.status === "closed") return "closed";
  // A passed deadline closes the form for members even while the row still says
  // "published" -- the same rule the club home page applies to events.
  if (form.closes_at && new Date(form.closes_at).getTime() < Date.now()) return "closed";
  return "open";
}

function availabilityLabel(availability: Availability): string {
  if (availability === "draft") return "Draft";
  if (availability === "closed") return "Closed";
  return "Open";
}

/**
 * The hand-maintained Database type carries no relationship metadata, so
 * supabase-js cannot infer a payload from an already-typed object. Casting once
 * here keeps the call sites readable; Postgres and RLS stay the enforcement
 * point (PRD 41).
 */
function insertForm(row: TablesInsert<"forms">) {
  return getSupabaseClient()
    .from("forms")
    .insert(row as unknown as never[])
    .select("id");
}

function insertQuestions(rows: TablesInsert<"form_questions">[]) {
  return getSupabaseClient()
    .from("form_questions")
    .insert(rows as unknown as never[]);
}
