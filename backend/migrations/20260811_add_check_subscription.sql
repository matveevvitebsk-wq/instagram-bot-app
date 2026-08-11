alter table public.automation_tasks
    add column if not exists check_subscription boolean not null default true;

comment on column public.automation_tasks.check_subscription is
    'When true, chatbot verifies the user follows the Instagram account before continuing.';
