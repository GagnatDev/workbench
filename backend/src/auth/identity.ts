import type { Request, RequestHandler } from "express";
import type { Env } from "../config/env.js";
import type { AuthUser } from "./types.js";

/**
 * Fixed local identity used in `dev` mode when no sidecar headers are present.
 * Lets the whole pipeline — resolveUser JIT-provisioning, /api/me, every scoped
 * query — run end-to-end with no auth-proxy in front. The `sub` is a stable
 * sentinel so the same dev user row is reused across restarts.
 */
export const DEV_PRINCIPAL: AuthUser = {
  id: "dev|00000000-0000-4000-8000-000000000001",
  email: "dev@workbench.local",
  role: "admin",
};

/**
 * Read the identity the auth-proxy sidecar injects (integration guide §4):
 *   X-Homectl-User  → JWT `sub` (the auth principal id)
 *   X-Homectl-Email → email
 *   X-Homectl-Role  → app role (absent when the user has no role in this app)
 * The sidecar strips any client-supplied copy and injects its own trusted values,
 * so these can be read directly. Returns null when the user header is absent.
 */
function readSidecarIdentity(req: Request): AuthUser | null {
  const id = req.get("x-homectl-user");
  if (!id) return null;
  return {
    id,
    email: req.get("x-homectl-email") ?? null,
    role: req.get("x-homectl-role") ?? null,
  };
}

/**
 * Populate `req.user` from the request, then hand off to resolveUser.
 *
 * The app itself does no auth work under the sidecar model: it trusts the
 * `X-Homectl-*` headers injected by the auth-proxy. Those are honored in every
 * mode (so tests can drive identity the same way prod does).
 *
 * - `sidecar` (production default): headers are the only source of truth. A
 *   request without them is unauthenticated — the sidecar would normally 302 an
 *   HTML navigation or 401 an XHR before it ever reaches us, so this is a
 *   defensive 401.
 * - `dev` (default elsewhere): no auth-proxy is in front, so a request with no
 *   sidecar headers falls back to a synthesized identity — an `x-dev-sub`
 *   override (used by tests to exercise multiple identities) or the fixed dev
 *   principal. Never selected in production.
 */
export function createIdentityMiddleware(config: Env): RequestHandler {
  return (req, res, next) => {
    const injected = readSidecarIdentity(req);
    if (injected) {
      req.user = injected;
      next();
      return;
    }

    if (config.authMode === "sidecar") {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    const devSub = req.get("x-dev-sub");
    req.user = devSub
      ? { id: devSub, email: `${devSub}@workbench.local`, role: "member" }
      : { ...DEV_PRINCIPAL };
    next();
  };
}
