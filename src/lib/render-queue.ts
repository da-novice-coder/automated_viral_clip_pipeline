import { toast } from "sonner";
import { friendlyError } from "./types";

type Runner = (candidateId: string, opts: { captions: boolean }) => Promise<{ ok: boolean; error?: string }>;

// Browser-side queue: renders strictly one clip at a time.
const pending: { id: string; captions: boolean }[] = [];
let running = false;
let runner: Runner | null = null;

export function setRenderRunner(fn: Runner) {
  runner = fn;
}

export function enqueueRender(ids: string[], opts: { captions?: boolean } = {}) {
  const captions = opts.captions === true;
  for (const id of ids) if (!pending.some((p) => p.id === id)) pending.push({ id, captions });
  void drain();
}

async function drain() {
  if (running || !runner) return;
  running = true;
  try {
    while (pending.length) {
      const job = pending[0]!;
      try {
        const r = await runner(job.id, { captions: job.captions });
        if (!r.ok) toast.error(friendlyError(r.error));
        else toast.success("Clip rendered");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "busy") {
          await new Promise((res) => setTimeout(res, 8000));
          continue;
        }
        toast.error(friendlyError(msg));
      }
      pending.shift();
    }
  } finally {
    running = false;
  }
}
