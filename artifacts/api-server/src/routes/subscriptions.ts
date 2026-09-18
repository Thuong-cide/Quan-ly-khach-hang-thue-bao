import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import { db, customersTable, productsTable, renewalHistoryTable, sourceAccountsTable, subscriptionsTable } from "@workspace/db";
import {
  CreateSubscriptionBody,
  CreateSubscriptionResponse,
  GetSubscriptionHistoryParams,
  GetSubscriptionHistoryResponse,
  GetSubscriptionParams,
  GetSubscriptionResponse,
  ListSubscriptionsQueryParams,
  ListSubscriptionsResponse,
  RenewSubscriptionBody,
  RenewSubscriptionParams,
  RenewSubscriptionResponse,
  RevokeSubscriptionBody,
  RevokeSubscriptionParams,
  RevokeSubscriptionResponse,
  UpdateSubscriptionBody,
  UpdateSubscriptionParams,
  UpdateSubscriptionResponse,
} from "@workspace/api-zod";
import { addDays, dateOnly, daysBetween, isoToday, numberOrNull, parseId, subscriptionView, toSubscription } from "../lib/subscription-utils";

const router: IRouter = Router();

async function listViews(query: { status?: string; search?: string; sort?: string }) {
  const search = query.search ? `%${query.search}%` : null;
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
    .where(search ? or(
      ilike(customersTable.name, search),
      ilike(customersTable.contact, search),
      ilike(customersTable.email, search),
      ilike(customersTable.zalo, search),
      ilike(customersTable.facebook, search),
      ilike(productsTable.name, search),
    ) : undefined)
    .orderBy(query.sort === "customer" ? asc(customersTable.name) : query.sort === "created_at" ? desc(subscriptionsTable.createdAt) : asc(subscriptionsTable.endDate));
  const views = rows.map(toSubscription);
  return query.status && query.status !== "all" ? views.filter((item) => item.status === query.status) : views;
}

router.get("/subscriptions", async (req, res): Promise<void> => {
  const query = ListSubscriptionsQueryParams.parse(req.query);
  res.json(ListSubscriptionsResponse.parse(await listViews(query)));
});

router.post("/subscriptions", async (req, res): Promise<void> => {
  const parsed = CreateSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const customer = await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.id, parsed.data.customerId));
  const product = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, parsed.data.productId));
  const startDate = dateOnly(parsed.data.startDate);
  const endDate = dateOnly(parsed.data.endDate);
  if (!customer[0] || !product[0] || daysBetween(startDate, endDate) < 1) {
    res.status(400).json({ error: "Customer, product, and a valid date range are required" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    if (parsed.data.sourceAccountId) {
      const [source] = await tx.select().from(sourceAccountsTable)
        .where(eq(sourceAccountsTable.id, parsed.data.sourceAccountId))
        .for("update");
      const used = await tx.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
        .where(and(eq(subscriptionsTable.sourceAccountId, parsed.data.sourceAccountId), isNull(subscriptionsTable.revokedAt)));
      if (!source || source.productId !== parsed.data.productId) {
        return { status: "invalid-source" as const };
      }
      if (used.length >= source.maxSlots) {
        return { status: "source-full" as const };
      }
    }
    const [subscription] = await tx.insert(subscriptionsTable).values({
      customerId: parsed.data.customerId,
      productId: parsed.data.productId,
      sourceAccountId: parsed.data.sourceAccountId ?? null,
      startDate,
      endDate,
      price: parsed.data.price?.toString() ?? null,
      status: "active",
    }).returning();
    return { status: "created" as const, id: subscription.id };
  });
  if (result.status === "invalid-source") {
    res.status(400).json({ error: "Source account does not belong to the selected product" });
    return;
  }
  if (result.status === "source-full") {
    res.status(400).json({ error: "Source account has no available slots" });
    return;
  }
  const view = await subscriptionView(result.id);
  res.status(201).json(CreateSubscriptionResponse.parse(view));
});

router.get("/subscriptions/:id", async (req, res): Promise<void> => {
  const params = GetSubscriptionParams.safeParse(req.params);
  const id = params.success ? params.data.id : parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid subscription id" });
    return;
  }
  const subscription = await subscriptionView(id);
  if (!subscription) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }
  const history = await db.select().from(renewalHistoryTable).where(eq(renewalHistoryTable.subscriptionId, id)).orderBy(desc(renewalHistoryTable.renewedAt));
  res.json(GetSubscriptionResponse.parse({ ...subscription, history: history.map((item) => ({ ...item, amountPaid: numberOrNull(item.amountPaid) })) }));
});

