"use client";

import { useMemo, useState } from "react";
import type {
  AssetFormInitial,
  FamilyCatalog,
  LocationCatalog,
  LocationCategory,
  StatusCatalog,
} from "@/lib/inventory/types";

type AssetFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  families: FamilyCatalog[];
  statuses: StatusCatalog[];
  locations: LocationCatalog[];
  initial?: AssetFormInitial;
  mode?: "create" | "edit";
  error?: string;
};

const LOCATION_LABELS: Record<LocationCategory, string> = {
  classroom: "Salas de clases",
  office: "Oficinas",
  dependency: "Dependencias",
  legacy: "Ubicación heredada",
};

const COMPUTER_TYPES = [
  "PC escritorio",
  "Notebook",
  "Todo en uno",
  "Pantalla interactiva",
  "Monitor / Pantalla",
];

export function AssetForm({ action, families, statuses, locations, initial = {}, mode = "create", error }: AssetFormProps) {
  const firstFamily = initial.family_id ?? families[0]?.id ?? "";
  const [familyId, setFamilyId] = useState(firstFamily);
  const familyCode = useMemo(() => families.find((family) => family.id === familyId)?.code ?? "", [families, familyId]);

  const currentLocation = useMemo(
    () => locations.find((location) => location.id === initial.location_id),
    [locations, initial.location_id],
  );
  const [locationCategory, setLocationCategory] = useState<LocationCategory>(currentLocation?.category ?? "classroom");
  const [locationId, setLocationId] = useState(initial.location_id ?? "");

  const locationOptions = useMemo(
    () => locations.filter((location) => (location.selectable && location.category === locationCategory) || location.id === initial.location_id),
    [locations, locationCategory, initial.location_id],
  );

  const touchDefault = initial.touch_enabled === true ? "true" : initial.touch_enabled === false ? "false" : "";

  return (
    <form action={action} className="asset-form">
      {initial.id ? <input name="asset_id" type="hidden" value={initial.id} /> : null}
      {mode === "edit" ? <input name="family_id" type="hidden" value={familyId} /> : null}
      {error ? <div className="error-box">No fue posible guardar el registro. Revisa los datos e inténtalo nuevamente.</div> : null}

      <section className="form-section">
        <div className="form-section-heading"><div><h2>Identificación del activo</h2><p>Datos generales del dispositivo o elemento inventariado.</p></div></div>
        <div className="form-grid">
          <label className="field"><span>Código de inventario</span><input defaultValue={initial.inventory_code ?? ""} name="inventory_code" placeholder="Ej. CP-TI-0001" /></label>
          <label className="field"><span>Familia tecnológica</span><select disabled={mode === "edit"} name={mode === "edit" ? undefined : "family_id"} onChange={(event) => setFamilyId(event.target.value)} required value={familyId}>{families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select></label>
          <label className="field"><span>Tipo / subfamilia</span><input defaultValue={initial.asset_type ?? ""} list={familyCode === "computer" ? "computer-device-types" : undefined} name="asset_type" placeholder={familyCode === "computer" ? "Ej. Notebook o Pantalla interactiva" : "Ej. IMPRESORA, PARLANTE, PROYECTOR"} />{familyCode === "computer" ? <datalist id="computer-device-types">{COMPUTER_TYPES.map((type) => <option key={type} value={type} />)}</datalist> : null}</label>
          <label className="field"><span>Nombre / descripción</span><input defaultValue={initial.name ?? ""} name="name" placeholder="Descripción principal del equipo o elemento" /></label>
          <label className="field"><span>Marca</span><input defaultValue={initial.brand ?? ""} name="brand" /></label>
          <label className="field"><span>Modelo</span><input defaultValue={initial.model ?? ""} name="model" /></label>
          <label className="field"><span>Número de serie</span><input defaultValue={initial.serial_number ?? ""} name="serial_number" /></label>
          <label className="field"><span>Cantidad</span><input defaultValue={initial.quantity ?? 1} min="1" name="quantity" required type="number" /></label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading"><div><h2>Ubicación, responsable y estado</h2><p>Las ubicaciones oficiales se eligen desde un catálogo cerrado para evitar nombres duplicados.</p></div></div>
        <div className="form-grid">
          <label className="field"><span>Estado</span><select defaultValue={initial.status_id ?? ""} name="status_id"><option value="">Sin estado</option>{statuses.filter((status) => !status.is_disposed).map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label>
          <label className="field"><span>Tipo de ubicación</span><select onChange={(event) => { const next = event.target.value as LocationCategory; setLocationCategory(next); const selected = locations.find((location) => location.id === locationId); if (!selected || selected.category !== next) setLocationId(""); }} value={locationCategory}><option value="classroom">Salas de clases</option><option value="office">Oficinas</option><option value="dependency">Dependencias</option>{currentLocation?.category === "legacy" ? <option value="legacy">Ubicación heredada</option> : null}</select></label>
          <label className="field"><span>Ubicación</span><select name="location_id" onChange={(event) => setLocationId(event.target.value)} value={locationId}><option value="">Sin ubicación</option>{locationOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><small>{LOCATION_LABELS[locationCategory]}</small></label>
          <label className="field"><span>Responsable</span><input defaultValue={initial.responsible_name ?? ""} name="responsible_name" placeholder="Nombre de la persona responsable" /></label>
          <label className="field field-wide"><span>Área / dependencia complementaria</span><input defaultValue={initial.area ?? ""} name="area" placeholder="Dato complementario opcional" /></label>
          <label className="field field-wide"><span>Observaciones</span><textarea defaultValue={initial.observations ?? ""} name="observations" rows={4} /></label>
        </div>
      </section>

      {familyCode === "computer" ? <section className="form-section"><div className="form-section-heading"><div><h2>Especificaciones del dispositivo de computación</h2><p>Ficha genérica para PC escritorio, notebook, todo en uno, pantalla interactiva y monitor/pantalla.</p></div></div><div className="form-grid">
        <label className="field"><span>Tamaño</span><input defaultValue={initial.screen_size ?? ""} name="screen_size" placeholder="Ej. 15,6 pulgadas o 75 pulgadas" /></label>
        <label className="field"><span>Sistema operativo</span><input defaultValue={initial.operating_system ?? ""} name="operating_system" placeholder="Ej. Windows 11, Android 13" /></label>
        <label className="field"><span>Memoria RAM</span><input defaultValue={initial.memory ?? ""} name="memory" /></label>
        <label className="field"><span>Almacenamiento</span><input defaultValue={initial.storage ?? ""} name="storage" /></label>
        <label className="field"><span>Resolución</span><input defaultValue={initial.resolution ?? ""} name="resolution" placeholder="Ej. 1920 × 1080" /></label>
        <label className="field"><span>Táctil</span><select defaultValue={touchDefault} name="touch_enabled"><option value="">Sin información</option><option value="true">Sí</option><option value="false">No</option></select></label>
        <label className="field"><span>Cantidad de puntos táctiles</span><input defaultValue={initial.touch_points ?? ""} min="0" name="touch_points" type="number" /></label>
        <label className="field"><span>Pantalla / dato heredado</span><input defaultValue={initial.screen ?? ""} name="screen" /></label>
        <label className="field"><span>Teclado</span><input defaultValue={initial.keyboard ?? ""} name="keyboard" /></label>
        <label className="field"><span>Batería</span><input defaultValue={initial.battery ?? ""} name="battery" /></label>
        <label className="field"><span>Cargador</span><input defaultValue={initial.charger ?? ""} name="charger" /></label>
      </div></section> : null}
      {familyCode === "projector" ? <section className="form-section"><div className="form-section-heading"><div><h2>Especificaciones de proyector</h2><p>Campos técnicos del proyector.</p></div></div><div className="form-grid"><label className="field"><span>Lúmenes</span><input defaultValue={initial.lumens ?? ""} name="lumens" /></label><label className="field"><span>HDMI</span><input defaultValue={initial.hdmi ?? ""} name="hdmi" /></label><label className="field"><span>VGA</span><input defaultValue={initial.vga ?? ""} name="vga" /></label></div></section> : null}
      {familyCode === "television" ? <section className="form-section"><div className="form-section-heading"><div><h2>Especificaciones de televisor</h2><p>Datos técnicos del televisor.</p></div></div><div className="form-grid"><label className="field"><span>Tamaño</span><input defaultValue={initial.size ?? ""} name="size" placeholder="Ej. 55 pulgadas" /></label></div></section> : null}

      <div className="form-actions"><button className="button button-primary" type="submit">{mode === "edit" ? "Guardar cambios" : "Crear activo"}</button></div>
    </form>
  );
}
