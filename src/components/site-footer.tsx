"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteFooter() {
  const pathname = usePathname();
  const showPreviewLinks = pathname.startsWith("/preview/");
  return (
    <footer className="border-border/70 dark:border-border/80 text-muted-foreground border-t py-5 text-center text-xs">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
        <p>Made for the people you love, and the little surprises in between.</p>
        {showPreviewLinks && (
          <div className="flex gap-4">
            <Link href="/preview/wishlists" className="hover:text-foreground">
              Preview wish lists
            </Link>
            <Link href="/preview/home" className="hover:text-foreground">
              Preview Home
            </Link>
          </div>
        )}
      </div>
    </footer>
  );
}
