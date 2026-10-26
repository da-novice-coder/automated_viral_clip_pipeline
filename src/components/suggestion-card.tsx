import { useState } from "react";
import { Check, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { enqueueRender } from "@/lib/render-queue";
import { fmtTime, friendlyError } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ScoreBadge, StatusChip } from "@/components/app-ui";
import { cn } from "@/lib/utils";

export type SuggestionRow = {
  id: string;
  title: string;
  start_s: number;
  end_s: number;
  score: number | null;
  reason: string | null;
  source: string;
  status: string;
  error: string | null;
};

const CHIP_LABEL: Record<string, string> = {
  suggested: "Suggested",
  approved: "Rendering",
  queued: "Rendering",
  rendering: "Rendering",
  rendered: "Rendered",
  failed: "Failed",
  rejected: "Rejected",
};

const inFlight = ["approved", "queued", "rendering"];

export function SuggestionCard({ candidate: c, captionsOn }: { candidate: SuggestionRow; captionsOn: boolean }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetCaptions, setSheetCaptions] = useState(true);

  async function setStatus(status: "approved" | "rejected") {
    const { error } = await supabase.from("clip_candidates").update({ status }).eq("id", c.id);
    if (error) toast.error(friendlyError(error.message));
    return !error;
  }

  async function approve() {
    if (await setStatus("approved")) {
      enqueueRender([c.id], { captions: captionsOn });
      toast.success("Queued for rendering");
    }
  }

  async function reject() {
    if (await setStatus("rejected")) toast.success("Suggestion rejected");
  }

  const rendering = inFlight.includes(c.status);

  return (
    <article key={c.id} className={cn("rounded-2xl border bg-card p-4", c.status === "rejected" && "opacity-50")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{c.title}</p>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {fmtTime(c.start_s)} – {fmtTime(c.end_s)} · {Math.round(c.end_s - c.start_s)}s · {c.source === "ai" ? "AI" : "Manual"}
          </p>
        </div>
        {c.source === "ai" && <ScoreBadge score={c.score} />}
      </div>
      {c.reason && <p className="mt-2 text-sm text-muted-foreground">{c.reason}</p>}
      <div className="mt-3 flex items-center gap-2">
        <StatusChip status={c.status} label={CHIP_LABEL[c.status] ?? c.status} />
        <div className="ml-auto flex gap-2">
          {c.status === "suggested" && (
            <>
              <Button size="sm" variant="soft" onClick={() => void reject()}>
                <X /> Reject
              </Button>
              <Button size="sm" variant="hero" onClick={() => void approve()}>
                <Check /> Approve &amp; render
              </Button>
            </>
          )}
          {!rendering && c.status === "rendered" && (
            <Button size="sm" variant="soft" onClick={() => setSheetOpen(true)}>
              <RotateCw /> Re-render
            </Button>
          )}
          {!rendering && c.status === "failed" && (
            <Button
              size="sm"
              variant="soft"
              onClick={() => {
                enqueueRender([c.id], { captions: captionsOn });
                toast.success("Retrying render");
              }}
            >
              <RotateCw /> Retry render
            </Button>
          )}
        </div>
      </div>
      {c.status === "failed" && c.error && <p className="mt-2 text-xs text-destructive">{friendlyError(c.error)}</p>}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Re-render clip</SheetTitle>
            <SheetDescription>Render this clip again with the options below.</SheetDescription>
          </SheetHeader>
          <div className="flex items-center justify-between py-4">
            <Label htmlFor={`captions-${c.id}`} className="font-semibold">
              Captions
            </Label>
            <Switch id={`captions-${c.id}`} checked={sheetCaptions} onCheckedChange={setSheetCaptions} />
          </div>
          <SheetFooter>
            <Button
              variant="hero"
              className="h-11 w-full"
              onClick={() => {
                setSheetOpen(false);
                enqueueRender([c.id], { captions: sheetCaptions });
                toast.success("Queued for rendering");
              }}
            >
              Re-render
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </article>
  );
}
