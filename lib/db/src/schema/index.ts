import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  contact: varchar("contact", { length: 255 }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  defaultDurationDays: integer("default_duration_days"),
  defaultPrice: numeric("default_price", { precision: 12, scale: 2 }),
});

export const sourceAccountsTable = pgTable("source_accounts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  email: varchar("email", { length: 255 }).notNull(),
  maxSlots: integer("max_slots").notNull(),
  expiresAt: date("expires_at", { mode: "string" }),
  note: text("note"),
});

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  sourceAccountId: integer("source_account_id").references(() => sourceAccountsTable.id),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  price: numeric("price", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const renewalHistoryTable = pgTable("renewal_history", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").notNull().references(() => subscriptionsTable.id),
  renewedAt: timestamp("renewed_at", { withTimezone: true }).notNull().defaultNow(),
  daysAdded: integer("days_added").notNull(),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }),
  gapDays: integer("gap_days").notNull().default(0),
  note: text("note"),
});

export const reminderLogTable = pgTable("reminder_log", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").notNull().references(() => subscriptionsTable.id),
  endDateSnapshot: date("end_date_snapshot", { mode: "string" }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  daysBeforeExpiry: integer("days_before_expiry").notNull(),
  channel: varchar("channel", { length: 20 }).notNull(),
});

export const aiCommandLogTable = pgTable("ai_command_log", {
  id: serial("id").primaryKey(),
  rawMessage: text("raw_message").notNull(),
  parsedJson: jsonb("parsed_json"),
  actionTaken: varchar("action_taken", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true });
export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true });
export const insertSourceAccountSchema = createInsertSchema(sourceAccountsTable).omit({ id: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  revokedAt: true,
});
export type Customer = typeof customersTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;
export type SourceAccount = typeof sourceAccountsTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type RenewalHistory = typeof renewalHistoryTable.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertSourceAccount = z.infer<typeof insertSourceAccountSchema>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;