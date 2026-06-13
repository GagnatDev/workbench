-- Up Migration

-- Phase 7: a small base64 thumbnail carried inline on the attachment row. The
-- frontend generates a ~256px WebP at capture and stores it here so it rides the
-- normal data sync — every device receives the thumbnail with the metadata pull
-- and renders list/grid views instantly, with no extra image request. The full
-- image stays in object storage and is fetched only when viewed at full size.
--
-- Nullable with no default: existing rows stay valid (NULL until backfilled on
-- first view), and the LWW upsert in storage/syncRepository.ts never clobbers a
-- real thumbnail because the client always pushes the column from its local row.
ALTER TABLE attachments
    ADD COLUMN thumb TEXT;
