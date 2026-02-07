/**
 * One-off seed: Nepal country + admin_divisions from data.json.
 * Path format: np>province>district>city. Ward count and admType in rest (JSONB).
 *
 * Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run scripts/seed-nepal.ts
 * Or copy .dev.vars.example to .dev.vars and run (script loads .dev.vars if present).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare const Bun: {
  file(path: string): { text(): Promise<string>; json(): Promise<unknown> };
};
declare const process: { env: Record<string, string | undefined>; exit(code: number): never };

async function loadDevVars(): Promise<void> {
  try {
    const text = await Bun.file(".dev.vars").text();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // no .dev.vars
  }
}


type Row = {
  locallevel_fullcode: string;
  country_code: string;
  province_code: string;
  district_code: string;
  district_name: string;
  locallevel_code: string;
  name: string;
  name_native: string;
  type: string;
  wards: number;
};

const PROVINCES: Record<string, { name: string; code: string }> = {
  "1": { name: "koshi", code: "NP-P1" },
  "2": { name: "madhesh", code: "NP-P2" },
  "3": { name: "bagmati", code: "NP-P3" },
  "4": { name: "gandaki", code: "NP-P4" },
  "5": { name: "lumbini", code: "NP-P5" },
  "6": { name: "karnali", code: "NP-P6" },
  "7": { name: "sudurpashchim", code: "NP-P7" },
};

async function ensureNepal(supabase: SupabaseClient): Promise<number> {
  const { data: existing } = await supabase
    .from("countries")
    .select("id")
    .eq("iso_code", "NP")
    .eq("is_deleted", false)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: inserted, error } = await supabase
    .from("countries")
    .insert({
      name: "nepal",
      name_local: "नेपाल",
      iso_code: "NP",
      icon: "🇳🇵",
      structure: "province>district>city>ward",
      continent: "asia",
      timezone: "Asia/Kathmandu",
      is_active: true,
      is_deleted: false,
      is_archived: false,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Insert country: ${error.message}`);
  return inserted!.id;
}
import data from "./data.json"; // Bun handles the parsing automatically

async function main() {
  await loadDevVars();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or .dev.vars)");
    process.exit(1);
  }
  const supabase = createClient(url, key);
  // scripts/seed-nepal.ts

  // const data = d //as Row[];
  console.log(typeof data)

  const countryId = await ensureNepal(supabase);
  const provincesMap = new Map<string, number>();
  const districtsMap = new Map<string, number>();

  for (const item of data) {
    const provinceKey = item.province_code;
    const districtKey = `${item.province_code}-${item.district_code}`;
    const province = PROVINCES[provinceKey];
    if (!province) continue;

    const iso = "np";

    if (!provincesMap.has(provinceKey)) {
      const path = `${iso}>${province.name}`;
      const { data: res, error } = await supabase
        .from("admin_divisions")
        .insert({
          country_id: countryId,
          parent_id: null,
          name: province.name.toLocaleLowerCase(),
          name_local: null,
          code: province.code,
          type: "province",
          level: 1,
          path,
          is_active: true,
          is_deleted: false,
          is_archived: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Insert province ${province.name}: ${error.message}`);
      provincesMap.set(provinceKey, res!.id);
    }

    const districtName = item.district_name.toLowerCase();
    if (!districtsMap.has(districtKey)) {
      const provinceId = provincesMap.get(provinceKey)!;
      const path = `${iso}>${province.name}>${districtName}`;
      const { data: res, error } = await supabase
        .from("admin_divisions")
        .insert({
          country_id: countryId,
          parent_id: provinceId,
          name: districtName.toLocaleLowerCase(),
          name_local: null,
          code: null,
          type: "district",
          level: 2,
          path,
          is_active: true,
          is_deleted: false,
          is_archived: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Insert district ${districtName}: ${error.message}`);
      districtsMap.set(districtKey, res!.id);
    }

    if (item.wards != null) {
      const districtId = districtsMap.get(districtKey)!;
      const cityName = item.name.toLowerCase();
      const path = `${iso}>${province.name}>${districtName}>${cityName}`;
      const rest = { wards: item.wards, admType: item.type };
      const { error } = await supabase.from("admin_divisions").insert({
        country_id: countryId,
        parent_id: districtId,
        name: cityName.toLocaleLowerCase(),
        name_local: item.name_native || null,
        code: null,
        type: "city",
        level: 3,
        path,
        rest,
        is_active: true,
        is_deleted: false,
        is_archived: false,
      });
      if (error) throw new Error(`Insert city ${cityName}: ${error.message}`);
    }
  }

  console.log("Nepal admin divisions seeded successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
