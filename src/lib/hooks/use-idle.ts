"use client";

import { useEffect, useState } from "react";

/**
 * Tracks mouse, keyboard, scroll, and touch events.
 * Returns true after `timeoutMs` of inactivity. Resets on any interaction.
 * Default timeout: 5 minutes.
 */
export function useIdle({ timeoutMs = 5 * 60 * 1000 }: { timeoutMs?: number } = {}) {
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      if (isIdle) setIsIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIsIdle(true), timeoutMs);
    };

    const events = ["mousemove", "mousedown", "keypress", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));

    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [timeoutMs, isIdle]);

  return isIdle;
}
