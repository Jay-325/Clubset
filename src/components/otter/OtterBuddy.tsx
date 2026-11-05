"use client";

import { useCallback, useState } from "react";

import { useIdle } from "@/lib/hooks/use-idle";
import { useOtterOverride } from "@/components/otter/OtterContext";

type OtterState = "idle" | "swimming" | "eating" | "sleeping" | "working";

interface OtterBuddyProps {
  /** Current otter state. Defaults to idle. */
  state?: OtterState;
  /** Speech bubble text shown on hover. */
  message?: string;
  /** Click handler. */
  onClick?: () => void;
}

const STATE_CONFIG: Record<OtterState, { poseClass: string; animClass: string }> = {
  idle: { poseClass: "pose-idle", animClass: "anim-idle" },
  swimming: { poseClass: "pose-swimming", animClass: "anim-swimming" },
  eating: { poseClass: "pose-eating", animClass: "anim-eating" },
  sleeping: { poseClass: "pose-sleeping", animClass: "anim-sleeping" },
  working: { poseClass: "pose-working", animClass: "anim-idle" },
};

export function OtterBuddy({ state: propState = "idle", message, onClick }: OtterBuddyProps) {
  const isIdle = useIdle();
  const [isHovered, setIsHovered] = useState(false);
  const { overrideState } = useOtterOverride();

  // Context override takes precedence (e.g. eating celebration), then inactivity, then prop state.
  const state: OtterState = overrideState ?? (isIdle ? "sleeping" : propState);

  const { poseClass, animClass } = STATE_CONFIG[state];
  const bubbleText =
    message ??
    (() => {
      switch (state) {
        case "idle":
          return "Hey there! Ready for club time?";
        case "swimming":
          return "Diving into your events!";
        case "eating":
          return "Fuel for club management!";
        case "sleeping":
          return "Zzz... I'll nap if you're away.";
        case "working":
          return "Let's organize your club data!";
      }
    })();

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  return (
    <div
      className="otter-buddy"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      aria-label="Otter buddy"
    >
      {isHovered && (
        <div className="otter-bubble">
          <strong className="text-rose-dark">Otter:</strong> {bubbleText}
        </div>
      )}
      <div className={`otter-view ${poseClass} ${animClass}`} aria-hidden="true">
        🦭
      </div>
    </div>
  );
}
