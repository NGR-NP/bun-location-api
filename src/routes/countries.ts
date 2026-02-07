import { Hono } from "hono";
import type { Env } from "../env";
import { getSupabase } from "../db/client";

const app = new Hono<{ Bindings: Env }>();

const SELECT_COUNTRIES =
  "id,name,name_local,iso_code,icon,structure,continent,timezone,is_active";

app.get("/", async (c) => {
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("countries")
    .select(SELECT_COUNTRIES)
    .eq("is_deleted", false)
    .order("name");

  if (error) {
    return c.json({ error: error.message }, 500);
  }
  return c.json(data);
});

app.get("/:countryId", async (c) => {
  const countryId = c.req.param("countryId");
  const id = Number(countryId);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid country id" }, 400);
  }

  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("countries")
    .select(SELECT_COUNTRIES)
    .eq("id", id)
    .eq("is_deleted", false)
    .single();

  if (error) {
    if (error.code === "PGRST116") return c.json({ error: "Not found" }, 404);
    return c.json({ error: error.message }, 500);
  }
  return c.json(data);
});

export default app;
