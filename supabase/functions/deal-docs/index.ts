// deal-docs: puts a deal's source documents (press releases, circulars, accounts, other) on the M&A DataBase website.
// Called by the PC uploader (sync_database_documents.py in the Claude docs folder) and by Claude, never by the website.
// Every call must carry the upload token in the x-docs-token header; only its SHA-256 is kept (app_secrets 'deal-docs').
//
//   GET  ?action=resolve&target=<name>&date=<YYYY-MM-DD>  -> which DataBase deal a deal folder belongs to
//   GET  ?action=list&deal=<deal number>                  -> documents already on the site for that deal
//   PUT  ?action=upload&deal=..&dir=..&name=..[&date=..]  -> body = the file; replaces a file of the same name
//   POST ?action=delete&deal=..&dir=..&name=..            -> removes one document
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BUCKET = "deal-files";
const MAX_BYTES = 50 * 1024 * 1024;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// deal-folder sub-folders -> the directories shown on the site (same four as the admin site's Documents tab)
const DIRS: Record<string, string> = {
  "press releases": "Press releases", "press_releases": "Press releases", "pressreleases": "Press releases", "press release": "Press releases",
  "circulars": "Circulars", "circular": "Circulars", "accounts": "Accounts", "other": "Other",
};
const SLUG: Record<string, string> = { "Press releases": "press-releases", "Circulars": "circulars", "Accounts": "accounts", "Other": "other" };
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function authorised(req: Request) {
  const t = req.headers.get("x-docs-token") || "";
  if (t.length < 24) return false;
  const { data } = await sb.from("app_secrets").select("secret_sha256").eq("name", "deal-docs").maybeSingle();
  const want = data?.secret_sha256 as string | undefined;
  if (!want) return false;
  const got = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.min(got.length, want.length); i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

// ------------------------------------------------------------------ matching a deal folder to a deal
const LEGAL = new Set(["PLC", "LTD", "LIMITED", "INC", "INCORPORATED", "LLC", "LLP", "LP", "NV", "BV", "SA", "SAS", "SE", "AG", "AB", "ASA",
  "AS", "OYJ", "OY", "SPA", "SRL", "GMBH", "KGAA", "CORP", "CORPORATION", "CO", "COMPANY", "HOLDING", "HOLDINGS", "GROUP", "FZ", "FZE",
  "FZCO", "PTY", "BHD", "KK", "LTDA", "THE"]);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/&/g, " AND ")
  .replace(/[.'’]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
const core = (s: string) => norm(s).split(" ").filter((w) => w && !LEGAL.has(w)).join(" ");
const days = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

async function resolve(target: string, date: string | null) {
  if (!target.trim()) return json({ ok: false, error: "target is required" }, 400);
  // reported deals with a deal number; a two-year window keeps the list short (folders are for recent deals)
  const since = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await sb.from("deals")
    .select("deal_number,target,bidder,date_announced,admin_state,export_path,created_at")
    .eq("coverage_status", "reported").not("deal_number", "is", null)
    .or(`date_announced.gte.${since},date_announced.is.null`).order("date_announced", { ascending: false }).limit(1000);
  if (error) return json({ ok: false, error: error.message }, 500);
  const n = norm(target), c = core(target);
  const scored = (data || []).map((d) => {
    const dn = norm(d.target || ""), dc = core(d.target || "");
    const s = dn === n ? 3 : dc && dc === c ? 2 : (dc.startsWith(c + " ") || c.startsWith(dc + " ")) && Math.min(dc.length, c.length) >= 5 ? 1 : 0;
    return { ...d, score: s, near: date && d.date_announced ? days(date, d.date_announced) <= 7 : null };
  }).filter((d) => d.score > 0);
  // a matching announcement date beats the name score; then the closest name match
  const pool = date && scored.some((d) => d.near) ? scored.filter((d) => d.near) : scored;
  const best = pool.length ? Math.max(...pool.map((d) => d.score)) : 0;
  const top = pool.filter((d) => d.score === best);
  const out = top.map((d) => ({ deal_number: d.deal_number, target: d.target, bidder: d.bidder, date_announced: d.date_announced,
    on_site: d.admin_state === "LIVE" && !!d.export_path }));
  // the same deal can have several rows (e.g. a DRAFT and the LIVE copy); one deal number is a match
  const numbers = [...new Set(out.map((d) => d.deal_number))];
  if (numbers.length === 1) {
    const live = out.find((d) => d.on_site) || out[0];
    return json({ ok: true, match: live });
  }
  return json({ ok: true, match: null, candidates: out.slice(0, 20) });
}

// ------------------------------------------------------------------ documents
const safeName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\-. ()&,+'!@=;$]/g, "_").replace(/\s+/g, " ").trim();
function docDate(name: string, given: string | null) {
  if (given && /^\d{4}-\d{2}-\d{2}$/.test(given)) return given;
  const m = /(?:^|[^\d])(\d{2})-(\d{2})-(\d{2})(?!\d)/.exec(name);
  if (!m) return null;
  const iso = `20${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso + "T00:00:00Z");
  return !isNaN(+d) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
async function dealExists(deal: string) {
  const { data } = await sb.from("deals").select("id").eq("deal_number", deal).eq("coverage_status", "reported").limit(1);
  return !!(data && data.length);
}
function target(u: URL) {
  const deal = (u.searchParams.get("deal") || "").trim();
  const dir = DIRS[(u.searchParams.get("dir") || "").trim().toLowerCase()];
  const name = (u.searchParams.get("name") || "").trim().replace(/^.*[\\/]/, "");
  return { deal, dir, name };
}

async function upload(req: Request, u: URL) {
  const { deal, dir, name } = target(u);
  if (!/^\d{7}$/.test(deal)) return json({ ok: false, error: "deal must be a 7-digit deal number" }, 400);
  if (!dir) return json({ ok: false, error: "dir must be Press releases, Circulars, Accounts or Other" }, 400);
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (!name || !MIME[ext]) return json({ ok: false, error: "file type not allowed: " + name }, 400);
  if (!(await dealExists(deal))) return json({ ok: false, error: "no reported deal " + deal }, 404);
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BYTES) return json({ ok: false, error: "file is over 50MB" }, 413);
  const body = new Uint8Array(await req.arrayBuffer());
  if (!body.length) return json({ ok: false, error: "empty file" }, 400);
  if (body.length > MAX_BYTES) return json({ ok: false, error: "file is over 50MB" }, 413);
  const path = `docs/${deal}/${SLUG[dir]}/${safeName(name)}`;
  const up = await sb.storage.from(BUCKET).upload(path, body, { contentType: MIME[ext], upsert: true });
  if (up.error) return json({ ok: false, error: "storage: " + up.error.message }, 500);
  const row = { deal_number: deal, directory: dir, file_name: name, path, size_bytes: body.length, mime_type: MIME[ext],
    doc_date: docDate(name, u.searchParams.get("date")), source: (u.searchParams.get("source") || "pc-uploader").slice(0, 40),
    uploaded_at: new Date().toISOString() };
  const { error } = await sb.from("deal_documents").upsert(row, { onConflict: "deal_number,directory,file_name" });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, deal, dir, name, path, size: body.length, doc_date: row.doc_date });
}

async function list(u: URL) {
  const deal = (u.searchParams.get("deal") || "").trim();
  const { data, error } = await sb.from("deal_documents").select("directory,file_name,size_bytes,doc_date,uploaded_at,path").eq("deal_number", deal)
    .order("directory").order("file_name");
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, deal, documents: data });
}

async function remove(u: URL) {
  const { deal, dir, name } = target(u);
  const { data } = await sb.from("deal_documents").select("id,path").eq("deal_number", deal).eq("directory", dir || "").eq("file_name", name).maybeSingle();
  if (!data) return json({ ok: false, error: "no such document" }, 404);
  await sb.storage.from(BUCKET).remove([data.path]);
  await sb.from("deal_documents").delete().eq("id", data.id);
  return json({ ok: true, removed: data.path });
}

Deno.serve(async (req) => {
  if (!(await authorised(req))) return json({ ok: false, error: "not authorised" }, 401);
  const u = new URL(req.url);
  const action = u.searchParams.get("action") || "";
  try {
    if (action === "resolve") return await resolve(u.searchParams.get("target") || "", u.searchParams.get("date"));
    if (action === "list") return await list(u);
    if (action === "upload" && (req.method === "PUT" || req.method === "POST")) return await upload(req, u);
    if (action === "delete" && req.method === "POST") return await remove(u);
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
