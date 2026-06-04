import { sql } from "kysely";
import type { Db } from "../db/kysely.js";

export interface UserRow {
  id: string;
  auth_sub: string;
  email: string | null;
  display_name: string | null;
  app_role: string | null;
}

const USER_COLUMNS = [
  "id",
  "auth_sub",
  "email",
  "display_name",
  "app_role",
] as const;

export interface UpsertUserInput {
  authSub: string;
  email: string | null;
  appRole: string | null;
}

export class UserRepository {
  constructor(private readonly db: Db) {}

  findByAuthSub(authSub: string): Promise<UserRow | undefined> {
    return this.db
      .selectFrom("users")
      .select(USER_COLUMNS)
      .where("auth_sub", "=", authSub)
      .executeTakeFirst();
  }

  findById(id: string): Promise<UserRow | undefined> {
    return this.db
      .selectFrom("users")
      .select(USER_COLUMNS)
      .where("id", "=", id)
      .executeTakeFirst();
  }

  async count(): Promise<number> {
    const row = await this.db
      .selectFrom("users")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /**
   * Just-in-time provisioning. Atomic insert-or-touch keyed on `auth_sub` so two
   * concurrent first requests can't create duplicate rows. Always refreshes the
   * cached email/role and last_seen_at, then returns the authoritative row.
   */
  async upsertByAuthSub(input: UpsertUserInput): Promise<UserRow> {
    const row = await this.db
      .insertInto("users")
      .values({
        auth_sub: input.authSub,
        email: input.email,
        app_role: input.appRole,
      })
      .onConflict((oc) =>
        oc.column("auth_sub").doUpdateSet({
          email: input.email,
          app_role: input.appRole,
          last_seen_at: sql`now()`,
          updated_at: sql`now()`,
        }),
      )
      .returning(USER_COLUMNS)
      .executeTakeFirstOrThrow();
    return row;
  }
}
