"use client";

import { useUpcomingEvents } from "@/lib/queries";
import type { UpcomingEventResult } from "@/lib/types/database";

interface OtterBuddyProps {
  /** Click handler. */
  onClick?: () => void;
}

/**
 * Floating otter mascot in the bottom-right corner.
 *
 * Shows the idle (shell-holding) otter by default and swaps to the
 * greeting (paw-up) otter on hover or focus, with a subtle scale effect.
 * A speech bubble with the user's next club meeting appears on hover/focus.
 */
export function OtterBuddy({ onClick }: OtterBuddyProps = {}) {
  const { data: upcoming = [] } = useUpcomingEvents();

  // Soonest upcoming event across all of the user's clubs.
  const nextEvent = [...upcoming].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  )[0];

  return (
    <button type="button" className="otter-buddy" onClick={onClick} aria-label="Otter buddy">
      <div className="otter-bubble">
        <strong className="text-rose-dark">Otter:</strong> {meetingMessage(nextEvent)}
      </div>
      <div className="otter-view" aria-hidden="true" />
    </button>
  );
}

/** Build the hover speech-bubble line from the next calendar event. */
function meetingMessage(event: UpcomingEventResult | undefined): string {
  if (!event) return "No upcoming club meetings.";

  const starts = new Date(event.starts_at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(starts);
  eventDay.setHours(0, 0, 0, 0);

  if (eventDay.getTime() === today.getTime()) {
    return `You have a club meeting today — Priority: ${event.priority}`;
  }

  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  return `Next meeting: ${event.title} on ${starts.toLocaleDateString(undefined, options)}`;
}
