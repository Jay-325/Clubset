import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Save, X } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import {
  CLUB_TYPES,
  COMMITMENT_LEVELS,
  COMMON_MEETING_TIMES,
  MEETING_DAYS,
  PRESET_INTERESTS,
} from "@/lib/domain";
import { useClubContext } from "@/lib/hooks/use-club";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ClubRow, ClubType, CommitmentLevel } from "@/lib/types/database";

/**
 * PRD 39: club settings live inside the club, not in a global settings page, so
 * whoever can manage them sees exactly what this club's members see.
 */
export const Route = createFileRoute("/clubs/$clubId/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <SettingsContent />
      </AppShell>
    </RequireAuth>
  );
}

/** Radix Select cannot hold "" as a value, so "not set" needs a sentinel. */
const UNSET = "__unset__";

/** Widened so `includes` accepts an arbitrary string from `fields`. */
const PRESET_FIELD_NAMES: readonly string[] = PRESET_INTERESTS;

interface SettingsForm {
  name: string;
  description: string;
  type: ClubType;
  commitment: CommitmentLevel;
  room: string;
  meetingDay: string;
  meetingTime: string;
  welcomeMessage: string;
  fields: string[];
  newMembersGetChatHistory: boolean;
  rsvpEnabledByDefault: boolean;
}

function SettingsContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/settings" });
  const context = useClubContext(clubId);
  const queryClient = useQueryClient();

  const club = context.data?.club ?? null;
  const permissions = context.data?.permissions ?? [];
  const isLinkedAdministrator = context.data?.isLinkedAdministrator ?? false;
  const mayManage = can(permissions, "manage_settings") || isLinkedAdministrator;

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [customField, setCustomField] = useState("");
  const [validation, setValidation] = useState<string | null>(null);

  // Re-seed from the database whenever the stored row changes underneath us, so
  // the editable copy can never drift away from what members actually see.
  useEffect(() => {
    if (club) setForm(fromClub(club));
  }, [club]);

  const save = useMutation({
    mutationFn: async (next: SettingsForm) => {
      const supabase = getSupabaseClient();
      // clubs_meeting_fields_consistent (migration 02) requires meeting_day and
      // meeting_time to be both null or both set, so "" is converted to null and
      // both are always sent together -- never one without the other.
      const meetingDay = next.meetingDay === "" ? null : next.meetingDay;
      const meetingTime = next.meetingTime === "" ? null : next.meetingTime;
      const welcomeMessage = next.welcomeMessage.trim();

      const { error } = await supabase
        .from("clubs")
        .update({
          name: next.name.trim(),
          description: next.description.trim(),
          type: next.type,
          commitment: next.commitment,
          room: next.room.trim(),
          meeting_day: meetingDay,
          meeting_time: meetingTime,
          welcome_message: welcomeMessage === "" ? null : welcomeMessage,
          fields: next.fields,
          // PRD 12: whether a new member sees the chat's back catalogue.
          new_members_get_chat_history: next.newMembersGetChatHistory,
          // PRD 19: the club-wide default for RSVP on new events.
          rsvp_enabled_by_default: next.rsvpEnabledByDefault,
          updated_at: new Date().toISOString(),
        })
        .eq("id", clubId);
      if (error) throw error;
    },
    onSuccess: () => {
      setValidation(null);
      void queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      void queryClient.invalidateQueries({ queryKey: ["club-context", clubId] });
      void queryClient.invalidateQueries({ queryKey: ["clubs"] });
    },
  });

  const update = (patch: Partial<SettingsForm>) => {
    setForm((current) => (current === null ? current : { ...current, ...patch }));
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    if (form.name.trim() === "") {
      setValidation("The club needs a name so members can find it.");
      return;
    }
    // The pair rule is enforced here too, so the leader gets a sentence they can
    // act on instead of a database constraint error.
    if ((form.meetingDay === "") !== (form.meetingTime === "")) {
      setValidation(
        "Pick both a meeting day and a meeting time, or clear both -- a club has a day and time, or neither.",
      );
      return;
    }
    setValidation(null);
    save.mutate(form);
  };

  const addCustomField = () => {
    const value = customField.trim();
    if (value === "" || !form) return;
    if (form.fields.some((field) => field.toLowerCase() === value.toLowerCase())) {
      setCustomField("");
      return;
    }
    update({ fields: [...form.fields, value] });
    setCustomField("");
  };

  if (context.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  if (!mayManage) {
    return (
      <>
        <PageHeader title="Club settings" description="How this club presents itself." />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              You do not have permission to change club settings
            </CardTitle>
            <CardDescription>
              Settings are changed by the club role that manages settings. Ask a leader to assign
              you that role if you need it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {club ? `This club is called ${club.name}.` : "This club is not available."}{" "}
              Everything here stays exactly as the leaders left it.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  if (!club || !form) {
    return <Skeleton className="h-72 w-full" />;
  }

  const customFields = form.fields.filter((field) => !PRESET_FIELD_NAMES.includes(field));

  return (
    <>
      <PageHeader
        title="Club settings"
        description="What this club looks like and how it behaves. Only leaders with this permission can change it."
      />

      <form onSubmit={handleSave} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About the club</CardTitle>
            <CardDescription>
              This is the text students see on the public club page (PRD 8/20).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="club-name">Club name</Label>
                <Input
                  id="club-name"
                  value={form.name}
                  onChange={(event) => update({ name: event.target.value })}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="club-room">Room</Label>
                <Input
                  id="club-room"
                  value={form.room}
                  onChange={(event) => update({ room: event.target.value })}
                  placeholder="Room 214"
                  maxLength={80}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="club-description">Description</Label>
              <Textarea
                id="club-description"
                rows={3}
                value={form.description}
                onChange={(event) => update({ description: event.target.value })}
                placeholder="What the club does and who it is for."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="club-welcome">Welcome message for new members</Label>
              <Textarea
                id="club-welcome"
                rows={2}
                value={form.welcomeMessage}
                onChange={(event) => update({ welcomeMessage: event.target.value })}
                placeholder="Shown once, when someone joins."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Type and commitment</CardTitle>
            <CardDescription>
              Used when students filter and compare clubs (PRD 20/21). Plain language, no jargon.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="club-type">What kind of club is it?</Label>
              <Select
                value={form.type}
                onValueChange={(value) => update({ type: value as ClubType })}
              >
                <SelectTrigger id="club-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLUB_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {CLUB_TYPES.find((option) => option.value === form.type)?.hint ?? ""}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="club-commitment">How much time does it take?</Label>
              <Select
                value={form.commitment}
                onValueChange={(value) => update({ commitment: value as CommitmentLevel })}
              >
                <SelectTrigger id="club-commitment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMITMENT_LEVELS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {COMMITMENT_LEVELS.find((option) => option.value === form.commitment)?.hours ?? ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">When does it meet?</CardTitle>
            <CardDescription>
              A club either has a regular day and time, or neither. The database refuses to save one
              without the other, so this page always sends both.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="club-meeting-day">Meeting day</Label>
              <Select
                value={form.meetingDay === "" ? UNSET : form.meetingDay}
                onValueChange={(value) => update({ meetingDay: value === UNSET ? "" : value })}
              >
                <SelectTrigger id="club-meeting-day">
                  <SelectValue placeholder="No regular meeting day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>No regular meeting day</SelectItem>
                  {MEETING_DAYS.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="club-meeting-time">Meeting time</Label>
              <Select
                value={form.meetingTime === "" ? UNSET : form.meetingTime}
                onValueChange={(value) => update({ meetingTime: value === UNSET ? "" : value })}
              >
                <SelectTrigger id="club-meeting-time">
                  <SelectValue placeholder="No regular meeting time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>No regular meeting time</SelectItem>
                  {COMMON_MEETING_TIMES.map((slot) => (
                    <SelectItem key={slot.value} value={slot.value}>
                      {slot.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What this club is about</CardTitle>
            <CardDescription>
              Pick the interests that describe the club. Students searching for clubs use these (PRD
              4/20).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PRESET_FIELD_NAMES.map((interest) => {
                const selected = form.fields.includes(interest);
                return (
                  <Button
                    key={interest}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    onClick={() =>
                      update({
                        fields: selected
                          ? form.fields.filter((field) => field !== interest)
                          : [...form.fields, interest],
                      })
                    }
                  >
                    {interest}
                  </Button>
                );
              })}
            </div>

            {customFields.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Added by this club:</span>
                {customFields.map((field) => (
                  <span
                    key={field}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs"
                  >
                    {field}
                    <button
                      type="button"
                      aria-label={`Remove ${field}`}
                      onClick={() =>
                        update({ fields: form.fields.filter((entry) => entry !== field) })
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Input
                value={customField}
                onChange={(event) => setCustomField(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    // Keep it a chip, not a form submit, so Save is not pressed
                    // by accident while typing an interest.
                    event.preventDefault();
                    addCustomField();
                  }
                }}
                placeholder="Add your own, e.g. Robotics"
                aria-label="Add an interest"
                maxLength={40}
              />
              <Button type="button" variant="outline" onClick={addCustomField}>
                <Plus className="size-4" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How the club works</CardTitle>
            <CardDescription>Two defaults that save every leader a decision later.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">New members can read past chat messages</p>
                <p className="text-xs text-muted-foreground">
                  When off, someone who joins today sees chat from the moment they join (PRD 12).
                </p>
              </div>
              <Switch
                checked={form.newMembersGetChatHistory}
                onCheckedChange={(checked) => update({ newMembersGetChatHistory: checked })}
                aria-label="New members get chat history"
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Events ask for RSVPs by default</p>
                <p className="text-xs text-muted-foreground">
                  Leaders can still turn RSVP off for a single event (PRD 19).
                </p>
              </div>
              <Switch
                checked={form.rsvpEnabledByDefault}
                onCheckedChange={(checked) => update({ rsvpEnabledByDefault: checked })}
                aria-label="RSVPs enabled by default"
              />
            </div>
          </CardContent>
        </Card>

        {validation ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {validation}
          </p>
        ) : null}
        {save.error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {save.error.message}
          </p>
        ) : null}
        {save.isSuccess && !save.isPending ? (
          <p className="rounded-md bg-accent/50 px-3 py-2 text-sm">Saved.</p>
        ) : null}

        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <SkeletonSpinner /> : <Save className="size-4" />}
          Save settings
        </Button>
      </form>
    </>
  );
}

function fromClub(club: ClubRow): SettingsForm {
  return {
    name: club.name,
    description: club.description,
    type: club.type,
    commitment: club.commitment,
    room: club.room,
    meetingDay: club.meeting_day ?? "",
    meetingTime: club.meeting_time ?? "",
    welcomeMessage: club.welcome_message ?? "",
    fields: [...club.fields],
    newMembersGetChatHistory: club.new_members_get_chat_history,
    rsvpEnabledByDefault: club.rsvp_enabled_by_default,
  };
}
