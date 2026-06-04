import { Router } from "express";

// Liveness probe — intentionally does no DB work. Migrations complete before the
// server starts listening, so the DB is already reachable by the time this is hit.
export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
