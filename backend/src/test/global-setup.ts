import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../db/migrate.js";

// Expose the container connection URI to test files via Vitest's inject().
declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

// One real Postgres for the whole test run; migrations applied once. Tests get
// isolation via TRUNCATE between cases (see test/db.ts).
// Vitest 5 calls global setup with the TestProject (provide lives on the project).
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  const uri = container.getConnectionUri();
  await runMigrations(uri);
  project.provide("databaseUrl", uri);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
