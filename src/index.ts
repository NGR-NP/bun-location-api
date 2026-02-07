/// <reference types="@cloudflare/workers-types" />
import { Hono } from "hono";
import type { Env } from "./env";
import countries from "./routes/countries";
import divisions from "./routes/divisions";
import search from "./routes/search";
import npRoute from "./routes/np/np-location";
import { cors } from "hono/cors";

const app = new Hono<{ Bindings: Env }>();
app.use(
    '/v1/*',
    cors({
        origin: (_origin, c) => {
            return c.env.allow_origin
        }
    })
)
app.get("/v1/health", (c) => c.json({ ok: true }));

app.route("/v1/countries", countries);
app.route("/v1/countries/:countryId/divisions", divisions);
app.route("/v1/search", search);
app.route("/v1/np", npRoute)

// Cloudflare Worker: default export must be { fetch }
export default {
    fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
        app.fetch(request, env, ctx),
};
