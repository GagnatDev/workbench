import type { RequestHandler } from "express";

/**
 * The authenticated principal as seen from the auth provider. `id` is the auth
 * service's subject (`sub`) — the provider's identifier, NOT the app's user id.
 * It is mapped to the app's own `users.id` by resolveUser. Shape matches
 * `@gagnatdev/homectl-auth-client`'s `req.user` so the real and dev providers
 * are interchangeable.
 */
export interface AuthUser {
  /** Auth provider subject (homectl JWT `sub`). Stored as `users.auth_sub`. */
  id: string;
  email: string | null;
  isAdmin: boolean;
  /** Role within this app (from the token's `apps[]` entry for our client id). */
  role: string | null;
}

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
 * `req.user`. The OAuth callback/logout handlers exist only for the real
 * (homectl) provider; the dev provider omits them.
 */
export interface AuthProvider {
  authMiddleware: RequestHandler;
  callbackHandler?: RequestHandler;
  logoutHandler?: RequestHandler;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by the auth provider's middleware (provider identity). */
      user?: AuthUser;
      /** App-owned uuid set by resolveUser — scope all queries by this. */
      userId?: string;
      /** Full app user record set by resolveUser. */
      appUser?: AppUser;
    }
  }
}
