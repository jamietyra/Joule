export function parseCarbonHeader(raw: number | string | undefined): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const num = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(num)) return undefined;
  if (num < 0) return undefined;
  return num;
}
