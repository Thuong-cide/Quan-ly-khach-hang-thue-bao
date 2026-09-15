import { Router, type IRouter } from "express";
import { GetIntegrationsStatusResponse, RunRemindersResponse, TelegramWebhookBody, TelegramWebhookResponse } from "@workspace/api-zod";
import { handleTelegramUpdate, runDueReminders } from "../lib/telegram";

const router: IRouter = Router();

router.get("/integrations/status", async (_req, res): Promise<void> => {
  res.json(GetIntegrationsStatusResponse.parse({
    telegram: {
      configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      mode: process.env.TELEGRAM_WEBHOOK_URL ? "webhook" : "polling-ready",
    },
    aiRouter: {
      configured: Boolean(process.env.AI_ROUTER_BASE_URL),
      provider: process.env.AI_ROUTER_PROVIDER ?? "9Router",
    },
  }));
});

router.post("/webhook/telegram", async (req, res): Promise<void> => {
  const parsed = TelegramWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const reply = await handleTelegramUpdate(parsed.data);
  res.json(TelegramWebhookResponse.parse({ ok: true, reply }));
});

router.post("/reminders/run", async (_req, res): Promise<void> => {
  res.json(RunRemindersResponse.parse(await runDueReminders()));
});

export default router;