import { Router, type Request, type Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env, type Env } from "../config/env.js";
import { logger } from "../logger.js";

/**
 * Same-origin gateway for the browser-facing auth flows. The SPA talks only to
 * its own origin; this router fronts the auth service over AUTH_INTERNAL_URL
 * (in-cluster service discovery), so the auth service's public ingress carries
 * nothing but the human-interactive hosted login (/authorize and friends).
 *
 *   GET  /auth/login     -> 302 to the auth service's public /authorize
 *   GET  /auth/callback  -> validate state, exchange the code in-cluster, then
 *                           bounce into the SPA
 *   POST /auth/refresh   -> proxy to <internal>/refresh, relaying the session
 *                           cookie both ways (the auth service rotates it)
 *   POST /auth/logout    -> proxy to <internal>/logout
 *
 * This only works because homectl-auth scopes its refresh cookie to
 * `Domain=.homectl.no`: the browser sends it to workbench.homectl.no too, so we
 * have a credential to forward, and a relayed Set-Cookie from the rotation is
 * accepted back. The session itself still lives with the auth service — we
 * hold no token state here; the /token response is discarded (only an access
 * token, already superseded by the cookie flow).
 *
 * Under dev auth there is no auth service, so the router is empty and these
 * paths fall through to the SPA fallback (matching the pre-gateway behavior
 * where /auth/callback was a client-side route).
 */

const STATE_COOKIE = "workbench_auth_state";
const STATE_COOKIE_MAX_AGE = 10 * 60 * 1000;

interface StatePayload {
  nonce: string;
  returnTo: string;
}

function signState(payload: StatePayload, secret: string): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifyState(value: string, secret: string): StatePayload | null {
  const [b64, sig] = value.split(".");
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", secret).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(b64, "base64url").toString("utf-8")) as StatePayload;
  } catch {
    return null;
  }
}

/** Only same-origin absolute paths — anything else (or `//host`) falls back to `/`. */
function sanitizeReturnTo(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export function authGatewayRoutes(config: Env = env): Router {
  const router = Router();
  if (config.authMode !== "homectl") return router;

  // superRefine guarantees the secret in homectl mode; it doubles as the state
  // cookie's HMAC key (same role it plays in the auth client package).
  const secret = config.WORKBENCH_CLIENT_SECRET!;
  const internalBase = config.AUTH_INTERNAL_URL ?? config.AUTH_SERVICE_URL;
  const redirectUri = `${config.APP_BASE_URL}${config.AUTH_CALLBACK_PATH}`;
  const secure = config.NODE_ENV === "production";

  router.get("/auth/login", (req: Request, res: Response) => {
    const payload: StatePayload = {
      nonce: randomBytes(16).toString("hex"),
      returnTo: sanitizeReturnTo(req.query.return_to),
    };
    res.cookie(STATE_COOKIE, signState(payload, secret), {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: STATE_COOKIE_MAX_AGE,
    });

    const authorizeUrl = new URL(`${config.AUTH_SERVICE_URL}/authorize`);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", config.AUTH_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", payload.nonce);
    res.redirect(302, authorizeUrl.toString());
  });

  router.get(config.AUTH_CALLBACK_PATH, async (req: Request, res: Response) => {
    // Every failure lands on the sign-in screen rather than a JSON error — this
    // is a browser navigation, and all causes (stale bookmark, expired state,
    // tampering) resolve the same way: log in again.
    const fail = (reason: string): void => {
      logger.warn({ reason }, "auth callback rejected");
      res.redirect(302, "/login");
    };

    const cookieValue = (req.cookies as Record<string, string | undefined>)[STATE_COOKIE];
    if (!cookieValue) return fail("missing_state_cookie");
    res.clearCookie(STATE_COOKIE);

    const state = verifyState(cookieValue, secret);
    if (!state) return fail("invalid_state_cookie");

    const { code, state: returnedState } = req.query as Record<string, string | undefined>;
    if (returnedState !== state.nonce) return fail("state_mismatch");
    if (!code) return fail("missing_code");

    // Complete the code exchange in-cluster. The response is discarded: the
    // browser's session is the refresh cookie the hosted login already set,
    // not this short-lived access token.
    try {
      const upstream = await fetch(`${internalBase}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          client_id: config.AUTH_CLIENT_ID,
          client_secret: secret,
          redirect_uri: redirectUri,
        }),
      });
      if (!upstream.ok) return fail(`token_exchange_failed_${upstream.status}`);
    } catch (err) {
      logger.warn({ err }, "auth callback token exchange unreachable");
      res.redirect(302, "/login");
      return;
    }

    res.redirect(302, state.returnTo);
  });

  // Cookie-relaying proxy for the session endpoints. The auth service rotates
  // the refresh cookie on every /refresh, so the upstream Set-Cookie must reach
  // the browser verbatim — dropping it would strand the client on a dead token.
  function proxySession(path: "/refresh" | "/logout") {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        const upstream = await fetch(`${internalBase}${path}`, {
          method: "POST",
          headers: req.headers.cookie ? { cookie: req.headers.cookie } : undefined,
        });
        const setCookies = upstream.headers.getSetCookie();
        if (setCookies.length > 0) res.setHeader("Set-Cookie", setCookies);
        res.status(upstream.status);
        res.setHeader("Cache-Control", "no-store");
        const contentType = upstream.headers.get("content-type");
        if (contentType) res.type(contentType);
        const body = await upstream.text();
        if (body) {
          res.send(body);
        } else {
          res.end();
        }
      } catch (err) {
        logger.warn({ err, path }, "auth session proxy failed");
        res.status(502).json({ error: "auth_service_unreachable" });
      }
    };
  }

  router.post("/auth/refresh", proxySession("/refresh"));
  router.post("/auth/logout", proxySession("/logout"));

  return router;
}
