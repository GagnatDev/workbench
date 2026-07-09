import { existsSync } from "node:fs";
import path from "node:path";
import express, {
  Router,
  type Express,
  type RequestHandler,
  type Response,
} from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import type { Db } from "./db/kysely.js";
import { httpLogger } from "./logger.js";
import { errorHandler } from "./middleware/error.js";
import { resolveUser } from "./middleware/resolveUser.js";
import { healthRouter } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { accountRoutes } from "./routes/account.js";
import { syncRoutes } from "./routes/sync.js";
import { uploadRoutes } from "./routes/uploads.js";
import { inviteRoutes } from "./routes/invites.js";

export interface AppDeps {
  db: Db;
  /**
   * Populates `req.user` from the sidecar-injected `X-Homectl-*` headers (see
   * auth/identity.ts). The auth-proxy owns the OAuth flow, `/auth/callback`, and
   * `/auth/logout`; the app only reads the injected identity.
   */
  identity: RequestHandler;
  /** Directory of the built SPA to serve. Defaults to `<cwd>/web`; skipped if absent. */
  webRoot?: string;
}

function setStaticCacheHeaders(res: Response, filePath: string): void {
  if (filePath.endsWith("index.html") || filePath.endsWith("sw.js")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "public, max-age=3600");
  }
}

/**
 * Assemble the Express application. Returns the app without listening so it can
 * be driven in-process by supertest.
 */
export function buildApp(deps: AppDeps): Express {
  const { db, identity } = deps;
  const app = express();
  // Behind the auth-proxy sidecar (and the K8s Ingress in front of it): trust
  // X-Forwarded-* so req.ip / protocol are correct.
  app.set("trust proxy", true);
  app.use(httpLogger);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(cors({ origin: true, credentials: true }));

  app.use(healthRouter);

  // The auth-proxy sidecar owns `/auth/callback` and `/auth/logout` (it runs the
  // OAuth flow and clears the session); those paths never reach the app. Point
  // the front-end logout button at `POST /auth/logout` — the sidecar handles it.

  // Authenticated API: read injected identity -> map to app user
  // (JIT-provision) -> routes.
  const api = Router();
  api.use(identity);
  api.use(resolveUser(db));
  api.use(meRoutes());
  api.use(accountRoutes(db));
  api.use(syncRoutes(db));
  api.use(uploadRoutes(db));
  api.use(inviteRoutes());
  app.use("/api", api);

  // Serve the built SPA (single-container topology). express.static handles real
  // files; the terminal handler serves index.html for client-side routes. Skipped
  // when the directory is absent (local dev / tests).
  const webRoot = deps.webRoot ?? path.resolve(process.cwd(), "web");
  if (existsSync(webRoot)) {
    const indexHtml = path.join(webRoot, "index.html");
    app.use(express.static(webRoot, { setHeaders: setStaticCacheHeaders }));
    // Express 5: no bare "*" route — use a named splat and skip API paths.
    app.get("/*splat", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
