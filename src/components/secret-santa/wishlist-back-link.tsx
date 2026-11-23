import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WishlistBackLink({
  href,
  children = "Back to My Wishlists",
  className = "",
}: {
  href: string;
  children?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Button asChild variant="neutral" className="min-h-11 w-full justify-start sm:w-fit">
        <Link href={href}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {children}
        </Link>
      </Button>
    </div>
  );
}
