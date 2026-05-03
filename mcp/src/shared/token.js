export function resolveToken(override) {
  if (override == null || override === '') {
    return process.env.STOCKBIT_TOKEN?.trim() || '';
  }
  const t = String(override).trim();
  if (t) return t;
  return process.env.STOCKBIT_TOKEN?.trim() || '';
}
