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
import { authGatewayRoutes } from "./routes/authGateway.js";
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

  // Browser-facing auth flows (/auth/login|callback|refresh|logout), fronting
  // the auth service over the in-cluster address. Empty under dev auth, where
  // these paths fall through to the SPA fallback below. Mounted BEFORE cors():
  // /auth/refresh trades the session cookie for a readable access token, and
  // the permissive reflect-any-origin CORS below would let any site do that
  // cross-origin — with no CORS headers, these endpoints stay same-origin only.
  app.use(authGatewayRoutes());

  app.use(cors({ origin: true, credentials: true }));

  app.use(healthRouter);

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
