import { Router, type IRouter } from "express";
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, productsTable, sourceAccountsTable, subscriptionsTable } from "@workspace/db";
import {
  CreateProductBody,
  CreateProductResponse,
  ListProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import { isoToday, numberOrNull, parseId } from "../lib/subscription-utils";

const router: IRouter = Router();

router.get("/products", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      defaultDurationDays: productsTable.defaultDurationDays,
      defaultPrice: productsTable.defaultPrice,
      activeSubscriptions: sql<number>`count(distinct case when ${subscriptionsTable.revokedAt} is null and ${subscriptionsTable.endDate} >= ${isoToday()} then ${subscriptionsTable.id} end)::int`,
      sourceAccountCount: sql<number>`count(distinct ${sourceAccountsTable.id})::int`,
    })
    .from(productsTable)
    .leftJoin(subscriptionsTable, eq(subscriptionsTable.productId, productsTable.id))
    .leftJoin(sourceAccountsTable, eq(sourceAccountsTable.productId, productsTable.id))
    .groupBy(productsTable.id)
    .orderBy(asc(productsTable.name));
  res.json(ListProductsResponse.parse(rows.map((row) => ({
    ...row,
    defaultPrice: numberOrNull(row.defaultPrice),
    activeSubscriptions: Number(row.activeSubscriptions),
    sourceAccountCount: Number(row.sourceAccountCount),
  }))));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db.insert(productsTable).values({
    name: parsed.data.name,
    defaultDurationDays: parsed.data.defaultDurationDays ?? null,
    defaultPrice: parsed.data.defaultPrice?.toString() ?? null,
  }).returning();
  res.status(201).json(CreateProductResponse.parse({
    ...product,
    defaultPrice: numberOrNull(product.defaultPrice),
    activeSubscriptions: 0,
    sourceAccountCount: 0,
  }));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  const id = params.success ? params.data.id : parseId(req.params.id);
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid product id" : parsed.error.message });
    return;
  }
  const [product] = await db.update(productsTable).set({
    ...parsed.data,
    defaultPrice: parsed.data.defaultPrice === undefined ? undefined : parsed.data.defaultPrice?.toString() ?? null,
  }).where(eq(productsTable.id, id)).returning();
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const [{ activeSubscriptions }] = await db.select({
    activeSubscriptions: sql<number>`count(*)::int`,
  }).from(subscriptionsTable).where(and(
    eq(subscriptionsTable.productId, id),
    isNull(subscriptionsTable.revokedAt),
    gte(subscriptionsTable.endDate, isoToday()),
  ));
  const [{ sourceAccountCount }] = await db.select({
    sourceAccountCount: sql<number>`count(*)::int`,
  }).from(sourceAccountsTable).where(eq(sourceAccountsTable.productId, id));
  res.json(UpdateProductResponse.parse({
    ...product,
    defaultPrice: numberOrNull(product.defaultPrice),
    activeSubscriptions: Number(activeSubscriptions),
    sourceAccountCount: Number(sourceAccountCount),
  }));
});

export default router;
