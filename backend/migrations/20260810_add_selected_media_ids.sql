alter table public.automation_tasks
    add column if not exists selected_media_ids jsonb not null default '[]'::jsonb;

comment on column public.automation_tasks.selected_media_ids is
    'Instagram media IDs selected for optional/selected auto-reply scope.';
