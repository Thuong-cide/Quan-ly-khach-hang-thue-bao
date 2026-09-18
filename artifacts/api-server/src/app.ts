import express, { type ErrorRequestHandler, type Express, type RequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const apiNotFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
};

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof Error && error.name === "ZodError") {
    res.status(400).json({ error: error.message });
    return;
  }

  logger.error({ err: error }, "Unhandled request error");
  res.status(500).json({ error: "Internal server error" });
};

app.use("/api", apiNotFound);
app.use(errorHandler);

export default app;
