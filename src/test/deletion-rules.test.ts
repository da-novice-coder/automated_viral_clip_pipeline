// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const video = "00000000-0000-4000-8000-000000000001";
const candidate = "00000000-0000-4000-8000-000000000002";
const clip = "00000000-0000-4000-8000-000000000003";
const owner = "00000000-0000-4000-8000-000000000004";

beforeAll(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${owner}'::uuid $$;`);
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8").replace(/^ALTER PUBLICATION.*;$/gm, "");
    await db.exec(sql);
  }
}, 30_000);
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec("DELETE FROM public.videos;");
  await db.exec(`INSERT INTO videos (id,source_url) VALUES ('${video}', 'https://example.com/video.mp4');
    INSERT INTO transcripts (video_id,segments) VALUES ('${video}', '[{"start":0,"end":30,"text":"Test"}]');
    INSERT INTO clip_candidates (id,video_id,start_s,end_s,status) VALUES ('${candidate}','${video}',0,30,'rendered');
    INSERT INTO clips (id,candidate_id,video_id,clip_url) VALUES ('${clip}','${candidate}','${video}','https://example.com/clip.mp4');`);
});

describe("Deletion rules against the actual migrations", () => {
  it("deleting a video removes its transcript, every suggestion, and associated clips", async () => {
    await db.exec(`DELETE FROM videos WHERE id = '${video}';`);
    const result = await db.query<{ videos: number; transcripts: number; candidates: number; clips: number }>(
      "SELECT (SELECT count(*)::int FROM videos) AS videos, (SELECT count(*)::int FROM transcripts) AS transcripts, (SELECT count(*)::int FROM clip_candidates) AS candidates, (SELECT count(*)::int FROM clips) AS clips",
    );
    expect(result.rows[0]).toEqual({ videos: 0, transcripts: 0, candidates: 0, clips: 0 });
  });
  it("deleting a clip restores its original suggestion to Approved with the same render range", async () => {
    await db.exec(`UPDATE clip_candidates SET error = 'old error' WHERE id = '${candidate}'; DELETE FROM clips WHERE id = '${clip}';`);
    const result = await db.query("SELECT status,error,start_s,end_s,video_id FROM clip_candidates");
    expect(result.rows[0]).toEqual({ status: "approved", error: null, start_s: 0, end_s: 30, video_id: video });
  });
  it("retains Rendered while another copy remains", async () => {
    await db.exec(`INSERT INTO clips (candidate_id,video_id,clip_url) VALUES ('${candidate}','${video}','https://example.com/other.mp4'); DELETE FROM clips WHERE id = '${clip}';`);
    expect((await db.query("SELECT status FROM clip_candidates")).rows[0]).toEqual({ status: "rendered" });
  });
  it("does not expose another user's clip to deletion", async () => {
    await db.exec(`UPDATE clips SET user_id = '00000000-0000-4000-8000-000000000099' WHERE id = '${clip}'; SET ROLE authenticated; DELETE FROM clips WHERE id = '${clip}'; RESET ROLE;`);
    expect((await db.query("SELECT count(*)::int AS count FROM clips")).rows[0]).toEqual({ count: 1 });
  });
});