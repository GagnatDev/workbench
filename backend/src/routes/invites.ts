import { Router } from "express";
import { z } from "zod";
import { env, type Env } from "../config/env.js";
import { HttpError } from "../middleware/error.js";
import { logger } from "../logger.js";

const inviteSchema = z.object({
  email: z.string().email(),
});

/**
 * "Invite a friend" (the plan's optional Phase 6 stretch). A thin forwarder: the
 * app holds no invite state of its own — it relays the caller's bearer to the
 * central auth service, which owns invites and decides whether this user may
 * issue one (admins, per homectl-auth). We add `appId`/`role` so the invitee is
 * scoped to Workbench as a member.
 *
 *   POST /api/invites { email } -> auth.homectl.no/api/invites { email, appId, role }
 *
 * Only meaningful under real auth — in dev mode there's no auth service to call,
 * so we 501 rather than pretend.
 */
export function inviteRoutes(config: Env = env): Router {
  const router = Router();

  router.post("/invites", async (req, res, next) => {
    try {
      if (config.authMode !== "homectl") {
        throw new HttpError(501, "Invites are only available with homectl auth");
      }
      const bearer = req.headers.authorization;
      if (!bearer) throw new HttpError(401, "Not authenticated");

      const parsed = inviteSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "A valid email is required");

      const upstream = await fetch(`${config.AUTH_SERVICE_URL}/api/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: bearer },
        body: JSON.stringify({
          email: parsed.data.email,
          appId: config.AUTH_CLIENT_ID,
          role: "member",
        }),
      });

      const data: unknown = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        // Pass a client error (e.g. 403 not-an-admin, 409 already invited)
        // straight through; treat anything else as a bad-gateway from us.
        const message =
          (data as { error?: string; message?: string }).error ??
          (data as { message?: string }).message ??
          "Invite failed";
        const status =
          upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
        throw new HttpError(status, message);
      }

      res.json(data);
    } catch (err) {
      // A fetch rejection (auth service unreachable) is our 502, not a 500.
      if (err instanceof HttpError) return next(err);
      logger.warn({ err }, "invite forward failed");
      next(new HttpError(502, "Could not reach the auth service"));
    }
  });

  return router;
}
