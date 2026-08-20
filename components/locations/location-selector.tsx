"use client";

import { useRouter, useSearchParams } from "next/navigation";

type LocationOption = {
  id: string;
  name: string;
  count: number;
};

type LocationSelectorProps = {
  category: string;
  categoryLabel: string;
  locations: LocationOption[];
  selectedId?: string;
};

export function LocationSelector({ category, categoryLabel, locations, selectedId = "" }: LocationSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tipo", category);
    if (value) params.set("ubicacion", value);
    else params.delete("ubicacion");
    router.push(`/ubicaciones?${params.toString()}`);
  }

  return <div className="form-grid" style={{ alignItems: "end" }}>
    <label className="field field-wide">
      <span>Seleccionar ubicación</span>
      <select aria-label={`Seleccionar ubicación de ${categoryLabel}`} onChange={(event) => handleChange(event.target.value)} value={selectedId}>
        <option value="">Selecciona una ubicación...</option>
        {locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.count} activo(s)</option>)}
      </select>
    </label>
  </div>;
}
