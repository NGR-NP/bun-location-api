import { Hono } from "hono";
import { getSupabase } from "../../db/client";
import { type Env } from "@/env";

const npRoute = new Hono<{ Bindings: Env }>();
const LIMIT = 8;

const structure = {
    province: "province",
    district: "district",
    city: "city"
} as const
const levelStru = {
    [structure.province]: 1,
    [structure.district]: 2,
    [structure.city]: 3
} as const

const SELECT_DIVISIONS =
    "id,country_id,parent_id,name,name_local,code,type,level,path,timezone,rest,is_active";
function pickFields<
    T extends Record<string, string>,
    K extends readonly (keyof T)[]
>(obj: T, keys: K) {
    return keys.reduce((acc, key) => {
        acc[key] = obj[key];
        return acc;
    }, {} as Pick<T, K[number]>);
}

const field = {
    id: "id",
    country_id: "country_id",
    parent_id: "parent_id",
    name: "name",
    name_local: "name_local",
    code: "code",
    type: "type",
    level: "level",
    path: "path",
    timezone: "timezone",
    rest: "rest"
} as const;

type FieldKey = keyof typeof field;

const isValidFieldKey = (key: string): key is FieldKey => {
    return key in field;
};
function parseSelectFields(
    input: string | undefined,
    fallback: FieldKey[]
): string {
    if (!input) {
        return fallback.join(",");
    }

    const validKeys = input
        .split(",")
        .map(k => k.trim())
        .filter(Boolean)
        .filter(isValidFieldKey);

    // If nothing valid was provided → fallback
    if (validKeys.length === 0) {
        return fallback.join(",");
    }

    return validKeys.join(",");
}

const cid = 1;
npRoute.get(`/${structure.province}`, async (c) => {

    const level = levelStru["province"]
    const namePrefix = c.req.query("search");
    const fieldPrefix = c.req.query("field")?.trim();
    const selectField = parseSelectFields(fieldPrefix, [
        "id",
        "country_id",
        "code",
        "level",
        "name",
    ]);

    const supabase = getSupabase(c.env);
    let query = supabase
        .from("admin_divisions")
        .select(selectField)
        .eq("country_id", cid)
        .eq("level", level)
        .eq("is_deleted", false);

    if (namePrefix !== undefined && namePrefix !== "" && namePrefix.length <= 10) {
        query = query.like("name", `${namePrefix}%`);
    }

    const { data, error } = await query.order("name");

    if (error) {
        return c.json({ error: error.message }, 500);
    }
    return c.json(data);
});
const defaultSelect = [
    "id",
    "country_id",
    "level",
    "name",

] satisfies FieldKey[]
const fun = async ({ env, fieldPrefix, pid, level, namePrefix }: { env: Env, fieldPrefix?: string, pid: number, level: number, namePrefix?: string }) => {

    const selectField = parseSelectFields(fieldPrefix, defaultSelect);

    const supabase = getSupabase(env);
    let query = supabase
        .from("admin_divisions")
        .select(selectField)
        .eq("parent_id", pid)
        .eq("level", level)
        .eq("country_id", cid)
        .eq("is_deleted", false)
        .limit(LIMIT)

    if (namePrefix !== undefined && namePrefix !== "" && namePrefix.length <= 10) {
        query = query.like("name", `${namePrefix}%`);
    }
    return await query.order("name");

}
npRoute.get(`/${structure.district}/:parentId`, async (c) => {
    const parentId = c.req.param("parentId");
    const pid = Number(parentId);
    if (Number.isNaN(pid)) {
        return c.json({ error: "Invalid id" }, 400);
    }
    const level = levelStru["district"]
    const namePrefix = c.req.query("search");
    const fieldPrefix = c.req.query("field")?.trim();
    const { data, error } = await fun({
        level, namePrefix, fieldPrefix, pid, env: c.env
    })
    if (error) {
        return c.json({ error: error.message }, 500);
    }
    return c.json(data);
});

npRoute.get(`/${structure.city}/:parentId`, async (c) => {
    const parentId = c.req.param("parentId");
    const pid = Number(parentId);
    if (Number.isNaN(pid)) {
        return c.json({ error: "Invalid id" }, 400);
    }
    const level = levelStru["city"]
    const namePrefix = c.req.query("search");
    const fieldPrefix = c.req.query("field")?.trim() ?? defaultSelect.toString()
    const { data, error } = await fun({
        level, namePrefix, fieldPrefix: fieldPrefix + ",rest", pid, env: c.env
    })
    if (error) {
        return c.json({ error: error.message }, 500);
    }
    return c.json(data);
});


npRoute.get("/search/:type", async (c) => {
    const type = c.req.param("type");

    const q = c.req.query("q")?.trim();
    if (!q || q.length < 2) {
        return c.json({ error: "Query 'q' required (min 2 chars)" }, 400);
    }
    const fieldPrefix = c.req.query("field")?.trim()

    const fieldsToPick = parseSelectFields(fieldPrefix, defaultSelect)?.split(",")

    const level = levelStru[type as keyof typeof levelStru];
    if (!level) {
        return c.json({ error: "invalid type" }, 400);
    }

    const supabase = getSupabase(c.env);


    const { data, error } = await supabase.rpc("search_admin_divisions", {
        search: q,
        lvl: level,
        cid,
        lim: LIMIT,
    });
    const filteredObjects = data.map((item: Record<string, unknown>) => {
        const filtered: Record<string, unknown> = {};
        [type == "city" ? "rest" : "", ...fieldsToPick]?.forEach((key) => {
            if (key in item) {
                filtered[key] = item[key];
            }
        });
        return filtered;
    })
    if (error) {
        return c.json({ error: error.message }, 500);
    }
    return c.json(filteredObjects);
});
npRoute.get("/search/:type/:parentId", async (c) => {
    const type = c.req.param("type");
    const parentId = c.req.param("parentId");
    const pid = Number(parentId);
    if (Number.isNaN(pid)) {
        return c.json({ error: "Invalid id" }, 400);
    }

    const q = c.req.query("q")?.trim();
    if (!q || q.length < 2) {
        return c.json({ error: "Query 'q' required (min 2 chars)" }, 400);
    }
    const fieldPrefix = c.req.query("field")?.trim() ?? defaultSelect.toString()

    const fieldsToPick = parseSelectFields(fieldPrefix, defaultSelect)?.split(",")

    const level = levelStru[type as keyof typeof levelStru];
    if (!level) {
        return c.json({ error: "invalid type" }, 400);
    }

    const supabase = getSupabase(c.env);


    const { data, error } = await supabase.rpc("search_admin_divisions_with_parentid", {
        search: q,
        lvl: level,
        cid,
        lim: LIMIT,
        parent: pid
    });
    const filteredObjects = data.map((item: Record<string, unknown>) => {
        const filtered: Record<string, unknown> = {};
        ["rest", ...fieldsToPick]?.forEach((key) => {
            if (key in item) {
                filtered[key] = item[key];
            }
        });
        return filtered;
    })
    if (error) {
        return c.json({ error: error.message }, 500);
    }
    return c.json(filteredObjects);
});

export default npRoute;
type TypeField = typeof field