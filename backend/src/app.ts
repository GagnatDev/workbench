import { existsSync } from "node:fs";
import path from "node:path";
import express, { Router, type Express, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import type { Db } from "./db/kysely.js";
import type { AuthProvider } from "./auth/types.js";
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
  authProvider: AuthProvider;
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
  const { db, authProvider } = deps;
  const app = express();
  // Behind the K8s Ingress: trust X-Forwarded-* so req.ip / protocol are correct.
  app.set("trust proxy", true);
  app.use(httpLogger);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(cors({ origin: true, credentials: true }));

  app.use(healthRouter);

  // OAuth logout (real provider only; public, no resolveUser).
  //
  // No `/auth/callback` mount: login is SPA-initiated, so the callback is owned
  // by the front-end (src/auth/Callback.tsx), which validates its own CSRF state
  // and re-bootstraps from the auth service's session cookie. Routing it to the
  // client lib's callbackHandler would fail — that handler requires a server-set
  // `homectl_auth_state` cookie that only the server-initiated flow ever writes.
  // Leaving it unmounted lets the SPA fallback below serve the callback route.
  if (authProvider.logoutHandler) {
    app.post("/auth/logout", authProvider.logoutHandler);
  }

  // Authenticated API: verify token -> map to app user (JIT-provision) -> routes.
  const api = Router();
  api.use(authProvider.authMiddleware);
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
