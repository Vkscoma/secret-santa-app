import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** The mobile add FAB is the intentional filled-cranberry exception documented in DESIGN.md. */
export const MobileAddWishButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(function MobileAddWishButton({ className, ...props }, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      aria-label="Add a wish"
      data-button-system-exception="mobile-fab"
      className={cn(
        "fixed right-5 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-20 grid size-14 place-items-center rounded-full bg-cranberry text-pine-foreground shadow-lg transition-colors hover:bg-cranberry/95 active:bg-cranberry/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 lg:hidden",
        className,
      )}
    >
      <Plus className="size-6" aria-hidden="true" />
    </button>
  );
});

MobileAddWishButton.displayName = "MobileAddWishButton";
