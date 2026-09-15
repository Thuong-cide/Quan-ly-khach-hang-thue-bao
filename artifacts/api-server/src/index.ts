import app from "./app";
import { logger } from "./lib/logger";
import { runDueReminders } from "./lib/telegram";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void runDueReminders().then((result) => {
    logger.info(result, "Reminder sweep completed");
  }).catch((err) => {
    logger.error({ err }, "Reminder sweep failed");
  });
  setInterval(() => {
    void runDueReminders().then((result) => {
      logger.info(result, "Reminder sweep completed");
    }).catch((err) => {
      logger.error({ err }, "Reminder sweep failed");
    });
  }, 86_400_000);
});
