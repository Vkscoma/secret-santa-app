import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Participant = { userId: string; firstName: string; itemCount: number };

function participantInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}\p{N}]/gu, "").charAt(0))
      .filter(Boolean)
      .join("") || "?"
  );
}

export function EveryoneWishlistsCard({
  exchangeId,
  participants,
}: {
  exchangeId: string;
  participants: Participant[];
}) {
  const visibleParticipants = participants.slice(0, 5);
  const additionalCount = Math.max(0, participants.length - visibleParticipants.length);
  const giftIdeaCount = participants.reduce((total, participant) => total + participant.itemCount, 0);

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex shrink-0 items-center pl-2" aria-hidden="true">
          {visibleParticipants.map((participant, index) => (
            <span
              key={participant.userId}
              className={`bg-secondary text-secondary-foreground border-card relative -ml-2 inline-flex size-9 items-center justify-center rounded-full border-2 text-xs font-bold ${
                index % 3 === 1 ? "bg-accent text-accent-foreground" : ""
              } ${index % 3 === 2 ? "bg-muted text-foreground" : ""}`}
            >
              {participantInitials(participant.firstName).toLocaleUpperCase()}
            </span>
          ))}
          {additionalCount > 0 && (
            <span className="bg-muted text-muted-foreground border-card relative -ml-2 inline-flex size-9 items-center justify-center rounded-full border-2 text-xs font-semibold">
              +{additionalCount}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="font-bold">Everyone’s wishlists</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {participants.length} {participants.length === 1 ? "person" : "people"} · {giftIdeaCount}{" "}
            {giftIdeaCount === 1 ? "gift idea" : "gift ideas"}
          </p>
        </div>
      </div>
      <Button asChild variant="neutral" className="min-h-11 w-full shrink-0 sm:w-auto">
        <Link href={`/wishlists/${exchangeId}/people`}>
          Browse wishlists <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </Card>
  );
}
