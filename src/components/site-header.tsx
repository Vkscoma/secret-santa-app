import Link from "next/link";
import { Gift } from "lucide-react";
import { AppMenu } from "@/components/secret-santa/app-menu";

export function SiteHeader() {
  return (
    <>
      <a
        href="#main-content"
        className="focus:bg-background focus:text-foreground sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:border focus:px-4 focus:py-2"
      >
        Skip to main content
      </a>
      <header
        className="safe-top border-border bg-card sticky top-0 z-50 border-b shadow-sm"
        role="banner"
      >
        <nav
          className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6"
          aria-label="Main navigation"
        >
          <Link href="/" className="group flex items-center gap-2.5" aria-label="Secret Santa home">
            <span className="text-cranberry grid size-9 place-items-center rounded-xl shadow-sm transition-transform group-hover:-rotate-6">
              <Gift className="size-5" aria-hidden="true" />
            </span>
            <span className="text-foreground text-lg font-extrabold tracking-tight sm:text-xl">
              Secret <span className="text-cranberry">Santa</span>
            </span>
          </Link>
          <AppMenu />
        </nav>
      </header>
    </>
  );
}
