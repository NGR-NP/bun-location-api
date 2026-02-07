# Bun + Hono Location API (Cloudflare Worker + Supabase Postgres)

## Goal

Lightweight location API for **any country**, with hierarchy defined per country. Deployed as a **Cloudflare Worker**, with **PostgreSQL on Supabase** as the database.

---

## Stack

| Layer     | Choice                  | Why                                                                   |
| --------- | ----------------------- | --------------------------------------------------------------------- |
| Runtime   | **Bun**                 | Fast, native TS, single binary.                                       |
| Framework | **Hono**                | Tiny, Worker-first, great DX.                                         |
| Deploy    | **Cloudflare Workers**  | Edge, low cold start, free tier.                                      |
| Database  | **Supabase (Postgres)** | Managed Postgres + REST via Supabase client.                          |
| DB access | **Supabase JS client**  | Workers use REST (PostgREST); no long-lived TCP. Use Supabase client. |

---

## Just database vs full Supabase

|                   | **Full Supabase (current)**                                                                | **Just the database**                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **What you use**  | Supabase project URL + service key; `@supabase/supabase-js` talks to **PostgREST** (HTTP). | Supabase as **Postgres host only**; use **connection string** + a serverless driver or **Hyperdrive**.                                                             |
| **In the Worker** | HTTP only → no TCP, no connection pool to manage.                                          | Need a **pooler** (e.g. Supabase pooler) + **serverless driver** (e.g. `@neondatabase/serverless`) or **Hyperdrive** (Cloudflare) to avoid long-lived connections. |
| **Setup**         | Already done; one client, simple.                                                          | Extra: get connection string, configure Hyperdrive or driver, write SQL or use a query builder.                                                                    |
| **Good for**      | Fast to ship; read-heavy APIs; optional use of Auth, Realtime, Storage later.              | Raw SQL, minimal lock-in, or squeezing out max DB latency with connection caching.                                                                                 |

**Recommendation:** Use **full Supabase** (current setup) for this project: lightweight, no extra infra, works in Workers out of the box. Switch to “just database” only if you later need raw SQL everywhere, want to move off Supabase easily, or are optimizing DB latency with Hyperdrive.

---

**Future: images (Supabase Storage)** — The same Supabase project and `@supabase/supabase-js` client support **Storage**. When you need to store images (e.g. country/division icons, user uploads), create a bucket in the Supabase dashboard and use `supabase.storage.from('bucket').upload()` / `getPublicUrl()`. No new infra; same env vars (URL + service key) work for DB and Storage.

---

## Multi-country, structure-driven hierarchy

- Each **country** has a **structure** (plain **text**) that defines the order of division types, e.g.  
  `province>district>city>ward` (Nepal) or `state>district>locality` (another country).
- **Structure is only for knowing how to store** admin_divisions: it tells you how to set **type** and **level** when seeding or validating. It is **not used for querying**.
- Level 1 = first segment, level 2 = second, etc. The last segment (e.g. `ward`) is not a stored level—only metadata in `rest` on the parent (e.g. city).
- Parse when needed: `structure.split('>')` → ordered types; level N = Nth segment.

---

## Schema (Postgres)

### 1. `countries`

- `id` (PK), `name`, `name_local`, `iso_code`, `icon`, **`structure`** (**text**, e.g. `province>district>city>ward`), `continent`, `timezone`, `is_active`, `is_deleted`, `is_archived`, `rest` (JSONB), `created_at`, `updated_at`.

### 2. `admin_divisions`

- `id` (PK), `country_id` (FK → countries), `parent_id` (FK → admin_divisions, self), `name`, `name_local`, `code`, **`type`**, **`level`** (1, 2, 3, …), **`path`** (see below), `timezone`, **`rest`** (JSONB; e.g. wards count, admType), `is_active`, `is_deleted`, `is_archived`, `created_at`, `updated_at`.

**Indexes for queryability:**  
`(country_id, level)` · `(country_id, parent_id)` · `(path text_pattern_ops)`. Optional: `(iso_code)` on countries.

---

## Path (full location hierarchy) — format and querying

**What it is:** The **full path** of the division: country code + every parent name + this division’s name, so you can express “where” it is and query by location (e.g. “everything in Sunsari”, “in my city”, “nearby”).

**Format (text, one column):**

- Separator: **`>`**
- Segments: **lowercase** for consistent querying.
- Order: **country iso code** (e.g. `np`) then each level’s **name** in order.

**Examples:**

| name      | type     | path                             |
| --------- | -------- | -------------------------------- |
| Kathmandu | city     | `np>bagmati>kathmandu>kathmandu` |
| Itahari   | city     | `np>koshi>sunsari>itahari`       |
| Sunsari   | district | `np>koshi>sunsari`               |
| Koshi     | province | `np>koshi`                       |

So: **path = `{country_iso}>{level1_name}>{level2_name}>...>{self_name}`** (no trailing `>`).

**Index (see also “Design revalidation” for full list):**  
`CREATE INDEX idx_admin_divisions_path_prefix ON admin_divisions (path text_pattern_ops);`

**Why this is good for read-heavy query:**

- **“All in Sunsari”** (district) → divisions whose path **starts with** `np>koshi>sunsari` (district itself + all cities under it):
  - `WHERE path LIKE 'np>koshi>sunsari%'`
