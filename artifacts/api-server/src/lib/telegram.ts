import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db, aiCommandLogTable, customersTable, productsTable, reminderLogTable, subscriptionsTable } from "@workspace/db";
import { addDays, daysBetween, isoToday, numberOrNull } from "./subscription-utils";

type ParsedCommand = {
  intent: "add_customer_order" | "renew" | "query" | "revoke" | "unknown";
  customer_name?: string | null;
  phone?: string | null;
  product?: string | null;
  duration_days?: number | null;
  price?: number | null;
  note?: string | null;
};

type TelegramUpdate = {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
};

function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

async function sendTelegramMessage(chatId: string | number, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return response.ok;
}

async function parseWithRouter(rawMessage: string): Promise<ParsedCommand | null> {
  const base = process.env.AI_ROUTER_BASE_URL;
  if (!base) return null;
  const endpoint = `${base.replace(/\/$/, "")}${base.endsWith("/v1") ? "" : "/v1"}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.AI_ROUTER_API_KEY ? { authorization: `Bearer ${process.env.AI_ROUTER_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: process.env.AI_ROUTER_MODEL ?? "default",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Bạn là bộ phân tích lệnh quản lý thuê bao. Chỉ trả về JSON hợp lệ với các khóa intent, customer_name, phone, product, duration_days, price, note. intent chỉ được là add_customer_order, renew, query, revoke hoặc unknown. Không tự bịa giá trị còn thiếu.",
        },
        { role: "user", content: rawMessage },
      ],
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  try {
    return JSON.parse(content.replace(/^```json\s*/i, "").replace(/\s*```$/, "")) as ParsedCommand;
  } catch {
    return null;
  }
}

function missingFields(command: ParsedCommand): string[] {
  const missing: string[] = [];
  if (command.intent !== "query" && !command.customer_name) missing.push("tên khách hàng");
  if (command.intent !== "query" && !command.product) missing.push("sản phẩm");
  if (command.intent === "add_customer_order" && !command.duration_days) missing.push("số ngày");
  if (command.intent === "renew" && !command.duration_days) missing.push("số ngày gia hạn");
  if (command.intent === "add_customer_order" && command.price == null) missing.push("giá");
  return missing;
}

function commandSummary(command: ParsedCommand): string {
  if (command.intent === "query") return "tra cứu tình hình thuê bao";
  const action = command.intent === "add_customer_order" ? "tạo đơn" : command.intent === "renew" ? "gia hạn" : "thu hồi";
  return `${action} cho ${command.customer_name ?? "khách hàng"} — ${command.product ?? "sản phẩm"}${command.duration_days ? ` — ${command.duration_days} ngày` : ""}${command.price != null ? ` — ${command.price.toLocaleString("vi-VN")}đ` : ""}`;
}

async function findSubscription(command: ParsedCommand) {
  if (!command.customer_name || !command.product) return null;
  const rows = await db.select({
    subscription: subscriptionsTable,
    customer: customersTable,
    product: productsTable,
  }).from(subscriptionsTable)
    .innerJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
    .innerJoin(productsTable, eq(subscriptionsTable.productId, productsTable.id))
    .where(and(ilike(customersTable.name, command.customer_name), ilike(productsTable.name, `%${command.product}%`)))
    .orderBy(desc(subscriptionsTable.endDate));
  return rows[0] ?? null;
}

async function executeConfirmedCommand(command: ParsedCommand): Promise<string> {
  if (command.intent === "query") {
    const rows = await db.select({ endDate: subscriptionsTable.endDate, revokedAt: subscriptionsTable.revokedAt })
      .from(subscriptionsTable);
    const active = rows.filter((row) => row.revokedAt === null && daysBetween(isoToday(), row.endDate) >= 0).length;
    const expiring = rows.filter((row) => row.revokedAt === null && daysBetween(isoToday(), row.endDate) >= 0 && daysBetween(isoToday(), row.endDate) <= 7).length;
    return `Hiện có ${active} thuê bao còn hiệu lực, trong đó ${expiring} thuê bao sắp hết hạn.`;
  }

  if (command.intent === "add_customer_order") {
    const [product] = await db.select().from(productsTable).where(ilike(productsTable.name, `%${command.product ?? ""}%`));
    if (!product || !command.customer_name || !command.duration_days) return "Không tìm thấy sản phẩm hoặc thiếu thông tin để tạo đơn.";
    let [customer] = await db.select().from(customersTable).where(ilike(customersTable.name, command.customer_name));
    if (!customer) {
      [customer] = await db.insert(customersTable).values({
        name: command.customer_name,
        contact: command.phone ?? null,
        note: command.note ?? null,
      }).returning();
    }
    await db.insert(subscriptionsTable).values({
      customerId: customer.id,
      productId: product.id,
      sourceAccountId: null,
      startDate: isoToday(),
      endDate: addDays(isoToday(), command.duration_days),
      price: command.price?.toString() ?? product.defaultPrice,
      status: "active",
    });
    return `Đã tạo thuê bao ${product.name} cho ${customer.name}, hạn đến ${addDays(isoToday(), command.duration_days)}.`;
  }

  const match = await findSubscription(command);
  if (!match) return "Không tìm thấy thuê bao phù hợp với khách hàng và sản phẩm đã nêu.";
  if (command.intent === "renew") {
    const base = match.subscription.revokedAt ? isoToday() : match.subscription.endDate;
    const endDate = addDays(base, command.duration_days ?? 30);
    await db.update(subscriptionsTable).set({ endDate, revokedAt: null, status: "active", updatedAt: new Date() }).where(eq(subscriptionsTable.id, match.subscription.id));
    await db.insert((await import("@workspace/db")).renewalHistoryTable).values({
      subscriptionId: match.subscription.id,
      daysAdded: command.duration_days ?? 30,
      amountPaid: command.price?.toString() ?? match.subscription.price,
      gapDays: match.subscription.revokedAt ? Math.max(daysBetween(match.subscription.endDate, isoToday()), 0) : 0,
      note: command.note ?? "Gia hạn qua Telegram",
    });
    return `Đã gia hạn ${match.customer.name} — ${match.product.name} đến ${endDate}.`;
  }
  await db.update(subscriptionsTable).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(subscriptionsTable.id, match.subscription.id));
  return `Đã thu hồi quyền truy cập của ${match.customer.name} — ${match.product.name}.`;
}

