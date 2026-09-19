-- ---------------------------------------------------------
-- ARCHIE PWA client-side persistence fix (2026-09-14)
-- ---------------------------------------------------------
-- Context: the PWA client (src/lib/archie/chat-client.ts) inserts
-- conversations and messages WITHOUT an explicit owner_id:
--   createConversation  -> .insert({ title })
--   insertMessage       -> .insert({ conversation_id, role, content, ... })
-- Both owner_id columns are NOT NULL with NO default, so every
-- client insert failed with:
--   "new row violates row-level security policy for table
--    frelux_archie_conversations"
-- (a NULL owner_id cannot satisfy the owner-only RLS policies
-- `owner_id = auth.uid()`; the WITH CHECK fails before the NOT NULL
-- constraint is reported). The stale edge functions papered over this
-- by persisting messages server-side with the service role; the
-- current archie-chat persists client-side, so the columns must
-- default to the authenticated caller.
--
-- Security impact: none. RLS semantics are unchanged - an
-- authenticated user still only passes WITH CHECK when the stamped
-- owner_id equals their own auth.uid(); service-role writes bypass
-- RLS as before. This only removes the impossible NULL case.

ALTER TABLE public.frelux_archie_conversations
  ALTER COLUMN owner_id SET DEFAULT auth.uid();

ALTER TABLE public.frelux_archie_messages
  ALTER COLUMN owner_id SET DEFAULT auth.uid();
