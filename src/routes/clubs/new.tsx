import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { SkeletonSpinner } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/context";
import {
  useClubVerifications,
  useCreateClub,
  useSubmitClubForReview,
  useVerifyClub,
} from "@/lib/queries";
import {
  CLUB_STATUS_LABELS,
  CLUB_TYPES,
  COMMITMENT_LEVELS,
  MEETING_DAYS,
  COMMON_MEETING_TIMES,
  PRESET_INTERESTS,
  REQUIRED_STUDENT_VERIFICATIONS,
} from "@/lib/domain";
import type { CommitmentLevel, ClubType } from "@/lib/types/database";

/**
 * PRD 7: club creation in three steps -- founder, two student verifiers,
 * then administrator approval.
 *
 * The three-student requirement is enforced by the database
 * (submit_club_for_review), so this page only has to make the state clear.
 */
export const Route = createFileRoute("/clubs/new")({
  component: NewClubPage,
});

function NewClubPage() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto max-w-2xl">
          <NewClubFlow />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

function NewClubFlow() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const createClub = useCreateClub();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ClubType | null>(null);
  const [commitment, setCommitment] = useState<CommitmentLevel>("medium");
  const [fields, setFields] = useState<string[]>([]);
  const [customField, setCustomField] = useState("");
  const [room, setRoom] = useState("");
  const [meetingDay, setMeetingDay] = useState<string>("");
  const [meetingTime, setMeetingTime] = useState("");

  const [clubId, setClubId] = useState<string | null>(null);

  const toggleField = (field: string) => {
    setFields((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field],
    );
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const club = await createClub.mutateAsync({
      name,
      type: type ?? "recreational",
      commitment,
      fields,
      room,
      meetingDay: meetingDay || null,
      meetingTime: meetingTime || null,
      description,
    });
    setClubId(club.id);
  };

  if (clubId) {
    return <VerificationStep clubId={clubId} onDone={() => navigate({ to: "/" })} />;
  }

  return (
    <>
      <PageHeader
        title="Start a new club"
        description="Tell us the basics. You will need two other students to confirm the club before it goes live."
      />

      <form onSubmit={handleCreate}>
        <Card>
          <CardHeader>
            <CardTitle>About the club</CardTitle>
            <CardDescription>
              This information appears on the club's welcome page for other students.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="club-name">Club name</Label>
              <Input
                id="club-name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Robotics Team"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="club-description">What does the club do?</Label>
              <Textarea
                id="club-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="We design and build robots, then compete in regional tournaments."
              />
            </div>

            <div className="space-y-2">
              <Label>What kind of club is it?</Label>
              <div className="space-y-2">
                {CLUB_TYPES.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-aria-checked:border-primary has-aria-checked:bg-accent"
                  >
                    <input
                      type="radio"
                      name="type"
                      className="mt-1"
                      checked={type === option.value}
                      onChange={() => setType(option.value)}
                      required
                    />
                    <span>
                      <span className="block font-medium">{option.label}</span>
                      <span className="text-sm text-muted-foreground">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>How much time does it take?</Label>
              <Select
                value={commitment}
                onValueChange={(value) => setCommitment(value as CommitmentLevel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMITMENT_LEVELS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} · {option.hours}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>What is it about?</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_INTERESTS.map((interest) => (
                  <Button
                    key={interest}
                    type="button"
                    variant={fields.includes(interest) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleField(interest)}
                  >
                    {interest}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Input
                  value={customField}
                  onChange={(event) => setCustomField(event.target.value)}
                  placeholder="Add your own"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const trimmed = customField.trim();
                    if (trimmed && !fields.includes(trimmed)) setFields((c) => [...c, trimmed]);
                    setCustomField("");
                  }}
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
              {fields.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {fields.map((field) => (
                    <Badge key={field} variant="secondary" className="gap-1">
                      {field}
                      <button
                        type="button"
                        aria-label={`Remove ${field}`}
                        onClick={() => toggleField(field)}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="room">Room</Label>
                <Input
                  id="room"
                  value={room}
                  onChange={(event) => setRoom(event.target.value)}
                  placeholder="Room 214"
                />
              </div>
              <div className="space-y-2">
                <Label>Meeting day</Label>
                <Select value={meetingDay} onValueChange={setMeetingDay}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a day" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_DAYS.map((day) => (
                      <SelectItem key={day} value={day}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Meeting time</Label>
                <Select value={meetingTime} onValueChange={setMeetingTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a time" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_MEETING_TIMES.map((time) => (
                      <SelectItem key={time.value} value={time.value}>
                        {time.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={createClub.isPending}>
              {createClub.isPending ? <SkeletonSpinner /> : null}
              Create club and get verification code
            </Button>
          </CardContent>
        </Card>
      </form>

      {createClub.error ? (
        <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {createClub.error.message}
        </p>
      ) : null}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Creating as {profile?.full_name || profile?.email}
      </p>
    </>
  );
}

/**
 * Steps 2 and 3 of PRD 7. The count is read back from the database rather
 * than tracked locally, so the progress indicator cannot drift from reality.
 */
function VerificationStep({ clubId, onDone }: { clubId: string; onDone: () => void }) {
  const verifications = useClubVerifications(clubId);
  const verify = useVerifyClub();
  const submit = useSubmitClubForReview();

  const verifiedCount = verifications.data?.length ?? 0;
  const complete = verifiedCount >= REQUIRED_STUDENT_VERIFICATIONS;

  return (
    <>
      <PageHeader
        title="Confirm your club"
        description="Three students in total are required. You are the founder; two other students need to confirm."
      />

      <Card>
        <CardHeader>
          <CardTitle>Student verification</CardTitle>
          <CardDescription>
            Share this club with two classmates so they can confirm it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>
                  {verifiedCount} of {REQUIRED_STUDENT_VERIFICATIONS} students
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, (verifiedCount / REQUIRED_STUDENT_VERIFICATIONS) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {verifications.data && verifications.data.length > 0 ? (
            <ul className="space-y-1.5">
              {verifications.data.map((verification) => (
                <li key={verification.id} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-primary" />
                  <span>{verification.kind === "founder" ? "Founder" : "Verifier"}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {!complete ? (
            <>
              <p className="text-sm text-muted-foreground">
                Once two other students have confirmed, you can send this to an administrator for
                approval.
              </p>
              <Button
                onClick={() => verify.mutate(clubId)}
                disabled={verify.isPending}
                variant="outline"
                className="w-full"
              >
                {verify.isPending ? <SkeletonSpinner /> : null}I am one of
                the verifiers
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                All three students are confirmed. An administrator now needs to review the club
                before it becomes active.
              </p>
              <Button
                onClick={() => submit.mutate(clubId)}
                disabled={submit.isPending}
                className="w-full"
              >
                {submit.isPending ? <SkeletonSpinner /> : null}
                Send to administrator for approval
              </Button>
            </div>
          )}

          {verify.error || submit.error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {(verify.error ?? submit.error)?.message}
            </p>
          ) : null}

          <Button variant="ghost" className="w-full" onClick={onDone}>
            Back to Main
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
