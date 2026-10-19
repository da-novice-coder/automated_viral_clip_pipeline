import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { addVideo, processVideo, scoreClips } from "@/lib/clips.functions";
import { friendlyError } from "@/lib/types";

export function usePipeline() {
  const add = useServerFn(addVideo);
  const process = useServerFn(processVideo);
  const score = useServerFn(scoreClips);
  async function run(videoId: string) {
    const r = await process({ data: { videoId } });
    if (!r.ok) {
      toast.error(friendlyError(r.error));
      return;
    }
    toast.success("Transcript ready — finding the best moments…");
    try {
      const s = await score({ data: { videoId } });
      toast.success(`${s.count} clip suggestions ready`);
    } catch (e) {
      toast.error(friendlyError(e instanceof Error ? e.message : String(e)));
    }
  }
  return { add, run };
}

