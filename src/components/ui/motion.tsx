"use client";

import * as React from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  staggerStyle,
  motion,
  pressScale,
  durationClasses,
  easeClasses,
  REDUCED_MOTION_QUERY,
} from "@/lib/motion";

export { staggerStyle, motion, pressScale, durationClasses, easeClasses, REDUCED_MOTION_QUERY };

/**
 * A simple entrance container: fades content in when it mounts. Use for
 * empty states, panels and secondary content that settles after primary
 * content (principle 6).
 */
export function FadeIn({
  children,
  className,
  duration = motion.duration.normal,
}: {
  children: ReactNode;
  className?: string;
  duration?: (typeof motion.duration)[keyof typeof motion.duration];
}) {
  return (
    <div className={cn("animate-in fade-in ease-out", `duration-[${duration}ms]`, className)}>
      {children}
    </div>
  );
}

/**
 * A directional entrance container for conditional fields, composer trays and
 * message panels that slide into place. Use when content appears alongside
 * existing UI rather than replacing it (principle 16).
 */
export function SlideIn({
  children,
  className,
  side = "bottom",
  duration = motion.duration.normal,
}: {
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  duration?: (typeof motion.duration)[keyof typeof motion.duration];
}) {
  const slideClass = {
    top: "slide-in-from-top-2",
    bottom: "slide-in-from-bottom-2",
    left: "slide-in-from-left-2",
    right: "slide-in-from-right-2",
  }[side];

  return (
    <div
      className={cn(
        "animate-in fade-in ease-out",
        slideClass,
        `duration-[${duration}ms]`,
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Wraps a list of children so each row fades in with a small, increasing
 * delay. Renders children without adding a DOM node so it drops into any
 * existing `.map()` list unchanged.
 *
 * Principle 3: staggered list rows with ~30 ms delays.
 */
export function StaggeredList({
  children,
  delayMs = motion.stagger,
  baseClass = "animate-in fade-in",
}: {
  children: ReactNode[];
  delayMs?: number;
  baseClass?: string;
}) {
  return (
    <>
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        type StaggeredChildProps = { className?: string; style?: React.CSSProperties };
        const element = child as React.ReactElement<StaggeredChildProps>;
        const baseStyle = (element.props.style ?? {}) as React.CSSProperties;
        return React.cloneElement(element, {
          key: element.key ?? index,
          className: cn(element.props.className, baseClass),
          style: { ...baseStyle, animationDelay: `${index * delayMs}ms` },
        });
      })}
    </>
  );
}
