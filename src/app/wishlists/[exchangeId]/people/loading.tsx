import { PageContainer } from "@/components/secret-santa/page-container";
import { Card } from "@/components/ui/card";

export default function BrowseWishlistsLoading() {
  return (
    <PageContainer
      maxWidth="5xl"
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading wishlists"
    >
      <div className="bg-muted h-4 w-48 animate-pulse rounded" />
      <div className="space-y-2">
        <div className="bg-muted h-9 w-64 animate-pulse rounded" />
        <div className="bg-muted h-5 w-full max-w-xl animate-pulse rounded" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index} className="h-28 animate-pulse p-4">
            <div className="bg-muted h-5 w-32 rounded" />
            <div className="bg-muted mt-3 h-4 w-24 rounded" />
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
