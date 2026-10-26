-- Transcript language metadata returned by POST {COMPUTE_BASE_URL}/transcript.
-- Already present in the hosted project; this keeps a fresh project in sync.
ALTER TABLE public.transcripts ADD COLUMN IF NOT EXISTS available_langs jsonb;
ALTER TABLE public.transcripts ADD COLUMN IF NOT EXISTS language_matches boolean;
