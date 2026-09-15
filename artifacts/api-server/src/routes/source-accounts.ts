import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, isNull } from "drizzle-orm";
import { db, productsTable, sourceAccountsTable, subscriptionsTable } from "@workspace/db";
import {
  CreateSourceAccountBody,
  CreateSourceAccountResponse,
  ListSourceAccountsQueryParams,
  ListSourceAccountsResponse,
  UpdateSourceAccountBody,
  UpdateSourceAccountParams,
  UpdateSourceAccountResponse,
} from "@workspace/api-zod";
import { dateOnly, parseId } from "../lib/subscription-utils";

const router: IRouter = Router();

async function accountView(id: number) {
  const [row] = await db
    .select({ account: sourceAccountsTable, product: productsTable })
    .from(sourceAccountsTable)
    .innerJoin(productsTable, eq(sourceAccountsTable.productId, productsTable.id))
    .where(eq(sourceAccountsTable.id, id));
  if (!row) return null;
  const used = await db.select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.sourceAccountId, id), isNull(subscriptionsTable.revokedAt)));
  return {
    id: row.account.id,
    productId: row.account.productId,
    productName: row.product.name,
    email: row.account.email,
    maxSlots: row.account.maxSlots,
    usedSlots: used.length,
    availableSlots: Math.max(row.account.maxSlots - used.length, 0),
    expiresAt: row.account.expiresAt,
    note: row.account.note,
  };
}

router.get("/source-accounts", async (req, res): Promise<void> => {
  const query = ListSourceAccountsQueryParams.parse(req.query);
  const conditions = [];
  if (query.productId) conditions.push(eq(sourceAccountsTable.productId, query.productId));
  if (query.search) conditions.push(ilike(sourceAccountsTable.email, `%${query.search}%`));
  const accounts = await db.select({ id: sourceAccountsTable.id })
    .from(sourceAccountsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(sourceAccountsTable.email));
  const output = [];
  for (const account of accounts) {
    const view = await accountView(account.id);
    if (view) output.push(view);
  }
  res.json(ListSourceAccountsResponse.parse(output));
});

router.post("/source-accounts", async (req, res): Promise<void> => {
  const parsed = CreateSourceAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [account] = await db.insert(sourceAccountsTable).values({
    ...parsed.data,
    expiresAt: parsed.data.expiresAt ? dateOnly(parsed.data.expiresAt) : null,
  }).returning();
  const view = await accountView(account.id);
  res.status(201).json(CreateSourceAccountResponse.parse(view));
});

router.patch("/source-accounts/:id", async (req, res): Promise<void> => {
  const params = UpdateSourceAccountParams.safeParse(req.params);
  const id = params.success ? params.data.id : parseId(req.params.id);
  const parsed = UpdateSourceAccountBody.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid source account id" : parsed.error.message });
    return;
  }
  const [account] = await db.update(sourceAccountsTable).set({
    ...parsed.data,
    expiresAt: parsed.data.expiresAt === undefined ? undefined : parsed.data.expiresAt ? dateOnly(parsed.data.expiresAt) : null,
  }).where(eq(sourceAccountsTable.id, id)).returning();
  if (!account) {
    res.status(404).json({ error: "Source account not found" });
    return;
  }
  res.json(UpdateSourceAccountResponse.parse(await accountView(id)));
});

export default router;