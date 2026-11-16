import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ExchangeRowActions({ exchangeId }: {
  exchangeId: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button asChild size="sm" variant="neutral">
        <Link href={`/admin/exchanges/${exchangeId}`}>View</Link>
      </Button>
    </div>
  );
}
