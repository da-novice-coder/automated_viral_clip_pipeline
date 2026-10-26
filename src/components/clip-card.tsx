import { Copy, Download, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtTime } from "@/lib/types";

export type ClipRow = {
  id: string;
  title: string | null;
  clip_url: string;
  duration_s: number | null;
  created_at: string;
  captions_burned?: boolean | null;
};

export function ClipCard({ clip, onDelete }: { clip: ClipRow; onDelete?: (id: string) => void }) {
  return (
    <article className="overflow-hidden rounded-2xl border bg-card">
      <div className="aspect-[9/16] bg-muted">
        <video src={clip.clip_url} controls playsInline preload="metadata" className="size-full object-cover" />
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="line-clamp-2 text-sm font-semibold">{clip.title ?? "Clip"}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {fmtTime(clip.duration_s ?? 0)}
            {clip.captions_burned && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">CC</span>
            )}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Button
            size="icon"
            variant="soft"
            aria-label="Copy link"
            onClick={() => {
              void navigator.clipboard.writeText(clip.clip_url).then(() => toast.success("Link copied"));
            }}
          >
            <Copy />
          </Button>
          <Button size="icon" variant="soft" aria-label="Download" asChild>
            <a href={clip.clip_url} download target="_blank" rel="noreferrer">
              <Download />
            </a>
          </Button>
          {onDelete && (
            <Button size="icon" variant="soft" aria-label="Delete" onClick={() => onDelete(clip.id)}>
              <Trash2 />
            </Button>
          )}
        </div>
        <Button size="sm" variant="outline" disabled className="w-full rounded-xl">
          <Send /> Publish · Coming soon
        </Button>
      </div>
    </article>
  );
}
