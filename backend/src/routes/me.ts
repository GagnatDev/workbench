import { Router } from "express";
import { currentUser } from "../middleware/resolveUser.js";

/**
 * GET /api/me — the authenticated app user. The client caches `id` and stamps it
 * as `user_id` on locally-created rows (Phase 2). resolveUser has already run, so
 * the row is provisioned by the time we get here.
 */
export function meRoutes(): Router {
  const router = Router();
  router.get("/me", (req, res) => {
    const user = currentUser(req);
    res.json(user);
  });
  return router;
}
