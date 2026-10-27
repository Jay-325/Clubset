import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { LogOut, Plus, X } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { SkeletonSpinner } from "@/components/ui/skeleton";
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
import { useAuth } from "@/lib/auth/context";
import { useChangePassword, useUpdateProfile } from "@/lib/queries";
import { GRADE_LABELS, PRESET_INTERESTS, WEEKLY_HOUR_OPTIONS } from "@/lib/domain";
import type { GradeLevel } from "@/lib/types/database";

/**
 * PRD 39: general account settings only. Anything that belongs to a single
 * club (roles, meetings, RSVPs, forms) stays inside that club so a student
 * never has to guess where a setting lives.
 */
export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto max-w-2xl">
          <SettingsContent />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

function SettingsContent() {
  const { profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [grade, setGrade] = useState<GradeLevel | null>(profile?.grade ?? null);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [customInterest, setCustomInterest] = useState("");
  const [commitmentHours, setCommitmentHours] = useState<number | null>(
    profile?.commitment_hours ?? null,
  );
  const [saved, setSaved] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const toggleInterest = (interest: string) => {
    setSaved(false);
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await updateProfile.mutateAsync({
      full_name: fullName,
      grade,
      interests,
      commitment_hours: commitmentHours,
    });
    await refreshProfile();
    setSaved(true);
  };

  const handlePasswordChange = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    try {
      await changePassword.mutateAsync({ password: newPassword });
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated.");
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? error.message
          : "We couldn't update your password. Please try again.",
      );
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your account and how Clubset finds clubs for you."
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Interests and weekly hours are used to recommend clubs you would actually enjoy (PRD
            21). Neither is shown to anyone else.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="settings-email">School email</Label>
              {/* PRD 5: the email is the identity the backend checks, so it is
                  shown but never editable here. */}
              <Input id="settings-email" value={profile?.email ?? ""} readOnly disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-name">Your name</Label>
              <Input
                id="settings-name"
                required
                value={fullName}
                onChange={(event) => {
                  setSaved(false);
                  setFullName(event.target.value);
                }}
                placeholder="Alex Rivera"
              />
            </div>

            <div className="space-y-2">
              <Label>Grade level</Label>
              {/* Radix treats "" as "no selection", which keeps the placeholder
                  showing without passing an explicit undefined value. */}
              <Select
                value={grade ?? ""}
                onValueChange={(value) => {
                  setSaved(false);
                  setGrade(value as GradeLevel);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select your grade" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(GRADE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>What are you interested in?</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_INTERESTS.map((interest) => (
                  <Button
                    key={interest}
                    type="button"
                    variant={interests.includes(interest) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleInterest(interest)}
                  >
                    {interest}
                  </Button>
                ))}
              </div>

              {/* PRD 4: presets plus anything the student invents themselves. */}
              <div className="flex gap-2 pt-1">
                <Input
                  value={customInterest}
                  onChange={(event) => setCustomInterest(event.target.value)}
                  placeholder="Add your own interest"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const trimmed = customInterest.trim();
                    if (trimmed && !interests.includes(trimmed)) {
                      setInterests((current) => [...current, trimmed]);
                      setSaved(false);
                    }
                    setCustomInterest("");
                  }}
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>

              {interests.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {interests.map((interest) => (
                    <Badge key={interest} variant="secondary" className="gap-1">
                      {interest}
                      <button
                        type="button"
                        aria-label={`Remove ${interest}`}
                        onClick={() => toggleInterest(interest)}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>How many hours a week can you give to clubs?</Label>
              <Select
                value={commitmentHours?.toString() ?? ""}
                onValueChange={(value) => {
                  setSaved(false);
                  setCommitmentHours(Number(value));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {WEEKLY_HOUR_OPTIONS.map((hours) => (
                    <SelectItem key={hours} value={hours.toString()}>
                      {hours} {hours === 1 ? "hour" : "hours"} a week
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Optional. Only used to recommend clubs that match your schedule.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? <SkeletonSpinner /> : null}
                Save changes
              </Button>
              {saved ? <span className="text-sm text-muted-foreground">Saved.</span> : null}
            </div>

            {updateProfile.error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {updateProfile.error.message}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {/* Any flow that sets a password goes through the leaked-password guard
          before Supabase Auth stores it. */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Choose a password that has not appeared in a known data breach. If you normally sign in
            with a one-time email link, setting a password is optional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-new-password">New password</Label>
              <Input
                id="settings-new-password"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(event) => {
                  setPasswordMessage(null);
                  setPasswordError(null);
                  setNewPassword(event.target.value);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-confirm-password">Confirm new password</Label>
              <Input
                id="settings-confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => {
                  setPasswordMessage(null);
                  setPasswordError(null);
                  setConfirmPassword(event.target.value);
                }}
              />
            </div>

            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending ? <SkeletonSpinner /> : null}
              Update password
            </Button>

            {passwordMessage ? (
              <p className="text-sm text-muted-foreground">{passwordMessage}</p>
            ) : null}

            {passwordError ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {passwordError}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {/* PRD 39: signing out belongs to the account, not to any one club. */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Sign out of Clubset on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              void signOut().then(() => navigate({ to: "/login" }));
            }}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
