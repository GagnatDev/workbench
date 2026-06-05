/**
 * One source of truth for the app-under-test address, imported by both
 * playwright.config.ts (to set `baseURL`) and stack.ts (to launch the backend on
 * the matching port). `baseURL` is resolved in the config at load time — *before*
 * globalSetup runs — so the port must be deterministic here, not discovered later.
 *
 * The port is fixed (overridable via E2E_PORT) rather than ephemeral so the value
 * is known to the config without a round-trip from the harness.
 */
export const PORT = Number(process.env.E2E_PORT ?? 8099);
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/** The locale the suite pins (the app defaults to nb; we pin for stable selectors). */
export const TEST_LOCALE = "en";

/** i18n persistence key (frontend/src/i18n/index.ts STORAGE_KEY). */
export const LANG_STORAGE_KEY = "workbench.lang";
