import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

export function ParticipantCard({
  exchangeId,
  participant,
}: {
  exchangeId: string;
  participant: { userId: string; firstName: string; itemCount: number; surpriseMe: boolean };
}) {
  return (
    <Link
      href={`/wishlists/${exchangeId}/people/${participant.userId}`}
      className="group focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      aria-label={`View ${participant.firstName}’s wishlist, ${participant.itemCount} ${participant.itemCount === 1 ? "gift idea" : "gift ideas"}`}
    >
      <Card className="group-hover:bg-muted/60 flex h-full min-h-28 items-center justify-between gap-4 p-4 transition-colors sm:p-5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold">{participant.firstName}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {participant.itemCount} {participant.itemCount === 1 ? "gift idea" : "gift ideas"}
          </p>
          {participant.surpriseMe && (
            <span className="text-muted-foreground mt-2 inline-flex items-center gap-1 text-xs">
              <Sparkles className="size-3.5" aria-hidden="true" /> They’re open to surprises
            </span>
          )}
        </div>
        <ArrowRight
          className="text-muted-foreground size-5 shrink-0 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Card>
    </Link>
  );
}
