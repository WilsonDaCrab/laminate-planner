import type { Mm } from '../num/index';

export interface Vec2 {
  x: Mm;
  y: Mm;
}

export const vec = (x: Mm, y: Mm): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const neg = (a: Vec2): Vec2 => ({ x: -a.x, y: -a.y });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** z-component of the 3D cross product; > 0 when b is counter-clockwise from a. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Unit vector; the zero vector stays zero. */
export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Rotates counter-clockwise by `angle` radians about the origin. */
export function rot(a: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** 90° counter-clockwise (left normal). */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const midpoint = (a: Vec2, b: Vec2): Vec2 => lerp(a, b, 0.5);
