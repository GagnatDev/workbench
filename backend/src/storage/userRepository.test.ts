import { describe, expect, it } from "vitest";
import { UserRepository } from "./userRepository.js";
import { testDb, useCleanDb } from "../test/db.js";

describe("UserRepository", () => {
  useCleanDb();

  it("provisions a new user on first upsert", async () => {
    const users = new UserRepository(testDb());
    const row = await users.upsertByAuthSub({
      authSub: "homectl|abc",
      email: "maker@example.com",
      appRole: "member",
    });

    expect(row.id).toBeTruthy();
    expect(row.auth_sub).toBe("homectl|abc");
    expect(row.email).toBe("maker@example.com");
    expect(row.app_role).toBe("member");
    expect(await users.count()).toBe(1);
  });

  it("touches the existing row (no duplicate) and refreshes cached fields", async () => {
    const users = new UserRepository(testDb());
    const first = await users.upsertByAuthSub({
      authSub: "homectl|abc",
      email: "old@example.com",
      appRole: "member",
    });
    const second = await users.upsertByAuthSub({
      authSub: "homectl|abc",
      email: "new@example.com",
      appRole: "admin",
    });

    expect(second.id).toBe(first.id);
    expect(second.email).toBe("new@example.com");
    expect(second.app_role).toBe("admin");
    expect(await users.count()).toBe(1);
  });

  it("finds by auth_sub and by id", async () => {
    const users = new UserRepository(testDb());
    const created = await users.upsertByAuthSub({
      authSub: "homectl|xyz",
      email: null,
      appRole: null,
    });

    expect(await users.findByAuthSub("homectl|xyz")).toMatchObject({ id: created.id });
    expect(await users.findById(created.id)).toMatchObject({ auth_sub: "homectl|xyz" });
    expect(await users.findByAuthSub("missing")).toBeUndefined();
  });
});
