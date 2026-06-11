import { Router } from "express";
import {
  checkManaged,
  reserveManaged,
  requestCustomDomain,
  verifyCustomDomain,
  listDomains,
  deleteDomain,
} from "./domain?.controller.js";

const _router = Router();

router?.post("/managed/check", checkManaged);
router?.post("/managed/reserve", reserveManaged);

router?.post("/custom/request", requestCustomDomain);
router?.post("/custom/verify", verifyCustomDomain);

router?.get("/storefront/:storefrontId", listDomains);
router?.delete("/:domainId", deleteDomain);

export default router;
