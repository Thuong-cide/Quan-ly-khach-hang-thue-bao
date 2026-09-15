import { Router, type IRouter } from "express";
import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, customersTable, productsTable, sourceAccountsTable, subscriptionsTable } from "@workspace/db";
import {
  CreateCustomerBody,
  CreateCustomerResponse,
  GetCustomerParams,
  GetCustomerResponse,
  ListCustomersQueryParams,
  ListCustomersResponse,
  UpdateCustomerBody,
  UpdateCustomerParams,
  UpdateCustomerResponse,
} from "@workspace/api-zod";
import { parseId, toSubscription } from "../lib/subscription-utils";

const router: IRouter = Router();

router.get("/customers", async (req, res): Promise<void> => {
  const query = ListCustomersQueryParams.parse(req.query);
  const search = query.search ? `%${query.search}%` : null;
  const rows = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      contact: customersTable.contact,
      email: customersTable.email,
      zalo: customersTable.zalo,
      facebook: customersTable.facebook,
      note: customersTable.note,
      createdAt: customersTable.createdAt,
      subscriptionCount: sql<number>`count(${subscriptionsTable.id})::int`,
    })
    .from(customersTable)
    .leftJoin(subscriptionsTable, eq(subscriptionsTable.customerId, customersTable.id))
    .where(search ? or(
      ilike(customersTable.name, search),
      ilike(customersTable.contact, search),
      ilike(customersTable.email, search),
      ilike(customersTable.zalo, search),
      ilike(customersTable.facebook, search),
    ) : undefined)
    .groupBy(customersTable.id)
    .orderBy(asc(customersTable.name))
    .limit(query.limit ?? 100);
  res.json(ListCustomersResponse.parse(rows));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db.insert(customersTable).values(parsed.data).returning();
  res.status(201).json(CreateCustomerResponse.parse({ ...customer, subscriptionCount: 0 }));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  const id = params.success ? params.data.id : parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid customer id" });
    return;
  }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const subscriptions = await db
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
    .where(eq(subscriptionsTable.customerId, id))
    .orderBy(desc(subscriptionsTable.endDate));
  const output = { ...customer, subscriptionCount: subscriptions.length, subscriptions: subscriptions.map(toSubscription) };
  res.json(GetCustomerResponse.parse(output));
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  const id = params.success ? params.data.id : parseId(req.params.id);
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid customer id" : parsed.error.message });
    return;
  }
  const [customer] = await db.update(customersTable).set(parsed.data).where(eq(customersTable.id, id)).returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(subscriptionsTable).where(eq(subscriptionsTable.customerId, id));
  res.json(UpdateCustomerResponse.parse({ ...customer, subscriptionCount: Number(count) }));
});

export default router;