/**
 * Centralized motion configuration for Clubset.
 *
 * All durations, easing curves and reusable animation class strings live here
 * so similar interactions stay consistent across routes. Values are chosen to
 * keep the UI snappy: entrances are quick (~150–250 ms), exits are shorter
 * (~20 % less), and staggered lists delay each row by ~30 ms.
 *
 * Every duration below maps to a Tailwind `duration-*` utility (or an
 * arbitrary `duration-[Nms]` value) so it can be applied directly as a class.
 */

import type { CSSProperties } from "react";

export const motion = {
  /** Durations in milliseconds. */
  duration: {
    instant: 0,
    /** Dropdowns and contextual menus (principle 2). */
    fast: 150,
    /** Dialogs, popovers and page transitions. */
    normal: 250,
    /** Sheets and backdrop transitions. */
    slow: 350,
    /** Dismissal is ~20 % shorter than entrance (principle 15). */
    exit: 120,
  },
  /** CSS easing curves. */
  ease: {
    /** Smooth ease-out for entrances (principle 1). */
    out: "cubic-bezier(0.4, 0, 0.2, 1)",
    /** Smooth ease-in-out for elements changing position (principle 9). */
    inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    linear: "linear",
  },
  /** Delay between staggered list rows in milliseconds (principle 3). */
  stagger: 30,
  /** Scale applied to an interactive element while pressed (principle 4). */
  pressScale: 0.97,
} as const;

/** Tailwind duration classes matching `motion.duration`. */
export const durationClasses = {
  instant: "duration-0",
  fast: "duration-150",
  normal: "duration-250",
  slow: "duration-350",
  exit: "duration-120",
} as const;

/** Tailwind timing-function classes. `ease-out` is not a default Tailwind
 *  timing function, so we expose an arbitrary-value class. */
export const easeClasses = {
  out: "ease-[cubic-bezier(0.4,0,0.2,1)]",
  inOut: "ease-[cubic-bezier(0.4,0,0.2,1)]",
  linear: "ease-linear",
} as const;

/** Media query used to gate motion off when the user prefers reduced motion. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Tailwind class that scales an element toward 0.97 while pressed
 * (principle 4: press feedback).
 */
export const pressScale = "active:scale-[0.97] transition-transform duration-150 ease-out";

/**
 * Returns a staggered `style` object for the nth item in a list. Intended for
 * inline use inside `.map()` bodies so callers keep full control over markup.
 *
 * Principle 3: staggered list rows with ~30 ms delays.
 */
export function staggerStyle(index: number, delayMs = motion.stagger): CSSProperties {
  return { animationDelay: `${index * delayMs}ms` };
}
