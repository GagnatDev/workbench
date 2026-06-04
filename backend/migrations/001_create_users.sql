-- Up Migration

-- App-owned identity. Decouples Workbench from the auth provider: the homectl-auth
-- JWT `sub` is stored once here (auth_sub); every content table (Phase 2+) scopes
-- by user_id -> users.id, never the sub. A row is provisioned just-in-time on a
-- person's first authenticated request (see middleware/resolveUser.ts).
CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_sub     TEXT NOT NULL UNIQUE,
    email        TEXT,
    display_name TEXT,
    app_role     TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
