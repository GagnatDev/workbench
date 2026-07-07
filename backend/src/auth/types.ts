import type { RequestHandler } from "express";
import type { AuthUser as HomectlAuthUser } from "@gagnatdev/homectl-auth-client/server";

/**
 * The authenticated principal as seen from the auth provider. `id` is the auth
 * service's subject (`sub`) — the provider's identifier, NOT the app's user id.
 * It is mapped to the app's own `users.id` by resolveUser. This IS the client
 * package's `req.user` type (aliased, not mirrored): the package augments
 * `Express.Request.user` globally, so a diverging local shape would conflict
 * with its declaration. The dev provider fills the same type.
 */
export type AuthUser = HomectlAuthUser;

/** The app's own user record, resolved from AuthUser by resolveUser. */
export interface AppUser {
  /** App-owned uuid — this is the `user_id` every content row is scoped by. */
  id: string;
  email: string | null;
  displayName: string | null;
  role: string | null;
}

/**
 * Pluggable auth backend. `authMiddleware` verifies the request and populates
 * `req.user`. The browser-facing OAuth flows (login/callback/refresh/logout)
 * live in routes/authGateway.ts, not on the provider.
 */
export interface AuthProvider {
  authMiddleware: RequestHandler;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // `user?: AuthUser` is declared by @gagnatdev/homectl-auth-client/server's
      // global augmentation — set by the provider's authMiddleware.
      /** App-owned uuid set by resolveUser — scope all queries by this. */
      userId?: string;
      /** Full app user record set by resolveUser. */
      appUser?: AppUser;
    }
  }
}
