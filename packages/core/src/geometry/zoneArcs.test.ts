import { describe, expect, it } from 'vitest';
import { rectangle, semicircleBayAndColumn } from './fixtures/rooms';
import { buildZone } from './zone';

describe('arc edge recovery (ADR-011 follow-up)', () => {
  it('marks every edge of the semicircular bay and no straight wall', () => {
    const { shapes, edgeSources } = buildZone(semicircleBayAndColumn.input);
    expect(edgeSources).toHaveLength(shapes.length);
    const outer = shapes[0]!.outer;
    const src = edgeSources[0]!.outer;
    expect(src).toHaveLength(outer.length);

    const arcEdges = src.filter((s) => s !== null);
    expect(arcEdges.length).toBeGreaterThanOrEqual(8);
    expect(arcEdges.every((s) => s === 1)).toBe(true);

    // Straight edges (the walls and the jump to the bay) must not be marked.
    outer.forEach((p, k) => {
      const q = outer[(k + 1) % outer.length]!;
      const onStraightWall =
        (p.y === q.y && (p.y === 10 || p.y === 2990)) || (p.x === q.x && p.x === 10);
      if (onStraightWall) expect(src[k]).toBeNull();
    });
  });

  it('does not mark the edges around the round column (obstacle, not outline arc)', () => {
    const { edgeSources } = buildZone(semicircleBayAndColumn.input);
    for (const hole of edgeSources[0]!.holes) expect(hole.every((s) => s === null)).toBe(true);
  });

  it('marks nothing in a room without arcs', () => {
    const { edgeSources } = buildZone(rectangle.input);
    expect(edgeSources[0]!.outer.every((s) => s === null)).toBe(true);
  });
});
