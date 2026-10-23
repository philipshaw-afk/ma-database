// doc-text: reads the text out of the deal documents (PDFs page by page, Word and PowerPoint files) into
// deal_document_pages, which the DataBase word search uses (db_doc_search / db_doc_snippets).
//
// Nothing has to call this by hand. The database kicks it (doc_text_kick(), through pg_net) whenever a document is
// added or replaced on deal_documents, and pg_cron kicks it every 2 minutes while documents are still waiting.
// Each call reads one chunk of one document (as many pages as fit in about a second, so a 400-page annual report
// takes several calls and the 2s CPU limit is never reached), saves it with doc_text_save() and kicks the next call.
// Up to 3 documents are read at once.
//
// Every call must carry the x-docs-token header: the doc-text token the database keeps in Vault, or the deal-docs
// upload token (checked by doc_text_token_ok(); only SHA-256s are kept in app_secrets).
//   POST ?action=run                         -> read the next chunk of the next waiting document
//   GET  ?action=status                      -> documents by status, and any that could not be read
//   POST ?action=redo&deal=<deal number>     -> read a deal's documents again   (or &id=<document id>)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { docxParts, pdfChunk, pptxSlides } from "./extract.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BUCKET = "deal-files";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function authorised(req: Request) {
  const t = req.headers.get("x-docs-token") || "";
  if (t.length < 24) return false;
  const { data, error } = await sb.rpc("doc_text_token_ok", { p_token: t });
  return !error && data === true;
}

// ------------------------------------------------------------------ one chunk of one document
type Claim = { id: string; path: string; mime_type: string | null; file_name: string; text_next: number; text_attempts: number; text_gen: number; text_chars: number };
const save = (d: Claim, pages: { p: number; t: string }[], next: number | null, total: number | null, chars: number, status: string, err: string | null) =>
  sb.rpc("doc_text_save", { p_id: d.id, p_gen: d.text_gen, p_pages: pages.filter((x) => x.t), p_next: next, p_total: total, p_chars: chars,
    p_status: status, p_error: err });

async function run() {
  const { data: rows, error } = await sb.rpc("doc_text_claim");
  if (error) return json({ ok: false, error: "claim: " + error.message }, 500);
  const d = (rows as Claim[] | null)?.[0];
  if (!d) return json({ ok: true, idle: true });
  const ext = (d.file_name.split(".").pop() || "").toLowerCase();
  const t0 = performance.now();
  let out: Record<string, unknown> = { id: d.id, file: d.file_name };
  try {
    if (!["pdf", "docx", "pptx"].includes(ext)) {
      await save(d, [], null, null, 0, "skipped", "." + ext + " files are not read");
      out = { ...out, status: "skipped" };
    } else {
    const dl = await sb.storage.from(BUCKET).download(d.path);
    if (dl.error || !dl.data) throw new Error("storage: " + (dl.error ? dl.error.message : "no file"));
    const buf = new Uint8Array(await dl.data.arrayBuffer());
    if (ext === "pdf") {
      if (d.text_attempts >= 6) {
        // the call keeps being stopped on this page: leave it out and carry on with the next one
        const r = await save(d, [], d.text_next + 1, null, d.text_chars, "pending", "page " + d.text_next + " could not be read");
        if (r.error) throw new Error("save: " + r.error.message);
        out = { ...out, skipped_page: d.text_next };
      } else {
        const c = await pdfChunk(buf, d.text_next, d.text_attempts >= 3);
        const chars = d.text_chars + c.pages.reduce((a, x) => a + x.t.length, 0);
        const done = c.next > c.total;
        // a finished PDF with almost no text is a scan (pictures of pages); what little text it has is still kept
        const status = !done ? "pending" : chars < Math.max(200, 20 * c.total) ? "no_text" : "done";
        const r = await save(d, c.pages, c.next, c.total, chars, status, status === "no_text" ? "no text layer (scanned?)" : null);
        if (r.error) throw new Error("save: " + r.error.message);
        out = { ...out, pages: c.pages.length ? c.pages[0].p + "-" + c.pages[c.pages.length - 1].p : "", of: c.total, status };
      }
    } else {
      const parts = ext === "docx" ? docxParts(buf) : pptxSlides(buf);
      const chars = parts.reduce((a, x) => a + x.t.length, 0);
      const status = chars < 20 ? "no_text" : "done";
      const r = await save(d, parts, parts.length + 1, parts.length, chars, status, null);
      if (r.error) throw new Error("save: " + r.error.message);
      out = { ...out, parts: parts.length, status };
    }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // a file that cannot be opened at all is marked failed (try again with action=redo); a storage or save
    // problem is left waiting, to be tried again on a later call
    const fatal = !/^(storage|save):/.test(msg);
    if (fatal) await save(d, [], null, null, d.text_chars, "failed", msg.slice(0, 500));
    else await sb.rpc("doc_text_unlock", { p_id: d.id });
    out = { ...out, error: msg, status: fatal ? "failed" : "pending" };
  }
  out.ms = Math.round(performance.now() - t0);
  // next chunk (of this or the next waiting document)
  await sb.rpc("doc_text_kick");
  return json({ ok: true, ...out });
}

async function status() {
  const { data, error } = await sb.from("deal_documents").select("deal_number,file_name,text_status,text_pages,text_next,text_error");
  if (error) return json({ ok: false, error: error.message }, 500);
  const counts: Record<string, number> = {};
  (data || []).forEach((x) => { counts[x.text_status] = (counts[x.text_status] || 0) + 1; });
  const issues = (data || []).filter((x) => x.text_status !== "done" || x.text_error);
  return json({ ok: true, counts, issues });
}

async function redo(u: URL) {
  const deal = (u.searchParams.get("deal") || "").trim() || null, id = (u.searchParams.get("id") || "").trim() || null;
  if (!deal && !id) return json({ ok: false, error: "give deal=<deal number> or id=<document id>" }, 400);
  const { data, error } = await sb.rpc("doc_text_redo", { p_deal: deal, p_id: id });
  if (error) return json({ ok: false, error: error.message }, 500);
  await sb.rpc("doc_text_kick");
  return json({ ok: true, reset: data });
}

Deno.serve(async (req) => {
  if (!(await authorised(req))) return json({ ok: false, error: "not authorised" }, 401);
  const u = new URL(req.url);
  const action = u.searchParams.get("action") || "";
  try {
    if (action === "run") return await run();
    if (action === "status") return await status();
    if (action === "redo" && req.method === "POST") return await redo(u);
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
