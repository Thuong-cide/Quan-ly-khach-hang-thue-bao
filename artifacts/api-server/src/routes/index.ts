import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import customersRouter from "./customers";
import productsRouter from "./products";
import sourceAccountsRouter from "./source-accounts";
import subscriptionsRouter from "./subscriptions";
import integrationsRouter from "./integrations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(customersRouter);
router.use(productsRouter);
router.use(sourceAccountsRouter);
router.use(subscriptionsRouter);
router.use(integrationsRouter);

export default router;
