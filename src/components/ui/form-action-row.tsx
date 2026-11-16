import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FormActionRowProps = {
  primary: ReactNode;
  secondary?: ReactNode;
  destructive?: ReactNode;
  className?: string;
};

export function FormActionRow({ primary, secondary, destructive, className }: FormActionRowProps) {
  return (
    <div className={cn("grid gap-2 sm:flex sm:items-center sm:justify-between", className)}>
      {destructive && <div className="order-2 sm:order-1">{destructive}</div>}
      <div className="order-1 grid gap-2 sm:order-2 sm:ml-auto sm:flex sm:items-center">
        <div className="order-1 sm:order-2">{primary}</div>
        {secondary && <div className="order-2 sm:order-1">{secondary}</div>}
      </div>
    </div>
  );
}
