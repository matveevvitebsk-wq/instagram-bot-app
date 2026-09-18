ALTER TABLE public.ig_accounts
    ADD COLUMN IF NOT EXISTS graph_id VARCHAR(255);

COMMENT ON COLUMN public.ig_accounts.graph_id IS
    'Instagram Graph /me id. Matches webhook recipient.id and the business sender.id.';

CREATE INDEX IF NOT EXISTS idx_ig_accounts_graph_id
    ON public.ig_accounts (graph_id);
