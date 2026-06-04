import { defineConfig } from "tsup";

// Single bundled ESM artifact for the production runtime image: no node_modules
// needed at runtime. `pino-pretty` is dev-only (prod logs plain JSON) and
// `pg-native` is an optional peer of `pg` we never install, so both are
// externalized to keep esbuild from trying to bundle them.
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node24",
  platform: "node",
  bundle: true,
  splitting: false,
  clean: true,
  sourcemap: true,
  // Inline every dependency so the runtime image needs no node_modules. `external`
  // wins over `noExternal`.
  noExternal: [/.*/],
  external: [
    "pg-native",
    "pino-pretty",
    // The private auth client is dynamically imported only under AUTH_MODE=homectl.
    // It is not installed in the default (dev) build, so keep esbuild from trying
    // to resolve it — node resolves it at runtime when real auth is enabled.
    "@gagnatdev/homectl-auth-client",
    "@gagnatdev/homectl-auth-client/server",
  ],
  // Define a real module-scoped `require` so esbuild's CJS interop shim works for
  // bundled CommonJS deps (express et al.). Aliased to avoid a duplicate
  // `createRequire` declaration with deps that import it themselves.
  banner: {
    js: "import { createRequire as __nodeCreateRequire } from 'module'; const require = __nodeCreateRequire(import.meta.url);",
  },
  // node-pg-migrate reads the plain-SQL files from disk at runtime, so copy them
  // next to the bundle (migrate.ts resolves ./migrations relative to the bundle).
  onSuccess: "mkdir -p dist/migrations && cp migrations/*.sql dist/migrations/",
});
