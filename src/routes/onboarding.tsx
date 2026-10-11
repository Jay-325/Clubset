import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, X } from "lucide-react";

import { AppShell } from "@/components/app-shell";
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
import { Badge } from "@/components/ui/badge";
import { SkeletonSpinner } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/context";
import { useUpdateProfile } from "@/lib/queries";
import { GRADE_LABELS, PRESET_INTERESTS, WEEKLY_HOUR_OPTIONS } from "@/lib/domain";
import type { GradeLevel } from "@/lib/types/database";

/**
 * PRD 4: name, grade level, interests, optional weekly commitment.
 * Interests and commitment power discovery and recommendations (PRD 21).
 */
export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [grade, setGrade] = useState<GradeLevel | null>(profile?.grade ?? null);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [customInterest, setCustomInterest] = useState("");
  const [commitmentHours, setCommitmentHours] = useState<number | null>(
    profile?.commitment_hours ?? null,
  );

  const toggleInterest = (interest: string) => {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await updateProfile.mutateAsync({
      full_name: fullName,
      grade,
      interests,
      commitment_hours: commitmentHours,
    });
    await refreshProfile();
    void navigate({ to: "/" });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Set up your profile</CardTitle>
            <CardDescription>
              This helps Joinin show you clubs you would actually enjoy. You can change it later in
              Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Alex Rivera"
                />
              </div>

              <div className="space-y-2">
                <Label>Grade level</Label>
                <Select
                  value={grade ?? ""}
                  onValueChange={(value) => setGrade(value as GradeLevel)}
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

                {/* PRD 4: students can add their own interests. */}
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
                  onValueChange={(value) => setCommitmentHours(Number(value))}
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
                  Only used to recommend clubs that match your schedule.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? <SkeletonSpinner /> : null}
                Finish setup
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
