export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dateOnly(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function derivedStatus(
  endDate: string,
  archived = false,
): "active" | "expiring" | "expired" | "archived" {
  if (archived) return "archived";
  const remaining = daysBetween(isoToday(), endDate);
  if (remaining < 0) return "expired";
  if (remaining <= 7) return "expiring";
  return "active";
}
