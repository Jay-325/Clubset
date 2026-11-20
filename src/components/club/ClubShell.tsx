import { RequireAuth } from "@/components/app-shell";
import { AppShell } from "@/components/app-shell";

/**
 * Shell wrapper for club-specific routes.
 *
 * Wraps children in RequireAuth + AppShell so every club route doesn't
 * repeat the same pattern.
 */
export function ClubShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
