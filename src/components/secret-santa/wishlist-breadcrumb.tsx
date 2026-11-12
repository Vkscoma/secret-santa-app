import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type WishlistBreadcrumbItem = { label: string; href?: string };

export function WishlistBreadcrumb({ items }: { items: WishlistBreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 hidden sm:block">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="size-3.5 text-muted-foreground/70" aria-hidden="true" />}
              {item.href && !current
                ? <Link href={item.href} title={item.label} className="max-w-[min(58vw,18rem)] truncate rounded-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-none" aria-label={item.label === "Home" ? "Home" : undefined}>{item.label}</Link>
                : <span aria-current="page" title={item.label} className="max-w-[min(58vw,18rem)] truncate font-semibold text-foreground sm:max-w-none">{item.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
