import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type WishlistBreadcrumbItem = { label: string; href?: string };

export function WishlistBreadcrumb({
  items,
  compact = false,
}: {
  items: WishlistBreadcrumbItem[];
  compact?: boolean;
}) {
  return (
    <nav aria-label="Breadcrumb" className={compact ? "mb-0 min-w-0" : "mb-5 hidden sm:block"}>
      <ol
        className={
          compact
            ? "flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden text-sm"
            : "flex flex-wrap items-center gap-1.5 text-sm"
        }
      >
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${index}`}
              className={`inline-flex items-center gap-1.5 ${compact ? (current ? "min-w-0 flex-1" : "shrink-0") : ""}`}
            >
              {index > 0 && (
                <ChevronRight className="text-muted-foreground/70 size-3.5" aria-hidden="true" />
              )}
              {item.href && !current ? (
                <Link
                  href={item.href}
                  title={item.label}
                  className={`text-muted-foreground hover:text-foreground focus-visible:ring-ring truncate rounded-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none ${compact ? "min-w-0" : "max-w-[min(58vw,18rem)] sm:max-w-none"}`}
                  aria-label={item.label === "Home" ? "Home" : undefined}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current="page"
                  title={item.label}
                  className={`text-foreground truncate font-semibold ${compact ? "min-w-0" : "max-w-[min(58vw,18rem)] sm:max-w-none"}`}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
