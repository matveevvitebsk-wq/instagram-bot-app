-- 2026-08-31 cursor add public storage for automation DM attachments
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'automation-attachments',
    'automation-attachments',
    true,
    10485760,
    array[
        'application/msword',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/gif',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain'
    ]
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
