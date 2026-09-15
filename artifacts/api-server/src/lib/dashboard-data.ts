import { eq } from "drizzle-orm";
import { db, customersTable, productsTable, sourceAccountsTable, subscriptionsTable } from "@workspace/db";
import { toSubscription } from "./subscription-utils";

export async function listSubscriptionViewsForDashboard() {
  const rows = await db.select({
    subscription: subscriptionsTable,
    customer: customersTable,
    product: productsTable,
    sourceAccount: sourceAccountsTable,
  }).from(subscriptionsTable)
    .innerJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
    .innerJoin(productsTable, eq(subscriptionsTable.productId, productsTable.id))
    .leftJoin(sourceAccountsTable, eq(subscriptionsTable.sourceAccountId, sourceAccountsTable.id));
  return rows.map(toSubscription);
}