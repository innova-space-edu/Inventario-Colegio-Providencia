"use client";

import { useMemo, useState } from "react";
import type {
  AssetFormInitial,
  FamilyCatalog,
  LocationCatalog,
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

export function AssetForm({
  action,
  families,
  statuses,
  locations,
  initial = {},
  mode = "create",
  error,
}: AssetFormProps) {
  const firstFamily = initial.family_id ?? families[0]?.id ?? "";
  const [familyId, setFamilyId] = useState(firstFamily);
  const familyCode = useMemo(
    () => families.find((family) => family.id === familyId)?.code ?? "",
    [families, familyId],
  );

  return (
    <form action={action} className="asset-form">
      {initial.id ? <input name="asset_id" type="hidden" value={initial.id} /> : null}
      {mode === "edit" ? <input name="family_id" type="hidden" value={familyId} /> : null}

      {error ? <div className="error-box">No fue posible guardar el registro. Revisa los datos e inténtalo nuevamente.</div> : null}

      <section className="form-section">
        <div className="form-section-heading">
          <div>
            <h2>Identificación del activo</h2>
            <p>Datos generales equivalentes a los formularios del inventario original.</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Código de inventario</span>
            <input defaultValue={initial.inventory_code ?? ""} name="inventory_code" placeholder="Ej. CP-TI-0001" />
          </label>
          <label className="field">
            <span>Familia tecnológica</span>
            <select
              disabled={mode === "edit"}
              name={mode === "edit" ? undefined : "family_id"}
              onChange={(event) => setFamilyId(event.target.value)}
              required
              value={familyId}
            >
              {families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
            </select>
          </label>
          <label className="field field-wide">
            <span>Nombre / descripción</span>
            <input defaultValue={initial.name ?? ""} name="name" placeholder="Descripción principal del equipo o elemento" />
          </label>
          <label className="field">
            <span>Marca</span>
            <input defaultValue={initial.brand ?? ""} name="brand" />
          </label>
          <label className="field">
            <span>Modelo</span>
            <input defaultValue={initial.model ?? ""} name="model" />
          </label>
          <label className="field">
            <span>Número de serie</span>
            <input defaultValue={initial.serial_number ?? ""} name="serial_number" />
          </label>
          <label className="field">
            <span>Cantidad</span>
            <input defaultValue={initial.quantity ?? 1} min="1" name="quantity" required type="number" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <div>
            <h2>Ubicación y estado</h2>
            <p>Permite mantener trazabilidad del lugar físico y condición del activo.</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Estado</span>
            <select defaultValue={initial.status_id ?? ""} name="status_id">
              <option value="">Sin estado</option>
              {statuses.filter((status) => !status.is_disposed).map((status) => (
                <option key={status.id} value={status.id}>{status.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Ubicación</span>
            <select defaultValue={initial.location_id ?? ""} name="location_id">
              <option value="">Sin ubicación</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}{location.area ? ` · ${location.area}` : ""}</option>
              ))}
            </select>
          </label>
          <label className="field field-wide">
            <span>Área / dependencia</span>
            <input defaultValue={initial.area ?? ""} name="area" placeholder="Ej. Laboratorio, sala 12, biblioteca" />
          </label>
          <label className="field field-wide">
            <span>Observaciones</span>
            <textarea defaultValue={initial.observations ?? ""} name="observations" rows={4} />
          </label>
        </div>
      </section>

      {familyCode === "computer" ? (
        <section className="form-section">
          <div className="form-section-heading"><div><h2>Especificaciones de computador</h2><p>Campos del formulario FORCOMPUTADORAS.</p></div></div>
          <div className="form-grid">
            <label className="field"><span>Memoria RAM</span><input defaultValue={initial.memory ?? ""} name="memory" /></label>
            <label className="field"><span>Almacenamiento</span><input defaultValue={initial.storage ?? ""} name="storage" /></label>
            <label className="field"><span>Pantalla</span><input defaultValue={initial.screen ?? ""} name="screen" /></label>
            <label className="field"><span>Teclado</span><input defaultValue={initial.keyboard ?? ""} name="keyboard" /></label>
            <label className="field"><span>Batería</span><input defaultValue={initial.battery ?? ""} name="battery" /></label>
            <label className="field"><span>Cargador</span><input defaultValue={initial.charger ?? ""} name="charger" /></label>
          </div>
        </section>
      ) : null}

      {familyCode === "projector" ? (
        <section className="form-section">
          <div className="form-section-heading"><div><h2>Especificaciones de proyector</h2><p>Campos del formulario FORPROYECTORES.</p></div></div>
          <div className="form-grid">
            <label className="field"><span>Lúmenes</span><input defaultValue={initial.lumens ?? ""} name="lumens" /></label>
            <label className="field"><span>HDMI</span><input defaultValue={initial.hdmi ?? ""} name="hdmi" /></label>
            <label className="field"><span>VGA</span><input defaultValue={initial.vga ?? ""} name="vga" /></label>
          </div>
        </section>
      ) : null}

      {familyCode === "television" ? (
        <section className="form-section">
          <div className="form-section-heading"><div><h2>Especificaciones de televisor</h2><p>Campos del formulario FORTELEVISORES.</p></div></div>
          <div className="form-grid">
            <label className="field"><span>Tamaño</span><input defaultValue={initial.size ?? ""} name="size" placeholder="Ej. 55 pulgadas" /></label>
          </div>
        </section>
      ) : null}

      <div className="form-actions">
        <button className="button button-primary" type="submit">{mode === "edit" ? "Guardar cambios" : "Crear activo"}</button>
      </div>
    </form>
  );
}
