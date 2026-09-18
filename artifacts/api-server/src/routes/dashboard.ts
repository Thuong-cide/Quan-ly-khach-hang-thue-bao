import { Router, type IRouter } from "express";
import { count, desc, gte, lt } from "drizzle-orm";
import { db, customersTable, renewalHistoryTable, subscriptionsTable } from "@workspace/db";
import { GetDashboardActivityQueryParams, GetDashboardActivityResponse, GetDashboardSummaryResponse } from "@workspace/api-zod";
import { numberOrNull } from "../lib/subscription-utils";
import { listSubscriptionViewsForDashboard } from "../lib/dashboard-data";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [customers] = await db.select({ count: count() }).from(customersTable);
  const subscriptions = await listSubscriptionViewsForDashboard();
  const statusBreakdown = ["active", "expiring", "expired", "archived"].map((status) => ({
    status,
    count: subscriptions.filter((item) => item.status === status).length,
  }));
  const histories = await db.select({ amountPaid: renewalHistoryTable.amountPaid }).from(renewalHistoryTable);
  const totalRevenue = histories.reduce((sum, item) => sum + (numberOrNull(item.amountPaid) ?? 0), 0);
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const monthRevenue = (await db.select({ amountPaid: renewalHistoryTable.amountPaid }).from(renewalHistoryTable)
    .where(gte(renewalHistoryTable.renewedAt, startOfMonth))).filter((item) => item.amountPaid !== null)
    .reduce((sum, item) => sum + (numberOrNull(item.amountPaid) ?? 0), 0);
  res.json(GetDashboardSummaryResponse.parse({
    activeSubscriptions: subscriptions.filter((item) => item.status === "active").length,
    expiringSubscriptions: subscriptions.filter((item) => item.status === "expiring").length,
    expiredSubscriptions: subscriptions.filter((item) => item.status === "expired").length,
    revokedSubscriptions: subscriptions.filter((item) => item.revokedAt !== null).length,
    totalCustomers: Number(customers?.count ?? 0),
    totalRevenue,
    revenueThisMonth: monthRevenue,
    statusBreakdown,
    upcoming: subscriptions.filter((item) => item.daysRemaining >= 0 && item.daysRemaining <= 14 && item.revokedAt === null).slice(0, 6),
  }));
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const query = GetDashboardActivityQueryParams.parse(req.query);
  const subscriptions = await listSubscriptionViewsForDashboard();
  const histories = await db.select().from(renewalHistoryTable).orderBy(desc(renewalHistoryTable.renewedAt)).limit(query.limit ?? 8);
  const activities = [
    ...histories.map((history) => {
      const subscription = subscriptions.find((item) => item.id === history.subscriptionId);
      return {
        id: `renewal-${history.id}`,
        type: "renewed" as const,
        title: `${subscription?.customerName ?? "Khách hàng"} đã gia hạn`,
        description: `${subscription?.productName ?? "Thuê bao"} thêm ${history.daysAdded} ngày`,
        timestamp: history.renewedAt,
        subscriptionId: history.subscriptionId,
      };
    }),
    ...subscriptions.map((item) => ({
      id: `created-${item.id}`,
      type: "created" as const,
      title: `${item.customerName} có thuê bao mới`,
      description: `${item.productName} hết hạn ngày ${item.endDate}`,
      timestamp: item.createdAt,
      subscriptionId: item.id,
    })),
    ...subscriptions.filter((item) => item.revokedAt !== null).map((item) => ({
      id: `revoked-${item.id}`,
      type: "revoked" as const,
      title: `${item.customerName} đã bị thu hồi`,
      description: `${item.productName} đã giải phóng tài khoản nguồn`,
      timestamp: item.revokedAt!,
      subscriptionId: item.id,
    })),
    ...subscriptions.filter((item) => item.status === "expiring").slice(0, query.limit ?? 8).map((item) => ({
      id: `expiring-${item.id}`,
      type: "expiring" as const,
      title: `${item.customerName} sắp hết hạn`,
      description: `${item.productName} còn ${Math.max(item.daysRemaining, 0)} ngày`,
      timestamp: item.updatedAt,
      subscriptionId: item.id,
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, query.limit ?? 8);
  res.json(GetDashboardActivityResponse.parse(activities));
});

export default router;
