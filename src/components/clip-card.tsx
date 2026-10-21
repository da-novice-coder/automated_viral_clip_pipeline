import { Copy, Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtTime, friendlyError } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { deleteOwnedRow } from "@/lib/deletion";
import { DeleteConfirmation } from "@/components/delete-confirmation";

export type ClipRow = {
  id: string;
  title: string | null;
  clip_url: string;
  duration_s: number | null;
  created_at: string;
};

export function ClipCard({ clip }: { clip: ClipRow }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const qc = useQueryClient();
  async function remove() {
    setDeleting(true);
    try {
      await deleteOwnedRow(supabase, "clips", clip.id);
      setConfirming(false);
      await qc.invalidateQueries({ predicate: ({ queryKey }) => ["clips", "vclips", "candidates"].includes(String(queryKey[0])) });
      toast.success("Clip deleted — its suggestion can be rendered again");
    } catch (error) {
      toast.error(friendlyError(error instanceof Error ? error.message : String(error)));
    } finally {
      setDeleting(false);
    }
  }
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="aspect-[9/16] bg-muted">
        <video src={clip.clip_url} controls playsInline preload="metadata" className="size-full object-cover" />
      </div>
      <div className="flex-1 space-y-3 p-3">
        <div>
          <p className="line-clamp-2 min-h-10 break-words text-sm font-semibold [overflow-wrap:anywhere]">{clip.title ?? "Clip"}</p>
          <p className="text-xs text-muted-foreground">{fmtTime(clip.duration_s ?? 0)}</p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Button
            size="icon"
            variant="soft"
            className="w-full min-w-0"
            aria-label="Copy link"
            title="Copy link"
            onClick={() => {
              void navigator.clipboard.writeText(clip.clip_url).then(() => toast.success("Link copied"));
            }}
          >
            <Copy />
          </Button>
           <Button size="icon" variant="soft" className="w-full min-w-0" aria-label="Download" title="Download" asChild>
            <a href={clip.clip_url} download target="_blank" rel="noreferrer">
              <Download />
            </a>
          </Button>
            <Button size="icon" variant="soft" className="w-full min-w-0" aria-label="Delete clip" title="Delete clip" onClick={() => setConfirming(true)}>
              <Trash2 />
            </Button>
        </div>
      </div>
      <footer className="flex h-14 shrink-0 items-center border-t px-3">
        <Button size="sm" variant="secondary" disabled className="h-8 w-full bg-muted text-muted-foreground shadow-none transition-none">Publish</Button>
      </footer>
      <DeleteConfirmation open={confirming} onOpenChange={setConfirming} title="Delete clip?" description="This removes the clip from your library. Its original suggestion will be available to render again when no other copies remain." busy={deleting} onConfirm={() => void remove()} />
    </article>
  );
}
