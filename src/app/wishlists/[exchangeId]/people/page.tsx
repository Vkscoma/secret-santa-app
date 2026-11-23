import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PageHeading } from "@/components/secret-santa/components";
import { PageContainer } from "@/components/secret-santa/page-container";
import { ParticipantCard } from "@/components/secret-santa/participant-card";
import { Card } from "@/components/ui/card";
import { requireExchangeMember } from "@/lib/authz";
import { db } from "@/lib/db";
import { exchanges } from "@/lib/schema";
import { listBrowsableParticipants } from "@/lib/wishlist-browse";

type PageProps = { params: Promise<{ exchangeId: string }> };

export default async function BrowseWishlistsPage({ params }: PageProps) {
  const { exchangeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(exchangeId)) notFound();
  const session = await requireExchangeMember(exchangeId);
  const [exchange] = await db
    .select({ id: exchanges.id, name: exchanges.name, year: exchanges.year })
    .from(exchanges)
    .where(eq(exchanges.id, exchangeId))
    .limit(1);
  if (!exchange) notFound();
  const participants = await listBrowsableParticipants(exchangeId, session.user.id);

  return (
    <PageContainer maxWidth="5xl" className="space-y-6">
      <PageHeading
        title="Browse wishlists"
        description="See what everyone would like. Pick a gift so others know it’s taken."
      />
      {participants.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {participants.map((participant) => (
            <ParticipantCard
              key={participant.userId}
              exchangeId={exchangeId}
              participant={participant}
            />
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center">
          <p className="font-semibold">You’re the only person in this group so far.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            More wishlists will show here when others join.
          </p>
        </Card>
      )}
    </PageContainer>
  );
}
