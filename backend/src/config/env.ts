import { z } from "zod";

/** Case-insensitive `"true"`/`"false"` flag semantics. */
const boolFlag = z
  .string()
  .optional()
  .transform((v) => v?.toLowerCase() === "true");

const AuthMode = z.enum(["dev", "sidecar"]);
export type AuthMode = z.infer<typeof AuthMode>;

const EnvSchema = z
  .object({
    NODE_ENV: z.string().default("development"),
    PORT: z.coerce.number().int().positive().default(8080),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    // Auth. The app reads identity from the `X-Homectl-*` headers injected by the
    // auth-proxy sidecar (no token handling of its own). `dev` synthesizes a
    // local identity when those headers are absent (no sidecar in front);
    // `sidecar` treats their absence as unauthenticated. Default mirrors
    // NODE_ENV: trust the sidecar in production, synthesize elsewhere.
    AUTH_MODE: AuthMode.optional(),
    // Public homectl-auth URL — used only to build the human-clickable invite
    // redemption link (`/invite?token=...`).
    AUTH_SERVICE_URL: z.string().default("https://auth.homectl.no"),
    // In-cluster address for server-to-server auth calls (invite forwarding),
    // e.g. http://homectl-auth.homectl.svc.cluster.local. Keeps backend traffic
    // on cluster service discovery instead of the public auth ingress. Falls back
    // to AUTH_SERVICE_URL when unset (local dev).
    AUTH_INTERNAL_URL: z.string().optional(),
    // The app's registered id in homectl-auth's apps.json; sent as the invite
    // `appId`. Matches the sidecar's AUTH_CLIENT_ID.
    AUTH_CLIENT_ID: z.string().default("workbench"),

    // Object storage (Phase 3+). Optional until photo attachments land.
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: boolFlag,

    // Directory of the built SPA to serve (single-container topology). Unset in
    // local dev/tests (the SPA is served by Vite); set by the e2e harness to
    // frontend/dist and by the Docker image to its bundled web root.
    WEB_ROOT: z.string().optional(),

    LOG_LEVEL: z.string().optional(),
  })
  .transform((env) => ({
    ...env,
    authMode: (env.AUTH_MODE ??
      (env.NODE_ENV === "production" ? "sidecar" : "dev")) as AuthMode,
  }));

export type Env = z.infer<typeof EnvSchema>;

/** Validate and normalize the environment. Throws (fail fast) on misconfiguration. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}

export const env: Env = loadEnv();
