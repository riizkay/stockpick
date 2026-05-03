const ID_MONTHS: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
};

const EN_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export function parseKontanPublishedDateRaw(raw: string): Date | null {
  if (!raw?.trim()) return null;

  let s = raw.trim().replace(/\s+/g, " ");

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) return d;
    return null;
  }

  if (s.includes("|")) {
    const parts = s
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    s = parts[parts.length - 1] ?? s;
  }

  const m = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const monthWord = m[2].toLowerCase();
  const year = Number(m[3]);

  const month = ID_MONTHS[monthWord] ?? EN_MONTHS[monthWord];
  if (month === undefined || day < 1 || day > 31) return null;

  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

export function toSqlDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export function kontanPublishedRawToSqlDate(raw: string, fallback: Date): string {
  const parsed = parseKontanPublishedDateRaw(raw);
  if (parsed) return toSqlDate(parsed);
  return toSqlDate(fallback);
}