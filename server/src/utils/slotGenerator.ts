export interface BookedRange {
  startTime: Date;
  endTime: Date;
}

export interface GenerateTimeSlotsInput {
  workStart: string;
  workEnd: string;
  durationMinutes: number;
  bufferMinutes: number;
  bookedRanges: BookedRange[];
  dateStr: string;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

const MS_PER_MINUTE = 60_000;

function parseUtcDateTime(dateStr: string, timeStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

/**
 * Generate UTC time slots across a daily working window and mark overlaps against bookedRanges.
 */
export function generateTimeSlots({
  workStart,
  workEnd,
  durationMinutes,
  bufferMinutes,
  bookedRanges,
  dateStr,
}: GenerateTimeSlotsInput): TimeSlot[] {
  if (durationMinutes <= 0 || bufferMinutes < 0) {
    return [];
  }

  const workStartMs = parseUtcDateTime(dateStr, workStart);
  const workEndMs = parseUtcDateTime(dateStr, workEnd);

  if (Number.isNaN(workStartMs) || Number.isNaN(workEndMs) || workStartMs >= workEndMs) {
    return [];
  }

  const durationMs = durationMinutes * MS_PER_MINUTE;
  const stepMs = (durationMinutes + bufferMinutes) * MS_PER_MINUTE;
  const slots: TimeSlot[] = [];

  for (let cursorMs = workStartMs; cursorMs + durationMs <= workEndMs; cursorMs += stepMs) {
    const slotEndMs = cursorMs + durationMs;

    const isBooked = bookedRanges.some(
      (booked) =>
        cursorMs < booked.endTime.getTime() && slotEndMs > booked.startTime.getTime()
    );

    slots.push({
      startTime: new Date(cursorMs).toISOString(),
      endTime: new Date(slotEndMs).toISOString(),
      available: !isBooked,
    });
  }

  return slots;
}
