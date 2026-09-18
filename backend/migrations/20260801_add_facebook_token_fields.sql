alter table public.ig_accounts
    add column if not exists facebook_access_token text,
    add column if not exists facebook_user_id text,
    add column if not exists facebook_token_expires_at timestamptz,
    add column if not exists facebook_data_access_expires_at timestamptz,
    add column if not exists facebook_token_scopes jsonb not null default '[]'::jsonb,
    add column if not exists facebook_token_is_valid boolean not null default false,
    add column if not exists facebook_token_refresh_required boolean not null default false,
    add column if not exists facebook_token_last_checked_at timestamptz,
    add column if not exists facebook_token_error text;

comment on column public.ig_accounts.facebook_access_token is
    'Facebook Login user access token (EAAV), separate from the Instagram Login token in access_token.';
