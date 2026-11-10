import Link from "next/link";
import { Gift } from "lucide-react";
import { AppMenu } from "@/components/secret-santa/app-menu";

export function SiteHeader() {
  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-foreground">Skip to main content</a>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-card/90 shadow-sm backdrop-blur-xl" role="banner">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6" aria-label="Main navigation">
          <Link href="/" className="group flex items-center gap-2.5" aria-label="Secret Santa home">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:-rotate-6"><Gift className="size-5" aria-hidden="true" /></span>
            <span className="text-lg font-extrabold tracking-tight text-foreground sm:text-xl">Secret <span className="text-primary">Santa</span></span>
          </Link>
          <AppMenu />
        </nav>
      </header>
    </>
  );
}
