-- ════════════════════════════════════════════════════════════════
-- Дополнительные таблицы для полной работы приложения
-- Выполните в Supabase SQL Editor (Settings → SQL Editor)
-- ════════════════════════════════════════════════════════════════

-- ─── 1. Таблица Instagram аккаунтов ─────────────────────────────
CREATE TABLE IF NOT EXISTS ig_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES customer_profiles(id) ON DELETE CASCADE,
    page_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    display_name VARCHAR(100),
    profile_picture_url TEXT,
    followers_count BIGINT NOT NULL DEFAULT 0,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    -- ВАЖНО: в production шифруйте токен через pgcrypto
    -- access_token = pgp_sym_encrypt(token, current_setting('app.encryption_key'))
    access_token TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ig_accounts
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
    ADD COLUMN IF NOT EXISTS followers_count BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP WITH TIME ZONE;

UPDATE ig_accounts
SET display_name = NULL
WHERE display_name = username;

-- ─── 2. Таблица задач автоматизации ─────────────────────────────
CREATE TABLE IF NOT EXISTS automation_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES customer_profiles(id) ON DELETE CASCADE,
    ig_account_id VARCHAR(255),
    task_type VARCHAR(50) NOT NULL,
    -- pending | running | completed | failed | cancelled
    status VARCHAR(20) DEFAULT 'pending',
    payload JSONB DEFAULT '{}',
    result JSONB,
    error_message TEXT,
    schedule_at TIMESTAMP WITH TIME ZONE,
    -- true: trigger on comments under author posts (feed / Reels / saved live)
    comment_on_post BOOLEAN NOT NULL DEFAULT TRUE,
    exact_match BOOLEAN NOT NULL DEFAULT TRUE,
    all_content_types BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE automation_tasks
    ADD COLUMN IF NOT EXISTS comment_on_post BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE automation_tasks
    ALTER COLUMN comment_on_post SET DEFAULT TRUE;

ALTER TABLE automation_tasks
    ADD COLUMN IF NOT EXISTS exact_match BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS all_content_types BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE automation_tasks
    ADD COLUMN IF NOT EXISTS selected_media_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE automation_tasks
    ADD COLUMN IF NOT EXISTS check_subscription BOOLEAN NOT NULL DEFAULT TRUE;

-- Кодовые слова только в payload.trigger_keywords (массив).
-- payload.trigger_keyword больше не используется.
UPDATE automation_tasks
SET payload = jsonb_set(
    COALESCE(payload, '{}'::jsonb),
    '{trigger_keywords}',
    jsonb_build_array(trim(payload->>'trigger_keyword')),
    true
)
WHERE COALESCE(payload, '{}'::jsonb) ? 'trigger_keyword'
  AND length(trim(COALESCE(payload->>'trigger_keyword', ''))) > 0
  AND (
    jsonb_typeof(payload->'trigger_keywords') IS DISTINCT FROM 'array'
    OR jsonb_array_length(COALESCE(payload->'trigger_keywords', '[]'::jsonb)) = 0
  );

UPDATE automation_tasks
SET payload = payload - 'trigger_keyword'
WHERE payload ? 'trigger_keyword';

ALTER TABLE automation_funnels
    ADD COLUMN IF NOT EXISTS trigger_keywords JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE automation_funnels
SET trigger_keywords = jsonb_build_array(trim(trigger_keyword))
WHERE trigger_keyword IS NOT NULL
  AND length(trim(trigger_keyword)) > 0
  AND trigger_keywords = '[]'::jsonb;

ALTER TABLE automation_funnels
    DROP COLUMN IF EXISTS trigger_keyword;

-- Автоматическое обновление updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON automation_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 3. Расширение customer_profiles для Telegram ────────────────
-- (Выполните только если колонки ещё не добавлены)
ALTER TABLE customer_profiles
    ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(100) UNIQUE,
    ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS username VARCHAR(100),
    ADD COLUMN IF NOT EXISTS photo_url TEXT,
    ADD COLUMN IF NOT EXISTS language_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS instagram_page_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS instagram_access_token TEXT;

-- ─── 4. Индексы для производительности ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_owner_status ON automation_tasks(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON automation_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_owner ON ig_accounts(owner_id);
CREATE INDEX IF NOT EXISTS idx_users_owner_lead ON users(owner_id, lead_status);
CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id, created_at DESC);

-- ─── 5. RLS для новых таблиц ─────────────────────────────────────
ALTER TABLE ig_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_ig_accounts" ON ig_accounts
    FOR ALL TO authenticated
    USING (auth.uid() = owner_id);

CREATE POLICY "owner_tasks" ON automation_tasks
    FOR ALL TO authenticated
    USING (auth.uid() = owner_id);

-- ─── 6. Realtime для задач (уведомления в Mini App) ─────────────
-- Включите в Supabase Dashboard: Database → Replication → automation_tasks
-- ALTER TABLE automation_tasks REPLICA IDENTITY FULL;

-- ─── 7. Входы пользователя по устройству и системе ──────────────
-- 2026-09-05 cursor store device and OS types on each user login
CREATE TABLE IF NOT EXISTS user_login_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
    telegram_id VARCHAR(100) NOT NULL,
    device_kind VARCHAR(20) NOT NULL,
    os_type VARCHAR(20) NOT NULL,
    telegram_platform VARCHAR(40) NOT NULL DEFAULT 'unknown',
    login_count INTEGER NOT NULL DEFAULT 1,
    first_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_login_devices_device_kind_check
        CHECK (device_kind IN ('phone', 'tablet', 'computer')),
    CONSTRAINT user_login_devices_os_type_check
        CHECK (os_type IN ('ios', 'android', 'windows', 'macos', 'linux', 'unknown')),
    CONSTRAINT user_login_devices_owner_device_os_key
        UNIQUE (owner_id, device_kind, os_type)
);

CREATE INDEX IF NOT EXISTS idx_user_login_devices_owner
    ON user_login_devices (owner_id, last_login_at DESC);

ALTER TABLE user_login_devices ENABLE ROW LEVEL SECURITY;
