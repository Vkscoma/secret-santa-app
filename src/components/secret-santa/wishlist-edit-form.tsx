"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { updateWishlistItem } from "@/lib/actions/wishlists";
import { prepareWishlistImage } from "@/lib/prepare-wishlist-image";

export function WishlistTitleInput({ initialTitle }: { initialTitle: string }) {
  const [title, setTitle] = useState(initialTitle);
  const userHasEdited = useRef(false);

  useEffect(() => {
    if (!userHasEdited.current) setTitle(initialTitle);
  }, [initialTitle]);

  return (
    <label className="grid gap-1 text-sm font-medium">
      Title
      <input
        name="title"
        required
        maxLength={200}
        value={title}
        onChange={(event) => {
          userHasEdited.current = true;
          setTitle(event.target.value);
        }}
        className="h-10 rounded-md border border-input bg-background px-3"
      />
    </label>
  );
}

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
