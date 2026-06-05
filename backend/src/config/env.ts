import { z } from "zod";

/** Case-insensitive `"true"`/`"false"` flag semantics. */
const boolFlag = z
  .string()
  .optional()
  .transform((v) => v?.toLowerCase() === "true");

const AuthMode = z.enum(["dev", "homectl"]);
export type AuthMode = z.infer<typeof AuthMode>;

const EnvSchema = z
  .object({
    NODE_ENV: z.string().default("development"),
    PORT: z.coerce.number().int().positive().default(8080),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    // Auth. `dev` resolves every request to a fixed local identity (no auth
    // service needed); `homectl` runs the real OAuth2 flow via the auth client.
    // Default mirrors NODE_ENV: real auth in production, bypass elsewhere.
    AUTH_MODE: AuthMode.optional(),
    APP_BASE_URL: z.string().default("http://localhost:3000"),
    AUTH_SERVICE_URL: z.string().default("https://auth.homectl.no"),
    AUTH_CLIENT_ID: z.string().default("workbench"),
    AUTH_CALLBACK_PATH: z.string().default("/auth/callback"),
    WORKBENCH_CLIENT_SECRET: z.string().optional(),

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
      (env.NODE_ENV === "production" ? "homectl" : "dev")) as AuthMode,
  }))
  .superRefine((env, ctx) => {
    if (env.authMode === "homectl" && !env.WORKBENCH_CLIENT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WORKBENCH_CLIENT_SECRET"],
        message: "WORKBENCH_CLIENT_SECRET is required when AUTH_MODE=homectl",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Validate and normalize the environment. Throws (fail fast) on misconfiguration. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}

export const env: Env = loadEnv();
