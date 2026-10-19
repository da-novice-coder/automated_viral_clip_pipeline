CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  source_url text NOT NULL,
  youtube_id text,
  title text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','transcribing','ready','failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.transcripts (
  video_id uuid PRIMARY KEY REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  language text,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.clip_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  start_s double precision NOT NULL,
  end_s double precision NOT NULL,
  title text NOT NULL DEFAULT 'Untitled clip',
  score integer,
  reason text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('ai','manual')),
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','approved','rejected','rendering','rendered','failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.clip_candidates(id) ON DELETE SET NULL,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text,
  clip_url text NOT NULL,
  r2_key text,
  bytes bigint,
  duration_s double precision,
  format text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos, public.transcripts, public.clip_candidates, public.clips TO authenticated;
GRANT ALL ON public.videos, public.transcripts, public.clip_candidates, public.clips TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own videos" ON public.videos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own transcripts" ON public.transcripts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own candidates" ON public.clip_candidates FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own clips" ON public.clips FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER cc_touch BEFORE UPDATE ON public.clip_candidates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.videos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clip_candidates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clips;