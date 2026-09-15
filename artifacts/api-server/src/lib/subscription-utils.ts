import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  customersTable,
  productsTable,
  sourceAccountsTable,
  subscriptionsTable,
} from "@workspace/db";

export function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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

export function derivedStatus(endDate: string, archived = false): "active" | "expiring" | "expired" | "archived" {
  if (archived) return "archived";
  const remaining = daysBetween(isoToday(), endDate);
  if (remaining < 0) return "expired";
  if (remaining <= 7) return "expiring";
  return "active";
}

export function numberOrNull(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function subscriptionView(id: number) {
  const rows = await db
    .select({
      subscription: subscriptionsTable,
      customer: customersTable,
      product: productsTable,
      sourceAccount: sourceAccountsTable,
    })
    .from(subscriptionsTable)
    .innerJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
    .innerJoin(productsTable, eq(subscriptionsTable.productId, productsTable.id))
    .leftJoin(sourceAccountsTable, eq(subscriptionsTable.sourceAccountId, sourceAccountsTable.id))
    .where(eq(subscriptionsTable.id, id));
  const row = rows[0];
  if (!row) return null;
  return toSubscription(row);
}

export function toSubscription(row: {
  subscription: typeof subscriptionsTable.$inferSelect;
  customer: typeof customersTable.$inferSelect;
  product: typeof productsTable.$inferSelect;
  sourceAccount: typeof sourceAccountsTable.$inferSelect | null;
}) {
  const daysRemaining = daysBetween(isoToday(), row.subscription.endDate);
  return {
    id: row.subscription.id,
    customerId: row.subscription.customerId,
    customerName: row.customer.name,
    customerContact: row.customer.contact,
    productId: row.subscription.productId,
    productName: row.product.name,
    sourceAccountId: row.subscription.sourceAccountId,
    sourceAccountEmail: row.sourceAccount?.email ?? null,
    startDate: row.subscription.startDate,
    endDate: row.subscription.endDate,
    price: numberOrNull(row.subscription.price),
    status: derivedStatus(row.subscription.endDate, row.subscription.status === "archived"),
    revokedAt: row.subscription.revokedAt,
    daysRemaining,
    createdAt: row.subscription.createdAt,
    updatedAt: row.subscription.updatedAt,
  };
}

export async function usedSlots(sourceAccountId: number): Promise<number> {
  const rows = await db
    .select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.sourceAccountId, sourceAccountId), isNull(subscriptionsTable.revokedAt)));
  return rows.length;
}