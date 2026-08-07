alter table public.automation_tasks
    add column if not exists comment_on_post boolean not null default false;

comment on column public.automation_tasks.comment_on_post is
    'When true, automation triggers on comments under the author posts (feed, Reels, or saved live).';
