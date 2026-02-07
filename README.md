# Bun Location API (Cloudflare Worker + Supabase)

Lightweight location API for any country. Admin divisions are structure-driven (e.g. `province>district>city>ward` for Nepal). Path format: `np>koshi>sunsari>itahari` for querying by location.

## Setup

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Supabase**
   - Create a project at [supabase.com](https://supabase.com).
   - Run the migration: in Supabase Dashboard → SQL Editor, run the contents of `supabase/migrations/001_initial.sql`.
   - Copy your project URL and **service_role** key (Settings → API).

3. **Local env**

   ```bash
   cp .dev.vars.example .dev.vars
   # Edit .dev.vars and set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   ```

4. **Seed Nepal data (optional)**

   ```bash
   bun run seed
   ```

   This inserts the Nepal country row and admin_divisions from `data.json` (path `np>...`, ward count in `rest`).

## Run locally

```bash
bun run dev
```

Wrangler will serve the Worker; use the printed URL (e.g. `http://localhost:8787`). You must set secrets for Supabase:

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Or rely on `.dev.vars` when using `wrangler dev` (Wrangler loads it automatically).

## Deploy

```bash
bun run deploy
```

Set the same secrets in the Cloudflare Worker dashboard (or `wrangler secret put`).

## API

- `GET /health` — liveness
- `GET /countries` — list countries
- `GET /countries/:countryId` — one country
- `GET /countries/:countryId/divisions?level=1` — top-level divisions
- `GET /countries/:countryId/divisions?level=2&parent_id=:id` — children
- `GET /countries/:countryId/divisions?path_prefix=np>koshi>sunsari` — all in Sunsari (district + cities)
- `GET /countries/:countryId/divisions/:divisionId` — one division
- `GET /search?q=...&country_id=...` — search by name/path

See `PLAN.md` for schema and path format.
