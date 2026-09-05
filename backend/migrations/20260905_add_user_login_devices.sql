-- 2026-09-05 cursor store device and OS types on each user login

create table if not exists public.user_login_devices (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.customer_profiles(id) on delete cascade,
    telegram_id varchar(100) not null,
    device_kind varchar(20) not null,
    os_type varchar(20) not null,
    telegram_platform varchar(40) not null default 'unknown',
    login_count integer not null default 1,
    first_login_at timestamptz not null default now(),
    last_login_at timestamptz not null default now(),
    constraint user_login_devices_device_kind_check
        check (device_kind in ('phone', 'tablet', 'computer')),
    constraint user_login_devices_os_type_check
        check (os_type in ('ios', 'android', 'windows', 'macos', 'linux', 'unknown')),
    constraint user_login_devices_owner_device_os_key
        unique (owner_id, device_kind, os_type)
);

comment on table public.user_login_devices is
    'Счётчик входов пользователя по типу оборудования и операционной системы.';
comment on column public.user_login_devices.device_kind is
    'Тип оборудования: phone, tablet или computer.';
comment on column public.user_login_devices.os_type is
    'Тип системы: ios, android, windows, macos, linux или unknown.';
comment on column public.user_login_devices.login_count is
    'Сколько раз пользователь входил с этой пары устройство + система.';

create index if not exists idx_user_login_devices_owner
    on public.user_login_devices (owner_id, last_login_at desc);

create index if not exists idx_user_login_devices_telegram
    on public.user_login_devices (telegram_id);

alter table public.user_login_devices enable row level security;

revoke all on table public.user_login_devices from anon, authenticated;

create or replace function public.record_user_login_device(
    p_owner_id uuid,
    p_telegram_id text,
    p_device_kind text,
    p_os_type text,
    p_telegram_platform text default 'unknown'
)
returns public.user_login_devices
language plpgsql
security invoker
set search_path = public
as $$
declare
    rec public.user_login_devices;
begin
    insert into public.user_login_devices (
        owner_id,
        telegram_id,
        device_kind,
        os_type,
        telegram_platform
    )
    values (
        p_owner_id,
        p_telegram_id,
        p_device_kind,
        p_os_type,
        coalesce(nullif(p_telegram_platform, ''), 'unknown')
    )
    on conflict (owner_id, device_kind, os_type)
    do update set
        login_count = public.user_login_devices.login_count + 1,
        last_login_at = now(),
        telegram_id = excluded.telegram_id,
        telegram_platform = excluded.telegram_platform
    returning * into rec;

    return rec;
end;
$$;

revoke all on function public.record_user_login_device(uuid, text, text, text, text)
    from public, anon, authenticated;
grant execute on function public.record_user_login_device(uuid, text, text, text, text)
    to service_role;
