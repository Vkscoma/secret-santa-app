export function formatBudget(minimum: number | null, maximum: number | null) {
  if (minimum === null && maximum === null) return "Not set";
  if (minimum === null) return `Up to $${maximum}`;
  if (maximum === null) return minimum === 0 ? "No limit" : `At least $${minimum}`;
  if (minimum === maximum) return `$${maximum}`;
  return `$${minimum}–$${maximum}`;
}
