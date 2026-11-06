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
 * Shows the shell-holding otter by default. On hover or focus, crossfades
 * to the greeting (paw-up) otter. Clicking toggles a speech bubble with the
 * user's next upcoming club meeting, pulled from their calendar.
 */
export function OtterBuddy({ onClick }: OtterBuddyProps = {}) {
  const { data: upcoming = [], isPending: isLoading } = useUpcomingEvents();
  const [bubbleOpen, setBubbleOpen] = useState(false);

  // Soonest upcoming event across all of the user's clubs.
  const nextEvent = [...upcoming].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  )[0];

  const toggleBubble = () => setBubbleOpen((prev) => !prev);

  return (
    <button
      type="button"
      className="otter-buddy"
      onClick={toggleBubble}
      onFocus={() => setBubbleOpen(false)}
      aria-label="Otter buddy"
      aria-expanded={bubbleOpen}
      data-bubble={bubbleOpen}
    >
      {/* Layered images for opacity crossfade. */}
      <div className="otter-view otter-idle-image" aria-hidden="true" />
      <div className="otter-view otter-hover-image" aria-hidden="true" />
      {bubbleOpen && (
        <div className="otter-bubble" role="status" aria-live="polite">
          <strong className="text-rose-dark">Otter:</strong> {meetingMessage(isLoading, nextEvent)}
        </div>
      )}
    </button>
  );
}

/** Build the speech-bubble line from the next calendar event. */
function meetingMessage(isLoading: boolean, event: UpcomingEventResult | undefined): string {
  if (isLoading) return "Checking your calendar...";

  if (!event) return "Nothing on your calendar yet. Have a great day!";

  const starts = new Date(event.starts_at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(starts);
  eventDay.setHours(0, 0, 0, 0);

  if (eventDay.getTime() === today.getTime()) {
    return `Hey! You've got "${event.title}" today at ${starts.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}.`;
  }

  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  return `Your next club meeting is "${event.title}" on ${starts.toLocaleDateString(
    undefined,
    options,
  )}.`;
}
