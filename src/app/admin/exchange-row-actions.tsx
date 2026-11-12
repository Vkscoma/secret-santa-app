"use client";

import { useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { deleteExchange } from "@/lib/actions/admin";

export function ExchangeRowActions({ exchangeId, exchangeName, year, canDelete }: {
  exchangeId: string;
  exchangeName: string;
  year: number;
  canDelete: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href={`/admin/exchanges/${exchangeId}`}>View</Link>
      </Button>
      {canDelete && <form ref={formRef} action={deleteExchange}>
        <input type="hidden" name="exchangeId" value={exchangeId} />
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          onClick={(event) => {
            if (!window.confirm(`Permanently delete “${exchangeName}” (${year})? All exchange data will be permanently removed. User accounts and their other exchange data will be preserved.`)) {
              event.preventDefault();
            }
          }}
        >Delete</Button>
      </form>}
    </div>
  );
}
