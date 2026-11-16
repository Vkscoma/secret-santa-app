import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border-0 px-2 py-0.5 text-[11px] font-medium",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        secondary: "bg-secondary/35 text-secondary-foreground dark:bg-secondary/20",
        destructive: "bg-destructive/10 text-destructive-text",
        outline: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }