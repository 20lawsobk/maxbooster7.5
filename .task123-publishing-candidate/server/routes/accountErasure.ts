import { Router } from "express";
import bcrypt from "bcrypt";
import { storage } from "../storage.js";
import { requireAuthOnly } from "../middleware/auth.js";
import { pool } from "../db.js";
import { createErasureRequests } from "../services/accountErasureRequests.js";
import { createErasureHandlers } from "../services/accountErasureHandlers.js";

const router = Router();
const handlers = createErasureHandlers({
  requests: createErasureRequests(pool),
  getUser: id => storage.getUser(id),
  comparePassword: (password, hash) => bcrypt.compare(password, hash),
});
router.use(["/account", "/account/erasure", "/account/erasure/cancel"], requireAuthOnly);
router.get("/account/erasure", handlers.status);
router.post("/account/erasure/cancel", handlers.cancel);
router.delete("/account", handlers.request);
export default router;