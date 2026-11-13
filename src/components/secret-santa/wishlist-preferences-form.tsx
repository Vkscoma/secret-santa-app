"use client";

import { useState } from "react";
import { Heart, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveWishlistPreferences } from "@/lib/actions/wishlists";

export function WishlistPreferencesForm({ exchangeId, likes, surpriseMe }: {
  exchangeId: string;
  likes: string;
  surpriseMe: boolean;
}) {
  const [saving, setSaving] = useState(false);

  async function handleSubmit(formData: FormData) {
    if (saving) return;
    setSaving(true);
    try {
      await saveWishlistPreferences(formData);
      toast.success("Your preferences have been saved.");
    } catch {
      toast.error("Could not save your preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form action={handleSubmit} className="grid gap-3">
      <input type="hidden" name="exchangeId" value={exchangeId} />
      <label className="grid gap-1.5 text-sm font-medium">Things I like
        <textarea name="likes" maxLength={1000} rows={2} defaultValue={likes} placeholder="Cozy evenings, hiking, favorite flavors…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="surpriseMe" defaultChecked={surpriseMe} className="size-4 accent-primary" /><Heart className="size-4 text-primary" /> Surprise me</label>
        <Button type="submit" variant="outline" disabled={saving} aria-live="polite">
          {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {saving ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}
