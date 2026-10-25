CREATE OR REPLACE FUNCTION public.restore_candidate_after_clip_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.candidate_id IS NOT NULL THEN
    UPDATE public.clip_candidates AS candidate
    SET status = 'suggested', error = NULL
    WHERE candidate.id = OLD.candidate_id
      AND candidate.user_id = OLD.user_id
      AND candidate.status IN ('rendered', 'failed')
      AND NOT EXISTS (
        SELECT 1 FROM public.clips AS remaining
        WHERE remaining.candidate_id = OLD.candidate_id
      );
  END IF;
  RETURN OLD;
END;
$$;