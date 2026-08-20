export function canonicalLegacyKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function legacyValue(payload: unknown, ...aliases: string[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const entries = Object.entries(payload as Record<string, unknown>).map(([key, value]) => [canonicalLegacyKey(key), value] as const);
  const wanted = aliases.map(canonicalLegacyKey);

  for (const alias of wanted) {
    const exact = entries.find(([key]) => key === alias);
    if (exact) return exact[1];
  }

  for (const alias of wanted.filter((item) => item.length >= 5)) {
    const prefix = entries.find(([key]) => key.startsWith(alias) || alias.startsWith(key));
    if (prefix) return prefix[1];
  }

  return null;
}

export function legacyText(payload: unknown, ...aliases: string[]) {
  const value = legacyValue(payload, ...aliases);
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function legacyDate(payload: unknown, ...aliases: string[]) {
  const value = legacyText(payload, ...aliases);
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}
