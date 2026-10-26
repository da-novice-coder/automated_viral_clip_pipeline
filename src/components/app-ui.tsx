import { AlertTriangle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { friendlyError, langLabel } from "@/lib/types";

const chip: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  transcribing: "bg-info/15 text-info",
  ready: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
  suggested: "bg-muted text-muted-foreground",
  approved: "bg-info/15 text-info",
  rejected: "bg-muted text-muted-foreground line-through",
  rendering: "bg-warning/15 text-warning",
  rendered: "bg-success/15 text-success",
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const live = status === "transcribing" || status === "rendering" || status === "queued";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize", chip[status] ?? chip["queued"])}>
      {live && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {label ?? status}
    </span>
  );
}

/** Small language pill shown next to a video's status chip, e.g. "EN". */
export function LanguageChip({ language }: { language: string | null | undefined }) {
  const label = langLabel(language);
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
      {label}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number | null }) {
  const s = score ?? 0;
  const tone = s >= 75 ? "bg-gradient-primary text-primary-foreground" : s >= 50 ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground";
  return <span className={cn("rounded-lg px-2 py-1 font-display text-sm font-bold tabular-nums", tone)}>{s}</span>;
}

export function ErrorState({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex-1">
        <p>{friendlyError(message)}</p>
        {onRetry && (
          <Button size="sm" variant="soft" className="mt-3" onClick={onRetry}>
            <RotateCw /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <p className="font-display font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string | undefined; right?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </header>
  );
}
