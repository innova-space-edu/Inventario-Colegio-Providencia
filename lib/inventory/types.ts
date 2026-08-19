export type InventorySearchParams = Record<string, string | string[] | undefined>;

export type FamilyCatalog = {
  id: string;
  code: string;
  name: string;
};

export type StatusCatalog = {
  id: string;
  code: string;
  name: string;
  is_disposed: boolean;
};

export type LocationCatalog = {
  id: string;
  name: string;
  area: string | null;
};

export type AssetFormInitial = {
  id?: string;
  inventory_code?: string | null;
  family_id?: string;
  status_id?: string | null;
  location_id?: string | null;
  name?: string | null;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  quantity?: number;
  area?: string | null;
  observations?: string | null;
  memory?: string | null;
  storage?: string | null;
  screen?: string | null;
  keyboard?: string | null;
  battery?: string | null;
  charger?: string | null;
  lumens?: string | null;
  hdmi?: string | null;
  vga?: string | null;
  size?: string | null;
};
