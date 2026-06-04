import type { Request, RequestHandler } from "express";
import type { Db } from "../db/kysely.js";
import { UserRepository, type UserRow } from "../storage/userRepository.js";
import type { AppUser } from "../auth/types.js";
import { HttpError } from "./error.js";

function toAppUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.app_role,
  };
}

/**
 * Map the verified provider identity (`req.user`, keyed by auth `sub`) to the
 * app's own user row, provisioning it just-in-time on first login. Sets
 * `req.userId` (the app uuid every content row is scoped by) and `req.appUser`.
 * Mount immediately after the provider's authMiddleware.
 */
export function resolveUser(db: Db): RequestHandler {
  const users = new UserRepository(db);
  return async (req, _res, next) => {
    try {
      const principal = req.user;
      if (!principal) throw new HttpError(401, "Not authenticated");
      const row = await users.upsertByAuthSub({
        authSub: principal.id,
        email: principal.email,
        appRole: principal.role,
      });
      req.userId = row.id;
      req.appUser = toAppUser(row);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Read the resolved app user, asserting resolveUser ran first. */
export function currentUser(req: Request): AppUser {
  if (!req.appUser) throw new HttpError(401, "Not authenticated");
  return req.appUser;
}
