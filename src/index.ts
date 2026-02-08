import { Hono } from "hono";
import type { Env } from "./env";
import countries from "./routes/countries";
import divisions from "./routes/divisions";
import search from "./routes/search";
import npRoute from "./routes/np/np-location";
import { cors } from "hono/cors";

const app = new Hono<{ Bindings: Env }>();
app.use(
  "/*",
  cors({
    origin: "*",
  })
);

app.get("/v1/health", (c) => c.json({ ok: true,c: c.env })); //testing env 

app.route("/v1/countries", countries);
app.route("/v1/countries/:countryId/divisions", divisions);
app.route("/v1/search", search);
app.route("/v1/np", npRoute)

export default app