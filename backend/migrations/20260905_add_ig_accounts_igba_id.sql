ALTER TABLE public.ig_accounts
    ADD COLUMN IF NOT EXISTS igba_id VARCHAR(255);

COMMENT ON COLUMN public.ig_accounts.igba_id IS
    'Messaging IGSID from webhook sender.id / conversation participants. Not page_id or graph_id.';

CREATE INDEX IF NOT EXISTS idx_ig_accounts_igba_id
    ON public.ig_accounts (igba_id);
