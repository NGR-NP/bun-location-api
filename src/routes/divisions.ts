import { Hono } from "hono";
import type { Env } from "../env";
import { getSupabase } from "../db/client";

const app = new Hono<{ Bindings: Env }>();

const SELECT_DIVISIONS =
  "id,country_id,parent_id,name,name_local,code,type,level,path,timezone,rest,is_active";

app.get("/", async (c) => {
  const countryId = c.req.param("countryId");
  const id = Number(countryId);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid country id" }, 400);
  }

  const level = c.req.query("level");
  const parentId = c.req.query("parent_id");
  const pathPrefix = c.req.query("path_prefix");

  const supabase = getSupabase(c.env);
  let query = supabase
    .from("admin_divisions")
    .select(SELECT_DIVISIONS)
    .eq("country_id", id)
    .eq("is_deleted", false);

  if (level !== undefined) {
    const levelNum = Number(level);
    if (Number.isNaN(levelNum)) {
      return c.json({ error: "Invalid level" }, 400);
    }
    query = query.eq("level", levelNum);
  }
  if (parentId !== undefined) {
    const pid = parentId === "null" ? null : Number(parentId);
    if (pid !== null && Number.isNaN(pid)) {
      return c.json({ error: "Invalid parent_id" }, 400);
    }
    query = query.eq("parent_id", pid);
  }
  if (pathPrefix !== undefined && pathPrefix !== "") {
    query = query.like("path", `${pathPrefix}%`);
  }

  const { data, error } = await query.order("name");

  if (error) {
    return c.json({ error: error.message }, 500);
  }
  return c.json(data);
});

app.get("/:divisionId", async (c) => {
  const countryId = c.req.param("countryId");
  const divisionId = c.req.param("divisionId");
  const cid = Number(countryId);
  const did = Number(divisionId);
  if (Number.isNaN(cid) || Number.isNaN(did)) {
    return c.json({ error: "Invalid id" }, 400);
  }

  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("admin_divisions")
    .select(SELECT_DIVISIONS)
    .eq("id", did)
    .eq("country_id", cid)
    .eq("is_deleted", false)
    .single();

  if (error) {
    if (error.code === "PGRST116") return c.json({ error: "Not found" }, 404);
    return c.json({ error: error.message }, 500);
  }
  return c.json(data);
});

export default app;
