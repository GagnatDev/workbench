import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { BASE_URL, PORT } from "./config";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Local MinIO credentials (mirror docker-compose.yml). */
const MINIO = {
  user: "workbench",
  password: "workbench-dev-secret",
  bucket: "homectl-workbench",
  region: "us-east-1",
};

export type Teardown = () => Promise<void>;

function log(msg: string): void {
  console.log(`[e2e-setup] ${msg}`);
}

/**
 * Resolve infra (Testcontainers locally, GitHub service containers in CI), build
 * the SPA, launch the backend serving it, and wait until healthy. Returns a
 * teardown closure that stops the backend and any containers it started.
 *
 * CI is detected by DATABASE_URL + S3_ENDPOINT already being set (the workflow
 * provides postgres + minio services); otherwise we start our own containers.
 */
export async function startStack(): Promise<Teardown> {
  const usingExternalInfra = !!process.env.DATABASE_URL && !!process.env.S3_ENDPOINT;
  let pg: StartedPostgreSqlContainer | undefined;
  let minio: StartedTestContainer | undefined;

  if (usingExternalInfra) {
    log("using DATABASE_URL + S3_ENDPOINT from the environment (CI services)");
  } else {
    // We stop the containers ourselves in teardown, so the Ryuk reaper is just an
    // extra moving part — and a flaky one between back-to-back runs ("Failed to
    // connect to Reaper"). Opt out unless the caller insists.
    process.env.TESTCONTAINERS_RYUK_DISABLED ??= "true";

    log("starting Postgres (testcontainers)…");
    pg = await new PostgreSqlContainer("postgres:16-alpine").start();
    process.env.DATABASE_URL = pg.getConnectionUri();

    log("starting MinIO (testcontainers)…");
    minio = await new GenericContainer("minio/minio:latest")
      .withEnvironment({
        MINIO_ROOT_USER: MINIO.user,
        MINIO_ROOT_PASSWORD: MINIO.password,
      })
      .withCommand(["server", "/data"])
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
      .start();

    // The presigned PUT URL embeds this endpoint and the browser must reach the
    // exact same host:port (SigV4 signs the host), so the backend and the browser
    // both use the mapped address.
    const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
    process.env.S3_ENDPOINT = endpoint;
    process.env.S3_REGION = MINIO.region;
    process.env.S3_BUCKET = MINIO.bucket;
    process.env.S3_ACCESS_KEY_ID = MINIO.user;
    process.env.S3_SECRET_ACCESS_KEY = MINIO.password;
    process.env.S3_FORCE_PATH_STYLE = "true";
    log(`MinIO started at ${endpoint}`);
  }

  // Ensure the bucket exists either way — local MinIO has none, and in CI this is
  // more robust than relying on the service image's default-bucket feature. The
  // retry doubles as a readiness wait for the S3 endpoint.
  await ensureBucket();

  await buildFrontend();
  const backend = await startBackend();

  return async () => {
    await stopBackend(backend);
    if (minio) await minio.stop();
    if (pg) await pg.stop();
  };
}

/**
 * Create the configured bucket if absent, reading the resolved S3 env (works for
 * both local MinIO and CI services). Retries for ~30s so it doubles as a readiness
 * wait for the endpoint; idempotent (a pre-existing bucket is success).
 */
async function ensureBucket(): Promise<void> {
  const bucket = process.env.S3_BUCKET!;
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  const deadline = Date.now() + 30_000;
  try {
    for (;;) {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        log(`bucket ${bucket} ready`);
        return;
      } catch (err) {
        const name = (err as { name?: string }).name ?? "";
        if (name.startsWith("BucketAlready")) {
          log(`bucket ${bucket} already exists`);
          return;
        }
        if (Date.now() >= deadline) throw err;
        await new Promise((r) => setTimeout(r, 1000)); // endpoint not ready yet
      }
    }
  } finally {
    s3.destroy();
  }
}

async function buildFrontend(): Promise<void> {
  if (process.env.E2E_SKIP_BUILD === "1") {
    log("E2E_SKIP_BUILD=1 — reusing existing frontend/dist");
    return;
  }
  log("building the SPA (vite build, auth disabled)…");
  await run("pnpm", ["--filter", "@workbench/frontend", "run", "build"], {
    // VITE_DISABLE_AUTH skips the login screen; empty VITE_API_URL keeps the API
    // same-origin so it hits the backend that serves this bundle.
    VITE_DISABLE_AUTH: "true",
    VITE_API_URL: "",
  });
}

async function startBackend(): Promise<ChildProcess> {
  log(`starting backend on ${BASE_URL} (serving frontend/dist)…`);
  const child = spawn("pnpm", ["--filter", "@workbench/backend", "exec", "tsx", "src/server.ts"], {
    cwd: REPO_ROOT,
    // detached so we can signal the whole process group on teardown (pnpm → tsx →
    // node); otherwise SIGTERM to pnpm would orphan the node server.
    detached: true,
    env: {
      ...process.env,
      PORT: String(PORT),
      AUTH_MODE: "dev",
      NODE_ENV: "test",
      WEB_ROOT: path.join(REPO_ROOT, "frontend", "dist"),
      LOG_LEVEL: process.env.E2E_DEBUG ? "info" : "warn",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[backend] ${d}`));
  child.on("exit", (code) => {
    if (code) console.error(`[e2e-setup] backend exited early with code ${code}`);
  });

  await waitForHealth(`${BASE_URL}/health`, 60_000);
  log("backend healthy");
  return child;
}

async function stopBackend(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  try {
    process.kill(-child.pid, "SIGTERM"); // negative pid → the whole process group
  } catch {
    return; // already gone
  }
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {
      /* ignore */
    }
  }, 10_000);
  await exited;
  clearTimeout(timer);
}

/** Poll an HTTP endpoint until it returns 2xx, or throw after `timeoutMs`. */
async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = `status ${res.status}`;
    } catch (err) {
      lastErr = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`backend did not become healthy at ${url} within ${timeoutMs}ms (${lastErr})`);
}

/** Run a command to completion, inheriting stdio; reject on a non-zero exit. */
function run(cmd: string, args: string[], extraEnv: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`)),
    );
  });
}
