ALTER TABLE public.transcripts
  ADD COLUMN available_langs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN language_matches boolean;