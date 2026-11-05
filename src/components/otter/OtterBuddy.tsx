"use client";

import { useState } from "react";

import { useUpcomingEvents } from "@/lib/queries";
import type { UpcomingEventResult } from "@/lib/types/database";

interface OtterBuddyProps {
  /** Click handler. */
  onClick?: () => void;
}

/**
 * Floating otter mascot in the bottom-right corner.
 *
 * Shows the idle (eating) otter by default and swaps to the paw-up otter on
 * hover, growing slightly with a smooth transition. On hover it also speaks
 * the user's next club meeting, pulled from their calendar.
 */
export function OtterBuddy({ onClick }: OtterBuddyProps = {}) {
  const [isHovered, setIsHovered] = useState(false);
  const { data: upcoming = [] } = useUpcomingEvents();

  // Soonest upcoming event across all of the user's clubs.
  const nextEvent = [...upcoming].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  )[0];

  return (
    <div
      className="otter-buddy"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      aria-label="Otter buddy"
    >
      {isHovered && (
        <div className="otter-bubble">
          <strong className="text-rose-dark">Otter:</strong> {meetingMessage(nextEvent)}
        </div>
      )}
      <div className="otter-view" aria-hidden="true" />
    </div>
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
