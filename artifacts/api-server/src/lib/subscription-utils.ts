import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  customersTable,
  productsTable,
  sourceAccountsTable,
  subscriptionsTable,
} from "@workspace/db";
export { addDays, dateOnly, daysBetween, derivedStatus, isoToday } from "./date-utils";
import { daysBetween, derivedStatus, isoToday } from "./date-utils";

export function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
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
    status: derivedStatus(row.subscription.endDate, row.subscription.revokedAt !== null),
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
