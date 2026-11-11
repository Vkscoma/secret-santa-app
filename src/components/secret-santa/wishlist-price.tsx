type Props = { minimum: number | null; maximum: number | null; previewPrice: string | null; previewCurrency: string | null; fetchedAt: Date | null };

export function WishlistPrice({ minimum, maximum, previewPrice, previewCurrency, fetchedAt }: Props) {
  let label: string | null = null;
  if (minimum !== null && maximum !== null) label = minimum === maximum ? `$${minimum}` : `$${minimum}–$${maximum}`;
  else if (minimum !== null) label = `From $${minimum}`;
  else if (maximum !== null) label = `Up to $${maximum}`;
  else if (previewPrice && previewCurrency && fetchedAt) {
    try { label = new Intl.NumberFormat("en-US", { style: "currency", currency: previewCurrency, maximumFractionDigits: 20 }).format(Number(previewPrice)); }
    catch { label = `${previewCurrency} ${previewPrice}`; }
  }
  if (!label) return null;
  const checked = minimum === null && maximum === null && fetchedAt ? `Price checked ${fetchedAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC` : undefined;
  return <span className="rounded-full border border-border px-2.5 py-1" title={checked}>{label}{checked && <span className="sr-only"> · {checked}</span>}</span>;
}
