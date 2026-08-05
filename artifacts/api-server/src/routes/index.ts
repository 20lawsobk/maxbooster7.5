import { Router, type IRouter } from "express";
import healthRouter from "./health";
import modelProxyRouter from "./model-proxy";
import multimodalRouter from "./multimodal";
import autoResolverRouter from "./autoResolver";
import adminRestartRouter from "./adminRestart";

const router: IRouter = Router();

router.use(healthRouter);
router.use(multimodalRouter);
router.use(autoResolverRouter);
router.use(adminRestartRouter);
router.use(modelProxyRouter);

export default router;
