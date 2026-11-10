import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 py-5 text-center text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
        <p>Made for the people you love, and the little surprises in between.</p>
        <div className="flex gap-4"><Link href="/preview/wishlists" className="hover:text-foreground">Preview wish lists</Link><Link href="/preview/home" className="hover:text-foreground">Preview Home</Link></div>
      </div>
    </footer>
  );
}
