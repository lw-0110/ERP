export type ReservationSegment = {
  start: Date;
  end: Date;
  requiredStaffCount: number;
  status: 'CONFIRMED' | 'IN_PROGRESS';
  assignedStaffCount: number;
};

export function overlaps(start: Date, end: Date, otherStart: Date, otherEnd: Date) {
  return start < otherEnd && otherStart < end;
}

export function reservedHeadcount(start: Date, end: Date, reservations: ReservationSegment[]) {
  const relevant = reservations.filter((reservation) =>
    overlaps(start, end, reservation.start, reservation.end),
  );
  const boundaries = [
    start.getTime(),
    ...relevant.map((r) => Math.max(start.getTime(), r.start.getTime())),
  ].sort((a, b) => a - b);
  return Math.max(
    0,
    ...boundaries.map((point) =>
      relevant
        .filter((r) => r.start.getTime() <= point && point < r.end.getTime())
        .reduce((total, r) => total + Math.max(r.requiredStaffCount, r.assignedStaffCount), 0),
    ),
  );
}

export function hasHeadcountCapacity(
  start: Date,
  end: Date,
  requiredStaffCount: number,
  eligibleStaffCount: number,
  reservations: ReservationSegment[],
) {
  return eligibleStaffCount - reservedHeadcount(start, end, reservations) >= requiredStaffCount;
}
