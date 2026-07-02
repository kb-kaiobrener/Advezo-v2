-- Grants explícitos para whatsapp_accounts.
-- RLS está ativa na tabela; estes grants permitem que o service_role e
-- authenticated executem as operações (RLS já restringe o escopo delas).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_accounts TO authenticated;
