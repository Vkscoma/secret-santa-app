import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const EXCHANGE_STEPS = [
  "Created",
  "People invited",
  "Wishlists in progress",
  "Names drawn",
  "Revealed / gift day",
] as const;

export type ExchangeStep = 0 | 1 | 2 | 3 | 4;

type ExchangeStepTrackerProps = {
  currentStep: ExchangeStep;
  className?: string;
};

/** Shared progress indicator for the admin exchange list and exchange detail. */
export function ExchangeStepTracker({ currentStep, className }: ExchangeStepTrackerProps) {
  return (
    <ol
      aria-label={`Exchange progress: ${EXCHANGE_STEPS[currentStep]}`}
      className={cn("grid grid-cols-5 gap-1.5", className)}
    >
      {EXCHANGE_STEPS.map((label, index) => {
        const stepIndex = index as ExchangeStep;
        const complete = stepIndex < currentStep;
        const current = stepIndex === currentStep;

        return (
          <li key={label} aria-current={current ? "step" : undefined} className="min-w-0 text-center">
            <span
              aria-hidden="true"
              className={cn(
                "mx-auto mb-1.5 grid size-5 place-items-center rounded-full border text-[10px] font-bold",
                complete && "border-primary bg-primary text-primary-foreground",
                current && "border-primary bg-primary/10 text-primary ring-1 ring-primary/25",
                !complete && !current && "border-border bg-muted text-muted-foreground",
              )}
            >
              {complete ? <Check className="size-3" /> : index + 1}
            </span>
            <span
              className={cn(
                "block text-[11px] leading-tight sm:text-xs",
                current ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
