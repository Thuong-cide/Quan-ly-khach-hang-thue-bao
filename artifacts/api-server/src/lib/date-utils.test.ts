import assert from "node:assert/strict";
import test from "node:test";
import { addDays, dateOnly, daysBetween, derivedStatus, isoToday } from "./date-utils";

test("dateOnly normalizes Date and ISO date-time values", () => {
  assert.equal(dateOnly(new Date("2024-02-29T18:00:00.000Z")), "2024-02-29");
  assert.equal(dateOnly("2026-09-18T10:00:00.000Z"), "2026-09-18");
});

test("daysBetween handles month and leap-year boundaries", () => {
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2);
  assert.equal(daysBetween("2026-09-18", "2026-09-17"), -1);
});

test("addDays preserves date-only UTC semantics", () => {
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2024-12-31", 1), "2025-01-01");
});

test("derivedStatus covers active, expiring, expired and archived subscriptions", () => {
  const today = isoToday();
  assert.equal(derivedStatus(addDays(today, 8)), "active");
  assert.equal(derivedStatus(addDays(today, 7)), "expiring");
  assert.equal(derivedStatus(today), "expiring");
  assert.equal(derivedStatus(addDays(today, -1)), "expired");
  assert.equal(derivedStatus(addDays(today, 30), true), "archived");
});
