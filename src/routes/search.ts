import { Hono } from "hono";
import type { Env } from "../env";
import { getSupabase } from "../db/client";

const app = new Hono<{ Bindings: Env }>();

const SELECT = "id,country_id,parent_id,name,name_local,type,level,path";
const LIMIT = 20;

app.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  const countryId = c.req.query("country_id");
  if (!q || q.length < 2) {
    return c.json({ error: "Query 'q' required (min 2 chars)" }, 400);
  }

  const supabase = getSupabase(c.env);
  let query = supabase
    .from("admin_divisions")
    .select(SELECT)
    .eq("is_deleted", false)
    .or(`name.ilike.%${q}%,path.ilike.%${q}%`)
    .limit(LIMIT);

  if (countryId !== undefined) {
    const cid = Number(countryId);
    if (!Number.isNaN(cid)) query = query.eq("country_id", cid);
  }

  const { data, error } = await query.order("path");

  if (error) {
    return c.json({ error: error.message }, 500);
  }
  return c.json(data);
});

export default app;
