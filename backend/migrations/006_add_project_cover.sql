-- Up Migration

-- Project cover image. Encodes the project's chosen "main" image, resolved into
-- the list thumbnail and the overview hero on the client:
--   NULL            -> automatic (oldest promoted-idea photo, else a default motif)
--   'default:<key>' -> a built-in abstract motif
--   'att:<id>'      -> a specific attachment (a promoted-idea/item photo, or one
--                      uploaded straight onto the project, owner_type = 'project')
-- Changing the cover only re-points this pointer, so prior images are never lost.
--
-- Nullable with no default: existing rows stay valid (NULL = automatic), and the
-- LWW upsert in storage/syncRepository.ts never clobbers a real choice because the
-- client always pushes the column from its local row.
ALTER TABLE projects
    ADD COLUMN cover TEXT;