export async function handleTelegramUpdate(update: unknown): Promise<string | null> {
  const telegramUpdate = update as TelegramUpdate;
  const text = telegramUpdate.message?.text?.trim();
  const chatId = telegramUpdate.message?.chat?.id;
  if (!text || chatId == null) return null;
  const chatKey = String(chatId);
  const normalized = text.toLowerCase();
  const pending = await db.select().from(aiCommandLogTable)
    .where(and(eq(aiCommandLogTable.actionTaken, "pending_confirmation"), sql`${aiCommandLogTable.parsedJson}->>'chatId' = ${chatKey}`))
    .orderBy(desc(aiCommandLogTable.createdAt)).limit(1);

  if (["ok", "đúng", "xac nhan", "xác nhận", "yes"].includes(normalized)) {
    const record = pending[0];
    if (!record) return "Chưa có lệnh nào đang chờ xác nhận.";
    const command = record.parsedJson as ParsedCommand;
    const reply = await executeConfirmedCommand(command);
    await db.update(aiCommandLogTable).set({ actionTaken: "confirmed" }).where(eq(aiCommandLogTable.id, record.id));
    await sendTelegramMessage(chatId, reply);
    return reply;
  }
  if (["không", "khong", "hủy", "huy", "cancel", "no"].includes(normalized) && pending[0]) {
    await db.update(aiCommandLogTable).set({ actionTaken: "cancelled" }).where(eq(aiCommandLogTable.id, pending[0].id));
    const reply = "Đã hủy lệnh, chưa có dữ liệu nào thay đổi.";
    await sendTelegramMessage(chatId, reply);
    return reply;
  }

  const command = await parseWithRouter(text);
  if (!command) {
    const reply = process.env.AI_ROUTER_BASE_URL
      ? "Mình chưa hiểu lệnh này. Hãy thử: gia hạn Adobe cho Nguyễn Minh Anh 30 ngày."
      : "AI Router chưa được cấu hình. Bạn có thể quản lý trực tiếp trên dashboard.";
    await db.insert(aiCommandLogTable).values({ rawMessage: text, parsedJson: { chatId }, actionTaken: "unavailable" });
    await sendTelegramMessage(chatId, reply);
    return reply;
  }
  const missing = missingFields(command);
  const parsedJson = { ...command, chatId };
  if (missing.length > 0) {
    const reply = `Còn thiếu: ${missing.join(", ")}. Bạn bổ sung giúp mình nhé.`;
    await db.insert(aiCommandLogTable).values({ rawMessage: text, parsedJson, actionTaken: "needs_more_info" });
    await sendTelegramMessage(chatId, reply);
    return reply;
  }
  await db.insert(aiCommandLogTable).values({ rawMessage: text, parsedJson, actionTaken: "pending_confirmation" });
  const reply = `Mình hiểu là: ${commandSummary(command)}. Xác nhận bằng “ok” để ghi vào hệ thống, hoặc “hủy” để bỏ qua.`;
  await sendTelegramMessage(chatId, reply);
  return reply;
}

export async function runDueReminders(): Promise<{ sent: number; skipped: number; configured: boolean }> {
  if (!telegramConfigured()) return { sent: 0, skipped: 0, configured: false };
  const chatId = process.env.TELEGRAM_CHAT_ID as string;
  const rows = await db.select({
    subscription: subscriptionsTable,
    customer: customersTable,
    product: productsTable,
  }).from(subscriptionsTable)
    .innerJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
    .innerJoin(productsTable, eq(subscriptionsTable.productId, productsTable.id))
    .where(isNull(subscriptionsTable.revokedAt));
  let sent = 0;
  let skipped = 0;
  for (const row of rows) {
    const daysRemaining = daysBetween(isoToday(), row.subscription.endDate);
    if (![7, 3, 1, 0].includes(daysRemaining)) continue;
    const previous = await db.select({ id: reminderLogTable.id }).from(reminderLogTable).where(and(
      eq(reminderLogTable.subscriptionId, row.subscription.id),
      eq(reminderLogTable.endDateSnapshot, row.subscription.endDate),
      eq(reminderLogTable.daysBeforeExpiry, daysRemaining),
    )).limit(1);
    if (previous[0]) {
      skipped += 1;
      continue;
    }
    const message = daysRemaining === 0
      ? `Hôm nay hết hạn: ${row.customer.name} — ${row.product.name}.`
      : `Nhắc hạn: ${row.customer.name} — ${row.product.name} còn ${daysRemaining} ngày (hạn ${row.subscription.endDate}).`;
    if (await sendTelegramMessage(chatId, message)) {
      await db.insert(reminderLogTable).values({
        subscriptionId: row.subscription.id,
        endDateSnapshot: row.subscription.endDate,
        daysBeforeExpiry: daysRemaining,
        channel: "telegram",
      });
      sent += 1;
    }
  }
  return { sent, skipped, configured: true };
}