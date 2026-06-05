-- Up Migration

-- Phase 6: tags on projects (ideas and items already carry a `tags` jsonb array
-- from migration 002). A text array stored as jsonb, validated/maintained in app
-- code like the other tag columns — filtering is local per list (ui-ux-design.md
-- §9.2), so no index is needed. Defaults to '[]' so existing rows are valid and
-- the LWW upsert in storage/syncRepository.ts can treat it like ideas.tags.
ALTER TABLE projects
    ADD COLUMN tags JSONB NOT NULL DEFAULT '[]'::jsonb;
