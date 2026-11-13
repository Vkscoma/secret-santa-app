"use client";

import { useState } from "react";
import { Check, Heart, LoaderCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveWishlistPreferences } from "@/lib/actions/wishlists";

export function WishlistPreferencesForm({ exchangeId, likes, surpriseMe }: {
  exchangeId: string;
  likes: string;
  surpriseMe: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!likes && !surpriseMe);
  const [savedLikes, setSavedLikes] = useState(likes);
  const [savedSurpriseMe, setSavedSurpriseMe] = useState(surpriseMe);

  async function handleSubmit(formData: FormData) {
    if (saving) return;
    setSaving(true);
    try {
      await saveWishlistPreferences(formData);
      setSavedLikes(String(formData.get("likes") ?? "").trim());
      setSavedSurpriseMe(formData.get("surpriseMe") === "on");
      setEditing(false);
      toast.success("Your preferences have been saved.");
    } catch {
      toast.error("Could not save your preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3">
      {!editing ? <div className="rounded-lg border border-border/70 bg-background/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            {savedLikes ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{savedLikes}</p> : <p className="text-sm italic text-muted-foreground">No likes added yet.</p>}
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Heart className="size-4 text-primary" aria-hidden="true" />{savedSurpriseMe ? "Open to surprises" : "No surprise preference"}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden="true" /> Edit</Button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3.5 text-primary" aria-hidden="true" /> Saved preferences</p>
      </div> : <form action={handleSubmit} className="grid gap-3">
      <input type="hidden" name="exchangeId" value={exchangeId} />
      <label className="grid gap-1.5 text-sm font-medium">Things I like
        <textarea name="likes" maxLength={1000} rows={2} defaultValue={savedLikes} placeholder="Cozy evenings, hiking, favorite flavors…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="surpriseMe" defaultChecked={savedSurpriseMe} className="size-4 accent-primary" /><Heart className="size-4 text-primary" /> Surprise me</label>
        <div className="flex gap-2">
          {(savedLikes || savedSurpriseMe) && <Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>}
          <Button type="submit" disabled={saving} aria-live="polite">
            {saving ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Saving…</> : "Save preferences"}
          </Button>
        </div>
      </div>
      </form>}
    </div>
  );
}