- **“In my city”** (user’s location = Itahari) → exact match or “things under this city”:
  - Exact: `WHERE path = 'np>koshi>sunsari>itahari'`
  - Under city: `WHERE path LIKE 'np>koshi>sunsari>itahari%'`
- **“Nearby”** (e.g. same district) → same prefix:
  - Same district: `WHERE path LIKE 'np>koshi>sunsari%'`
  - Same province: `WHERE path LIKE 'np>koshi%'`

**Index for high read:**

- Use a **prefix-friendly index** so `path LIKE 'np>koshi>sunsari%'` is fast (no full table scan):

```sql
CREATE INDEX idx_admin_divisions_path_prefix
ON admin_divisions (path text_pattern_ops);
```

- `text_pattern_ops` in Postgres makes the btree index usable for `LIKE 'prefix%'` (and `=`). Avoid leading `%` in LIKE (e.g. `%sunsari%`) if you want index use; prefer prefix conditions.

**Optional (if Supabase allows):** Postgres **ltree** extension: store path as `np.koshi.sunsari.itahari` (dots). Then you can use `path <@ 'np.koshi.sunsari'` (“under Sunsari”) with a GiST index for very fast hierarchy reads. Only worth it if you need maximum read perf and can enable the extension; the `text` path + `text_pattern_ops` index is usually enough.

---

## API (generic, any country)

- `GET /health`
- `GET /countries` — list countries (includes `structure` so client can label levels).
- `GET /countries/:countryId/divisions?level=1` or `?level=2&parent_id=...` — list divisions.
- `GET /countries/:countryId/divisions/:id` — single division (optional).
- **Location-based (path):** e.g. `GET /countries/:countryId/divisions?path_prefix=np>koshi>sunsari` — all divisions in Sunsari (district + cities). Use when user picks “Sunsari” or “in my city” (use that division’s `path` as `path_prefix` for “everything under here”).
- `GET /search?q=...&country_id=...` — optional search by name.

---

## Env / secrets

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (set in Worker vars/secrets and in `.dev.vars` for local).

---

## Design revalidation: future-upgradable & queryable

**Goal:** Confirm the design stays flexible for new countries/structures and stays fast for read-heavy, location-based queries.

| Concern                       | Design choice                                                                                       | Upgrade / query impact                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **New country**               | Add row in `countries` (with its `structure`), seed `admin_divisions` with matching `type`/`level`. | No schema change. Structure is per-country; levels and types stay generic.                                                              |
| **New hierarchy depth**       | `structure` can have more segments (e.g. 4 or 5 levels); `level` is integer.                        | No schema change. Seed and API already use `level` and `parent_id`.                                                                     |
| **New metadata per division** | Use `rest` (JSONB): e.g. population, area, `wards`, `admType`.                                      | No new columns. Optional: later add GIN index on `rest` if you query inside JSON often.                                                 |
| **New metadata per country**  | Use `countries.rest` (JSONB).                                                                       | Same as above.                                                                                                                          |
| **Path format**               | Single text column, `{iso}>{name1}>...>{nameN}`, lowercase, `>` separator.                          | Prefix queries + index cover “in Sunsari”, “in my city”, “nearby”. Keep format stable (no separator change) to avoid data migration.    |
| **List divisions**            | Filter by `country_id`, `level`, `parent_id`.                                                       | Add indexes so these filters are fast (see below).                                                                                      |
| **Search by name**            | `GET /search?q=...` with `ilike` on `name` (and optionally `path`).                                 | Add index for search if needed: e.g. `(country_id, name text_pattern_ops)` or trigram for fuzzy search later.                           |
| **Soft delete / status**      | `is_active`, `is_deleted`, `is_archived` on both tables.                                            | All list/search queries should filter `is_deleted = false` (and optionally `is_active = true`). Easy to extend (e.g. “archived” views). |
| **API evolution**             | Resource-based: `/countries`, `/countries/:id/divisions`.                                           | Can add `/v1/` later; new params (e.g. `?path_prefix=`) don’t break existing clients.                                                   |

**Recommended indexes (queryable, high read):**

- **admin_divisions**
  - `(country_id, level)` — list top-level or N-th level divisions.
  - `(country_id, parent_id)` — list children of a division.
  - `(path text_pattern_ops)` — path prefix / “all in Sunsari”, “in my city”, “nearby”.
  - Optional: `(country_id, is_deleted)` (or include in above) so list endpoints always filter deleted.
- **countries**
  - Normal PK on `id`; optional index on `iso_code` if you often look up by code.

**Summary:** The current idea is **future-upgradable** (new countries and levels via data + `rest`, no schema churn) and **queryable** (path prefix + indexes for list/by-location and search). Keep path format and separator fixed; extend via `rest` and new indexes as needed.

---

## Implementation order

1. Scaffold: Bun, Hono, wrangler, Supabase client.
2. Supabase: migrations for `countries` (structure as **text**), `admin_divisions` (no `wards` column; use `rest`); create indexes above.
3. Seed script: read `data.json`, set type/level from country structure (split by `>`), build path as `np>...`, ward count in `rest`.
4. Routes: divisions by country + level + parent_id + path_prefix; always filter `is_deleted = false`.
5. Deploy with wrangler.
