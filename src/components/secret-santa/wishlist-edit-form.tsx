"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { useWishlistEditContext } from "@/components/secret-santa/wishlist-edit-section";
import { Button } from "@/components/ui/button";
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
  const [pending, startTransition] = useTransition();
  const { saving, setSaving, onSaved } = useWishlistEditContext();
  const router = useRouter();
  const isSaving = saving || pending;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const form = new FormData(event.currentTarget);
    setError("");
    setSaving(true);
    startTransition(async () => {
      try {
        await prepareWishlistImage(form, { initialImageUrl });
        await updateWishlistItem(form);
        router.refresh();
        onSaved();
      } catch (error) {
        const message = error instanceof Error ? error.message : "We couldn’t save your changes. Your edits are still here; please try again.";
        setError(message);
        toast.error("Could not save your changes. Please try again.");
      } finally {
        setSaving(false);
      }
    });
  }

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isSaving ? "Saving your gift changes…" : ""}
      </span>
      <form onSubmit={save} aria-busy={isSaving} className="mt-3 grid gap-3">
        {children}
        <div className="grid justify-items-start gap-2">
          <Button type="submit" size="sm" disabled={isSaving} className="min-w-36">
            {isSaving ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Saving…</> : "Save changes"}
          </Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      </form>
    </>
  );
}
