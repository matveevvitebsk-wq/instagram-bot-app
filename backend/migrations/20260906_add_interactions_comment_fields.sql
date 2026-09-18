ALTER TABLE public.interactions
    ADD COLUMN IF NOT EXISTS from_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS from_username VARCHAR(100),
    ADD COLUMN IF NOT EXISTS media_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS media_product_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS event_field VARCHAR(50),
    ADD COLUMN IF NOT EXISTS event_time BIGINT,
    ADD COLUMN IF NOT EXISTS page_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS event_object VARCHAR(50),
    ADD COLUMN IF NOT EXISTS comment_id VARCHAR(255);

COMMENT ON COLUMN public.interactions.from_id IS
    'Instagram comment author id (webhook value.from.id).';
COMMENT ON COLUMN public.interactions.from_username IS
    'Instagram comment author username (webhook value.from.username).';
COMMENT ON COLUMN public.interactions.media_id IS
    'Instagram media id of the post/Reels (webhook value.media.id).';
COMMENT ON COLUMN public.interactions.media_product_type IS
    'Publication format, e.g. REELS, FEED, STORY (webhook value.media.media_product_type).';
COMMENT ON COLUMN public.interactions.event_field IS
    'Webhook change type, e.g. comments (entry.changes[].field).';
COMMENT ON COLUMN public.interactions.event_time IS
    'Unix timestamp in seconds from webhook entry.time.';
COMMENT ON COLUMN public.interactions.page_id IS
    'Instagram professional account id that received the comment (entry.id).';
COMMENT ON COLUMN public.interactions.event_object IS
    'Webhook source, e.g. instagram (body.object).';
COMMENT ON COLUMN public.interactions.comment_id IS
    'Instagram comment id (webhook value.id).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_interactions_comment_id
    ON public.interactions (comment_id)
    WHERE comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interactions_media_id
    ON public.interactions (media_id);

CREATE INDEX IF NOT EXISTS idx_interactions_from_id
    ON public.interactions (from_id);

CREATE INDEX IF NOT EXISTS idx_interactions_page_id
    ON public.interactions (page_id);
