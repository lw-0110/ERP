import { BadRequestException } from '@nestjs/common';

export type CountSnapshot = { id: string; requiredCount: number };
export type ResourceCountSnapshot = { resourceTypeId: string; requiredCount: number };
export type SkillCountSnapshot = { skillId: string; requiredCount: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertCountSnapshots(
  value: unknown,
  key: 'skillId',
): asserts value is SkillCountSnapshot[];
export function assertCountSnapshots(
  value: unknown,
  key: 'resourceTypeId',
): asserts value is ResourceCountSnapshot[];
export function assertCountSnapshots(value: unknown, key: 'skillId' | 'resourceTypeId') {
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        !entry ||
        typeof entry !== 'object' ||
        !uuid.test(String((entry as Record<string, unknown>)[key])) ||
        !Number.isInteger((entry as Record<string, unknown>).requiredCount) ||
        Number((entry as Record<string, unknown>).requiredCount) < 1,
    )
  )
    throw new BadRequestException('Invalid immutable booking requirement snapshot.');
  const ids = value.map((entry) => (entry as Record<string, unknown>)[key]);
  if (new Set(ids).size !== ids.length)
    throw new BadRequestException('Duplicate immutable booking requirements.');
}
export function assertSkillIds(value: unknown): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== 'string' || !uuid.test(id)) ||
    new Set(value).size !== value.length
  )
    throw new BadRequestException('Invalid skill ID snapshot.');
}

export function sequentialDurationMinutes(
  lines: Array<{
    quantity: number;
    durationMinutesSnapshot: number;
    bufferBeforeMinutesSnapshot: number;
    bufferAfterMinutesSnapshot: number;
  }>,
) {
  const minutes = lines.reduce(
    (total, line) =>
      total +
      line.quantity *
        (line.durationMinutesSnapshot +
          line.bufferBeforeMinutesSnapshot +
          line.bufferAfterMinutesSnapshot),
    0,
  );
  if (!Number.isInteger(minutes) || minutes < 1)
    throw new BadRequestException('Booking duration must be positive.');
  return minutes;
}