router.patch("/subscriptions/:id", async (req, res): Promise<void> => {
  const params = UpdateSubscriptionParams.safeParse(req.params);
  const id = params.success ? params.data.id : parseId(req.params.id);
  const parsed = UpdateSubscriptionBody.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid subscription id" : parsed.error.message });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, id))
      .for("update");
    if (!current) return { status: "not-found" as const };
    const startDate = parsed.data.startDate ? dateOnly(parsed.data.startDate) : current.startDate;
    const endDate = parsed.data.endDate ? dateOnly(parsed.data.endDate) : current.endDate;
    if (daysBetween(startDate, endDate) < 1) {
      return { status: "invalid-dates" as const };
    }
    const sourceAccountId = parsed.data.sourceAccountId === undefined
      ? current.sourceAccountId
      : parsed.data.sourceAccountId;
    if (sourceAccountId !== null) {
      const [source] = await tx.select().from(sourceAccountsTable)
        .where(eq(sourceAccountsTable.id, sourceAccountId))
        .for("update");
      if (!source || source.productId !== current.productId) {
        return { status: "invalid-source" as const };
      }
      if (current.revokedAt === null) {
        const used = await tx.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
          .where(and(
            eq(subscriptionsTable.sourceAccountId, sourceAccountId),
            isNull(subscriptionsTable.revokedAt),
            ne(subscriptionsTable.id, id),
          ));
        if (used.length >= source.maxSlots) {
          return { status: "source-full" as const };
        }
      }
    }
    await tx.update(subscriptionsTable).set({
      sourceAccountId: parsed.data.sourceAccountId === undefined ? undefined : sourceAccountId,
      startDate: parsed.data.startDate === undefined ? undefined : startDate,
      endDate: parsed.data.endDate === undefined ? undefined : endDate,
      price: parsed.data.price === undefined ? undefined : parsed.data.price?.toString() ?? null,
      updatedAt: new Date(),
    }).where(eq(subscriptionsTable.id, id));
    return { status: "updated" as const };
  });
  if (result.status === "not-found") {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }
  if (result.status === "invalid-dates") {
    res.status(400).json({ error: "End date must be after start date" });
    return;
  }
  if (result.status === "invalid-source") {
    res.status(400).json({ error: "Source account does not belong to the subscription product" });
    return;
  }
  if (result.status === "source-full") {
    res.status(400).json({ error: "Source account has no available slots" });
    return;
  }
  res.json(UpdateSubscriptionResponse.parse(await subscriptionView(id)));
});

router.post("/subscriptions/:id/renew", async (req, res): Promise<void> => {
  const params = RenewSubscriptionParams.safeParse(req.params);
  const id = params.success ? params.data.id : parseId(req.params.id);
  const parsed = RenewSubscriptionBody.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid subscription id" : parsed.error.message });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, id))
      .for("update");
    if (!current) return { status: "not-found" as const };
    if (current.revokedAt && current.sourceAccountId) {
      const [source] = await tx.select().from(sourceAccountsTable)
        .where(eq(sourceAccountsTable.id, current.sourceAccountId))
        .for("update");
      const used = await tx.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
        .where(and(eq(subscriptionsTable.sourceAccountId, current.sourceAccountId), isNull(subscriptionsTable.revokedAt)));
      if (!source || source.productId !== current.productId) {
        return { status: "invalid-source" as const };
      }
      if (used.length >= source.maxSlots) {
        return { status: "source-full" as const };
      }
    }
    const baseDate = current.revokedAt ? isoToday() : current.endDate;
    const gapDays = current.revokedAt ? Math.max(daysBetween(current.endDate, isoToday()), 0) : 0;
    const endDate = addDays(baseDate, parsed.data.daysAdded);
    await tx.update(subscriptionsTable).set({
      endDate,
      revokedAt: null,
      status: "active",
      updatedAt: new Date(),
    }).where(eq(subscriptionsTable.id, id));
    await tx.insert(renewalHistoryTable).values({
      subscriptionId: id,
      daysAdded: parsed.data.daysAdded,
      amountPaid: parsed.data.amountPaid?.toString() ?? null,
      gapDays,
      note: parsed.data.note ?? null,
    });
    return { status: "renewed" as const };
  });
  if (result.status === "not-found") {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }
  if (result.status === "invalid-source") {
    res.status(400).json({ error: "Assigned source account is no longer valid for this product" });
    return;
  }
  if (result.status === "source-full") {
    res.status(400).json({ error: "Assigned source account has no available slots" });
    return;
  }
  res.json(RenewSubscriptionResponse.parse(await subscriptionView(id)));
});

router.post("/subscriptions/:id/revoke", async (req, res): Promise<void> => {
  const params = RevokeSubscriptionParams.safeParse(req.params);
  const id = params.success ? params.data.id : parseId(req.params.id);
  const parsed = RevokeSubscriptionBody.safeParse(req.body ?? {});
  if (!id || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid subscription id" : parsed.error.message });
    return;
  }
  const [updated] = await db.update(subscriptionsTable).set({
    revokedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(subscriptionsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }
  res.json(RevokeSubscriptionResponse.parse(await subscriptionView(id)));
});

router.get("/subscriptions/:id/history", async (req, res): Promise<void> => {
  const params = GetSubscriptionHistoryParams.safeParse(req.params);
  const id = params.success ? params.data.id : parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid subscription id" });
    return;
  }
  const [subscription] = await db.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, id));
  if (!subscription) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }
  const history = await db.select().from(renewalHistoryTable).where(eq(renewalHistoryTable.subscriptionId, id)).orderBy(desc(renewalHistoryTable.renewedAt));
  res.json(GetSubscriptionHistoryResponse.parse(history.map((item) => ({ ...item, amountPaid: numberOrNull(item.amountPaid) }))));
});

export default router;
