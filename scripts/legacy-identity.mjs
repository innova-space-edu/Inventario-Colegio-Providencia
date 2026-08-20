import { createHash } from "node:crypto";

function canonicalKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function explicitId(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  for (const [key, value] of Object.entries(row)) {
    if (canonicalKey(key) !== "ID") continue;
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized || null;
  }
  return null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function rowFingerprint(row) {
  const serialized = JSON.stringify(stableValue(row));
  return createHash("sha256").update(serialized).digest("hex");
}

export function createSourceIdentityResolver() {
  const fingerprintOccurrences = new Map();

  return function resolveSourceIdentity(row) {
    const id = explicitId(row);
    if (id) return { sourceId: id, strategy: "explicit_id", fingerprint: null, occurrence: null };

    const fingerprint = rowFingerprint(row);
    const occurrence = (fingerprintOccurrences.get(fingerprint) ?? 0) + 1;
    fingerprintOccurrences.set(fingerprint, occurrence);

    return {
      sourceId: `hash-${fingerprint.slice(0, 32)}-${occurrence}`,
      strategy: "content_hash",
      fingerprint,
      occurrence,
    };
  };
}
