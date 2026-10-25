<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Rules
- Compute service calls go only through `src/lib/compute.server.ts` from server functions in `src/lib/clips.functions.ts` — keeps COMPUTE_* secrets off the browser.
- Renders run strictly one at a time via the browser queue in `src/lib/render-queue.ts`, plus a server-side "busy" guard — the render service handles a single job.
- Server functions use `requireSupabaseAuth` (RLS as the user), never the admin client — all data is per-user.
- Bearer token is attached by the client function middleware in `src/start.ts` — needed for protected server functions.
- Video and clip deletions use browser Supabase RLS; database FK cascades and the clip-delete trigger keep related data changes atomic.
- ClipCard owns confirmed deletion and invalidates clip/candidate queries so both clip surfaces share the same behavior.
- Cancel waiting browser render jobs after video deletion; active jobs cannot be cancelled by the current compute contract.
- Suggestion action eligibility lives in `src/lib/suggestion-state.ts`; cards subscribe to the browser render queue so waiting jobs cannot display stale render actions.
