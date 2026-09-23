import { describe, expect, it } from 'vitest';
import { hasHeadcountCapacity, reservedHeadcount } from './availability.js';

describe('headcount availability', () => {
  const start = new Date('2026-09-14T09:00:00.000Z');
  const end = new Date('2026-09-14T10:00:00.000Z');
  it('reserves unassigned confirmed segments without double counting explicit assignments', () => {
    const reservations = [
      { start, end, status: 'CONFIRMED' as const, requiredStaffCount: 2, assignedStaffCount: 0 },
      { start, end, status: 'IN_PROGRESS' as const, requiredStaffCount: 1, assignedStaffCount: 1 },
    ];
    expect(reservedHeadcount(start, end, reservations)).toBe(3);
    expect(hasHeadcountCapacity(start, end, 1, 3, reservations)).toBe(false);
    expect(hasHeadcountCapacity(start, end, 1, 4, reservations)).toBe(true);
  });
  it('does not treat adjacent half-open segments as overlapping', () => {
    const reservations = [
      {
        start: new Date('2026-09-14T10:00:00.000Z'),
        end: new Date('2026-09-14T11:00:00.000Z'),
        status: 'CONFIRMED' as const,
        requiredStaffCount: 1,
        assignedStaffCount: 0,
      },
    ];
    expect(reservedHeadcount(start, end, reservations)).toBe(0);
  });
});
