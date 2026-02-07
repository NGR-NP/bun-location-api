export interface Country {
  id: number;
  name: string;
  name_local: string | null;
  iso_code: string;
  icon: string;
  structure: string;
  continent: string;
  timezone: string | null;
  is_active: boolean;
  is_deleted: boolean;
  is_archived: boolean;
  rest: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AdminDivision {
  id: number;
  country_id: number;
  parent_id: number | null;
  name: string;
  name_local: string | null;
  code: string | null;
  type: string;
  level: number;
  path: string;
  timezone: string | null;
  rest: Record<string, unknown> | null;
  is_active: boolean;
  is_deleted: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}
