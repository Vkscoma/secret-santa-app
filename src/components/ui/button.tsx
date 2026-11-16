import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-transparent text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        affirmative:
          "border-2 border-primary bg-transparent font-semibold text-affirmative-text shadow-none hover:bg-primary/10 active:bg-primary/15",
        neutral:
          "border border-neutral-border bg-transparent font-normal text-foreground shadow-none hover:bg-muted active:bg-muted",
        destructive:
          "border border-destructive-text bg-transparent text-destructive-text shadow-none hover:bg-destructive/10 active:bg-destructive/15",
        ghost:
          "border border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80",
        "neutral-inverse":
          "border border-neutral-panel-border bg-transparent text-pine-foreground shadow-none hover:border-pine-foreground hover:bg-pine-foreground/10 active:border-pine-foreground active:bg-pine-foreground/15",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      {...props}
      disabled={asChild ? undefined : disabled}
      aria-disabled={asChild && disabled ? true : props["aria-disabled"]}
      tabIndex={asChild && disabled ? -1 : props.tabIndex}
      data-slot="button"
      data-variant={variant ?? "neutral"}
      className={cn(buttonVariants({ variant, size, className }))}
    />
  )
}

export { Button, buttonVariants }
