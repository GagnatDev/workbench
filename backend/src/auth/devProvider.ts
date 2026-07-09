import type { Request, RequestHandler } from "express";
import type { AuthProvider, AuthUser } from "./types.js";

/**
 * Fixed local identity used when AUTH_MODE=dev. Lets the whole pipeline —
 * resolveUser JIT-provisioning, /api/me, every scoped query — run end-to-end
 * with no auth service. The `sub` is a stable sentinel so the same dev user row
 * is reused across restarts.
 */
export const DEV_PRINCIPAL: AuthUser = {
  id: "dev|00000000-0000-4000-8000-000000000001",
  email: "dev@workbench.local",
  isAdmin: true,
  role: "admin",
};

/**
 * Dev auth provider. A *missing* token resolves to the fixed dev principal. A
 * *present* token is still honored if it carries an `x-dev-sub` (lets tests
 * exercise multiple identities without a real JWT); otherwise the dev principal
 * is used. No signature verification — never selected in production.
 */
export function createDevProvider(): AuthProvider {
  const authMiddleware: RequestHandler = (req: Request, _res, next) => {
    const devSub = req.header("x-dev-sub");
    if (devSub) {
      req.user = {
        id: devSub,
        email: `${devSub}@workbench.local`,
        isAdmin: false,
        role: "member",
      };
    } else {
      req.user = { ...DEV_PRINCIPAL };
    }
    next();
  };
  return { authMiddleware };
}
