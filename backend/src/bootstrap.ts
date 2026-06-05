import type { Server } from "node:http";
import type { Pool } from "pg";
import { buildApp } from "./app.js";
import { createAuthProvider } from "./auth/index.js";
import { createDb } from "./db/kysely.js";
import { createPool } from "./db/pool.js";
import { env } from "./config/env.js";
import { logger } from "./logger.js";

export interface StartedServer {
  server: Server;
  pool: Pool;
}

/**
 * Wire provider + pool -> Kysely -> Express and start listening. Migrations are
 * run by the caller (server.ts) before this.
 */
export async function startServer(connectionString?: string): Promise<StartedServer> {
  const pool = createPool(connectionString);
  const db = createDb(pool);
  const authProvider = await createAuthProvider();

  const app = buildApp({ db, authProvider, webRoot: env.WEB_ROOT });

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT, authMode: env.authMode }, "backend listening");
      resolve(s);
    });
  });

  registerShutdown(server, pool);
  return { server, pool };
}

/** Graceful shutdown: stop accepting connections, drain, then close the pool. */
function registerShutdown(server: Server, pool: Pool): void {
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
