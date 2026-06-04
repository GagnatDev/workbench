-- Up Migration

-- The six syncable content tables (domain-model.md). Every row is scoped by
-- user_id and carries the uniform last-write-wins (LWW) sync envelope:
--   id          client-generated uuid PK (so offline creation needs no round-trip)
--   user_id     -> users.id, the app's own identity; FORCED from the token on
--                 every write (the server never trusts a client-supplied value)
--   created_at  set once on first insert
--   updated_at  server-stamped on every accepted write; drives both LWW conflict
--                 resolution and the pull cursor (see storage/syncRepository.ts)
--   deleted     tombstone — we never hard-delete, so deletions propagate on pull
-- Orderable tables also carry `rank` (fractional/lexicographic string) so two
-- offline reorders can insert-between without renumbering and without colliding.
--
-- Only user_id has a foreign key. There are deliberately NO foreign keys between
-- content tables: under LWW sync a child row can arrive before its parent (any
-- push order, any device), so referential integrity is eventual and enforced in
-- app code, not by the DB. The user_id FK (ON DELETE CASCADE) lets a person's
-- whole dataset be removed in one step and keeps the test TRUNCATE simple.
--
-- Per-row payload shapes (projects.stages/details, items.payload, *.tags) are
-- validated in app code (Zod) on write, not by the DB — adding an item `kind` is
-- a schema no-op (Phase 5).

CREATE TABLE collections (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    rank       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX collections_user_updated_idx ON collections (user_id, updated_at);

CREATE TABLE projects (
    id            UUID PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT,
    collection_id UUID,                                  -- nullable; no FK (see header)
    status        TEXT,                                  -- current stage label
    stages        JSONB NOT NULL DEFAULT '[]'::jsonb,    -- ordered customizable stage list
    details       JSONB NOT NULL DEFAULT '{}'::jsonb,    -- one-off specs (dimensions, firing temp…)
    favourite     BOOLEAN NOT NULL DEFAULT false,        -- pins to top of Projects list (UI §5)
    rank          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted       BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX projects_user_updated_idx ON projects (user_id, updated_at);

CREATE TABLE sections (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_id UUID NOT NULL,                            -- no FK (see header)
    kind       TEXT NOT NULL,                            -- journal | moodboard | checklist | materials
    name       TEXT NOT NULL,
    rank       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX sections_user_updated_idx ON sections (user_id, updated_at);

CREATE TABLE items (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    section_id UUID NOT NULL,                            -- no FK (see header)
    title      TEXT,
    body       TEXT,
    payload    JSONB NOT NULL DEFAULT '{}'::jsonb,       -- kind-specific (entry/task/pin/material)
    tags       JSONB NOT NULL DEFAULT '[]'::jsonb,       -- text array
    rank       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX items_user_updated_idx ON items (user_id, updated_at);

CREATE TABLE ideas (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    content    TEXT NOT NULL DEFAULT '',
    link       TEXT,
    project_id UUID,                                     -- null = global Inbox, else project Inbox; no FK
    state      TEXT NOT NULL DEFAULT 'captured',         -- captured | kept | archived | promoted | filed
    tags       JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX ideas_user_updated_idx ON ideas (user_id, updated_at);

CREATE TABLE attachments (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    owner_type   TEXT NOT NULL,                          -- idea | item
    owner_id     UUID NOT NULL,                          -- no FK (polymorphic owner; see header)
    storage_key  TEXT,                                   -- S3 object key (set after presigned upload)
    content_type TEXT,
    uploaded     BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted      BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX attachments_user_updated_idx ON attachments (user_id, updated_at);
