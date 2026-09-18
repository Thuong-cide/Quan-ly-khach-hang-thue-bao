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
  const [product] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(eq(productsTable.id, parsed.data.productId));
  if (!product) {
    res.status(400).json({ error: "Product not found" });
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
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(sourceAccountsTable)
      .where(eq(sourceAccountsTable.id, id))
      .for("update");
    if (!current) return { status: "not-found" as const };
    const used = await tx.select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.sourceAccountId, id), isNull(subscriptionsTable.revokedAt)));
    if (parsed.data.maxSlots !== undefined && parsed.data.maxSlots < used.length) {
      return { status: "capacity-too-low" as const, usedSlots: used.length };
    }
    await tx.update(sourceAccountsTable).set({
      ...parsed.data,
      expiresAt: parsed.data.expiresAt === undefined ? undefined : parsed.data.expiresAt ? dateOnly(parsed.data.expiresAt) : null,
    }).where(eq(sourceAccountsTable.id, id));
    return { status: "updated" as const };
  });
  if (result.status === "not-found") {
    res.status(404).json({ error: "Source account not found" });
    return;
  }
  if (result.status === "capacity-too-low") {
    res.status(400).json({
      error: `Maximum slots cannot be lower than the ${result.usedSlots} slots currently in use`,
    });
    return;
  }
  res.json(UpdateSourceAccountResponse.parse(await accountView(id)));
});

export default router;
