export type InventorySearchParams = Record<string, string | string[] | undefined>;

export type FamilyCatalog = { id: string; code: string; name: string };
export type StatusCatalog = { id: string; code: string; name: string; is_disposed: boolean };
export type LocationCategory = "classroom" | "office" | "dependency" | "legacy";
export type LocationCatalog = {
  id: string;
  name: string;
  area: string | null;
  category: LocationCategory;
  display_order: number;
  selectable: boolean;
};

export type AssetFormInitial = {
  id?: string;
  inventory_code?: string | null;
  family_id?: string;
  status_id?: string | null;
  location_id?: string | null;
  name?: string | null;
  asset_type?: string | null;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  quantity?: number;
  area?: string | null;
  responsible_name?: string | null;
  observations?: string | null;
  memory?: string | null;
  storage?: string | null;
  screen?: string | null;
  keyboard?: string | null;
  battery?: string | null;
  charger?: string | null;
  screen_size?: string | null;
  operating_system?: string | null;
  resolution?: string | null;
  touch_enabled?: boolean | null;
  touch_points?: number | null;
  lumens?: string | null;
  hdmi?: string | null;
  vga?: string | null;
  size?: string | null;
};
