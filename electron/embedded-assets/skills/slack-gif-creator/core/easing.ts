#!/usr/bin/env npx tsx
/**
 * Easing Functions - Timing functions for smooth animations.
 *
 * Provides various easing functions for natural motion and timing.
 * All functions take a value t (0.0 to 1.0) and return eased value (0.0 to 1.0).
 */

export function linear(t: number): number {
  return t;
}

export function easeInQuad(t: number): number {
  return t * t;
}

export function easeOutQuad(t: number): number {
  return t * (2 - t);
}

export function easeInOutQuad(t: number): number {
  if (t < 0.5) {
    return 2 * t * t;
  }
  return -1 + (4 - 2 * t) * t;
}

export function easeInCubic(t: number): number {
  return t * t * t;
}

export function easeOutCubic(t: number): number {
  return (t - 1) * (t - 1) * (t - 1) + 1;
}

export function easeInOutCubic(t: number): number {
  if (t < 0.5) {
    return 4 * t * t * t;
  }
  return (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}

export function easeOutBounce(t: number): number {
  if (t < 1 / 2.75) {
    return 7.5625 * t * t;
  } else if (t < 2 / 2.75) {
    const t2 = t - 1.5 / 2.75;
    return 7.5625 * t2 * t2 + 0.75;
  } else if (t < 2.5 / 2.75) {
    const t2 = t - 2.25 / 2.75;
    return 7.5625 * t2 * t2 + 0.9375;
  } else {
    const t2 = t - 2.625 / 2.75;
    return 7.5625 * t2 * t2 + 0.984375;
  }
}

export function easeInBounce(t: number): number {
  return 1 - easeOutBounce(1 - t);
}

export function easeInOutBounce(t: number): number {
  if (t < 0.5) {
    return easeInBounce(t * 2) * 0.5;
  }
  return easeOutBounce(t * 2 - 1) * 0.5 + 0.5;
}

export function easeInElastic(t: number): number {
  if (t === 0 || t === 1) {
    return t;
  }
  return -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
}

export function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) {
    return t;
  }
  return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
}

export function easeInOutElastic(t: number): number {
  if (t === 0 || t === 1) {
    return t;
  }
  const t2 = t * 2 - 1;
  if (t2 < 0) {
    return (
      -0.5 * Math.pow(2, 10 * t2) * Math.sin((t2 - 0.1) * 5 * Math.PI)
    );
  }
  return (
    Math.pow(2, -10 * t2) * Math.sin((t2 - 0.1) * 5 * Math.PI) * 0.5 + 1
  );
}

export function easeBackIn(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
}

export function easeBackOut(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeBackInOut(t: number): number {
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  if (t < 0.5) {
    return (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2;
  }
  return (
    (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2
  );
}

export type EasingFunction = (t: number) => number;

/** Convenience mapping of easing function names to functions. */
export const EASING_FUNCTIONS: Record<string, EasingFunction> = {
  linear,
  ease_in: easeInQuad,
  ease_out: easeOutQuad,
  ease_in_out: easeInOutQuad,
  bounce_in: easeInBounce,
  bounce_out: easeOutBounce,
  bounce: easeInOutBounce,
  elastic_in: easeInElastic,
  elastic_out: easeOutElastic,
  elastic: easeInOutElastic,
  back_in: easeBackIn,
  back_out: easeBackOut,
  back_in_out: easeBackInOut,
  anticipate: easeBackIn, // Alias
  overshoot: easeBackOut, // Alias
};

/** Get easing function by name. */
export function getEasing(name: string = "linear"): EasingFunction {
  return EASING_FUNCTIONS[name] || linear;
}

/**
 * Interpolate between two values with easing.
 *
 * @param start - Start value
 * @param end - End value
 * @param t - Progress from 0.0 to 1.0
 * @param easing - Name of easing function
 * @returns Interpolated value
 */
export function interpolate(
  start: number,
  end: number,
  t: number,
  easing: string = "linear"
): number {
  const easeFunc = getEasing(easing);
  const easedT = easeFunc(t);
  return start + (end - start) * easedT;
}

/**
 * Calculate squash and stretch scales for more dynamic animation.
 *
 * @param baseScale - [width_scale, height_scale] base scales
 * @param intensity - Squash/stretch intensity (0.0-1.0)
 * @param direction - 'vertical', 'horizontal', or 'both'
 * @returns [width_scale, height_scale] with squash/stretch applied
 */
export function applySquashStretch(
  baseScale: [number, number],
  intensity: number,
  direction: string = "vertical"
): [number, number] {
  let [widthScale, heightScale] = baseScale;

  if (direction === "vertical") {
    heightScale *= 1 - intensity * 0.5;
    widthScale *= 1 + intensity * 0.5;
  } else if (direction === "horizontal") {
    widthScale *= 1 - intensity * 0.5;
    heightScale *= 1 + intensity * 0.5;
  } else if (direction === "both") {
    widthScale *= 1 - intensity * 0.3;
    heightScale *= 1 - intensity * 0.3;
  }

  return [widthScale, heightScale];
}

/**
 * Calculate position along a parabolic arc (natural motion path).
 *
 * @param start - [x, y] starting position
 * @param end - [x, y] ending position
 * @param height - Arc height at midpoint (positive = upward)
 * @param t - Progress (0.0-1.0)
 * @returns [x, y] position along arc
 */
export function calculateArcMotion(
  start: [number, number],
  end: [number, number],
  height: number,
  t: number
): [number, number] {
  const [x1, y1] = start;
  const [x2, y2] = end;

  // Linear interpolation for x
  const x = x1 + (x2 - x1) * t;

  // Parabolic interpolation for y
  const arcOffset = 4 * height * t * (1 - t);
  const y = y1 + (y2 - y1) * t - arcOffset;

  return [x, y];
}
