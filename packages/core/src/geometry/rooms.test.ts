import { describe, expect, it } from 'vitest';
import { shapesArea } from './clip';
import { referenceRooms } from './fixtures/rooms';
import { isSimple } from './polygon';
import { buildZone } from './zone';

describe('F1 acceptance: reference rooms', () => {
  for (const room of referenceRooms) {
    it(`${room.name}: zone area matches the hand-computed value`, () => {
      const r = buildZone(room.input);
      expect(r.warnings).toEqual([]);
      expect(r.shapes).toHaveLength(1);
      const shape = r.shapes[0]!;
      expect(shape.holes).toHaveLength(room.holes);
      expect(isSimple(shape.outer)).toBe(true);
      expect(Math.abs(shapesArea(r.shapes) - room.expectedArea)).toBeLessThanOrEqual(
        room.tolerance,
      );
    });
  }

  it('straight-walled rooms are exact to ±0.5 mm² unless their walls are on the grid bound', () => {
    for (const room of referenceRooms.filter((x) => !x.hasArcs && !x.gridBound)) {
      expect(room.tolerance).toBeLessThanOrEqual(0.5);
    }
  });
});
