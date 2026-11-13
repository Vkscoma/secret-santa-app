"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { updateWishlistItem } from "@/lib/actions/wishlists";
import { prepareWishlistImage } from "@/lib/prepare-wishlist-image";

export function WishlistEditForm({ children, initialImageUrl }: { children: ReactNode; initialImageUrl: string }) {
  const [error, setError] = useState("");
  const router = useRouter();
  async function save(form: FormData) {
    setError("");
    try {
      await prepareWishlistImage(form, { initialImageUrl });
      await updateWishlistItem(form);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save your changes.");
    }
  }
  return <form action={save} className="mt-3 grid gap-3">
    {children}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </form>;
}
