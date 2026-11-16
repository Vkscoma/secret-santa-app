import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Max widths used by app pages. Mapped to static class names so Tailwind can
 * see every utility at build time.
 */
const maxWidthClasses = {
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
} as const;

export type PageContainerMaxWidth = keyof typeof maxWidthClasses;

type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  maxWidth?: PageContainerMaxWidth;
};

/**
 * Standard centered page wrapper. `w-full min-w-0` lets it shrink inside the
 * flex `<main>`, so long unbreakable content (emails, URLs) cannot widen the
 * page past the viewport. Pass spacing overrides through `className`.
 */
export function PageContainer({ maxWidth = "6xl", className, ...props }: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full min-w-0 px-4 py-8 sm:px-6 sm:py-12",
        maxWidthClasses[maxWidth],
        className,
      )}
      {...props}
    />
  );
}
