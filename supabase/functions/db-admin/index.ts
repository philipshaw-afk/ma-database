// db-admin: user management for the M&A DataBase website.
// Callers must be signed in as a DataBase admin (DIANA lead/deputy, or a db_members row with role 'admin').
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED = ["https://database.ma-dealboard.co.uk", "https://philipshaw-afk.github.io", "http://localhost:8080", "null"];

function cors(origin: string | null) {
  const o = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });

function tempPassword() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(14));
  const s = [...r].map((x) => a[x % a.length]).join("");
  return s.slice(0, 4) + "-" + s.slice(4, 9) + "-" + s.slice(9);
}
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

Deno.serve(async (req) => {
  const h = cors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, h);

  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400, h); }

  // who is asking?
  let actor = "";
  const boot = typeof body.bootstrap_token === "string" ? body.bootstrap_token : "";
  if (boot) {
    const { data: ok } = await admin.rpc("db_check_bootstrap", { p_token: boot });
    if (ok !== true) return json({ error: "Not allowed" }, 403, h);
    actor = "setup";
  } else {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: isAdmin, error } = await userClient.rpc("db_is_admin");
    if (error || isAdmin !== true) return json({ error: "Only DataBase admins can manage users" }, 403, h);
    const { data: u } = await userClient.auth.getUser();
    actor = u?.user?.email || "admin";
  }

  const action = String(body.action || "");
  const email = String(body.email || "").trim().toLowerCase();

  async function findUser(e: string) {
    for (let page = 1; page < 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const hit = data.users.find((u) => (u.email || "").toLowerCase() === e);
      if (hit) return hit;
      if (data.users.length < 200) return null;
    }
    return null;
  }

  try {
    if (action === "add") {
      if (!emailOk(email)) return json({ error: "Please enter a valid email address" }, 400, h);
      const role = body.role === "admin" ? "admin" : "client";
      let password = typeof body.password === "string" && body.password.length >= 10 ? body.password : "";
      let user = await findUser(email);
      let created = false;
      if (!user) {
        if (!password) password = tempPassword();
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) throw error;
        user = data.user; created = true;
      } else if (password) {
        const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
        if (error) throw error;
      }
      const { error: e2 } = await admin.from("db_members").upsert({
        email, name: body.name || null, organisation: body.organisation || null, role, active: true, added_by: actor,
      }, { onConflict: "email" });
      if (e2) throw e2;
      return json({ ok: true, created, email, password: password || null }, 200, h);
    }

    if (action === "set_password") {
      if (!emailOk(email)) return json({ error: "Please enter a valid email address" }, 400, h);
      const { data: m } = await admin.from("db_members").select("email").eq("email", email).maybeSingle();
      if (!m) return json({ error: "Passwords can only be set here for website members (team logins use DIANA)" }, 400, h);
      const user = await findUser(email);
      const password = typeof body.password === "string" && body.password.length >= 10 ? body.password : tempPassword();
      if (!user) {
        const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) throw error;
      } else {
        const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
        if (error) throw error;
      }
      return json({ ok: true, email, password }, 200, h);
    }

    if (action === "update") {
      if (!emailOk(email)) return json({ error: "Please enter a valid email address" }, 400, h);
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "organisation"]) if (k in body) patch[k] = body[k] || null;
      if ("role" in body) patch.role = body.role === "admin" ? "admin" : "client";
      if ("active" in body) patch.active = !!body.active;
      const { error } = await admin.from("db_members").update(patch).eq("email", email);
      if (error) throw error;
      return json({ ok: true }, 200, h);
    }

    return json({ error: "Unknown action" }, 400, h);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500, h);
  }
});
