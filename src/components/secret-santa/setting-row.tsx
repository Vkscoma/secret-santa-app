import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SettingRowProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Optional icon or status dot shown before the text. */
  leading?: ReactNode;
  /** Optional chip or control shown after the text. */
  trailing?: ReactNode;
  className?: string;
};

/**
 * Bordered "label + description | chip/control" row. The text group can
 * shrink (`min-w-0`) and has a 12rem flex basis, so on narrow screens the
 * trailing chip wraps below the text instead of widening the row.
 */
export function SettingRow({ title, description, leading, trailing, className }: SettingRowProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border p-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-[1_1_12rem] items-start gap-3">
        {leading}
        <div className="min-w-0 space-y-1 wrap-break-word">
          <p className="font-medium">{title}</p>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
