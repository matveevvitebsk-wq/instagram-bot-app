alter table public.automation_tasks
    add column if not exists exact_match boolean not null default true,
    add column if not exists all_content_types boolean not null default true;

comment on column public.automation_tasks.exact_match is
    'When true, comment keyword matching requires an exact match.';

comment on column public.automation_tasks.all_content_types is
    'When true, rule applies to all content types; when false, optional/selected responses.';
