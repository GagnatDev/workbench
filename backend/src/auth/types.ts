/**
 * The authenticated principal, read from the `X-Homectl-*` headers the auth-proxy
 * sidecar injects on every proxied request (see the sidecar integration guide §4).
 * `id` is the auth service's subject (JWT `sub`) — the provider's identifier, NOT
 * the app's user id. It is mapped to the app's own `users.id` by resolveUser.
 */
export interface AuthUser {
  /** JWT `sub`, from `X-Homectl-User`. */
  id: string;
  /** From `X-Homectl-Email`. */
  email: string | null;
  /** App role from `X-Homectl-Role` (e.g. `admin`); null when the user has none. */
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

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Auth principal set by the identity middleware (from `X-Homectl-*`). */
      user?: AuthUser;
      /** App-owned uuid set by resolveUser — scope all queries by this. */
      userId?: string;
      /** Full app user record set by resolveUser. */
      appUser?: AppUser;
    }
  }
}
