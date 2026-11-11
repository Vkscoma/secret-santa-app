"use client";

import { useRef, useState } from "react";
import { WishlistImagePicker } from "@/components/secret-santa/wishlist-image-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createWishlistItem } from "@/lib/actions/wishlists";

type Props = { exchangeId: string };

export function WishlistComposer({ exchangeId }: Props) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [storeName, setStoreName] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [notes, setNotes] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewedWithoutImage, setPreviewedWithoutImage] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("");
  const currentUrl = useRef("");
  const currentNotes = useRef("");
  const autoDescription = useRef("");

  async function previewLink() {
    setPreviewMessage("");
    if (!url.trim()) {
      setPreviewMessage("Paste a product link first.");
      return;
    }
    setPreviewing(true);
    const requestedUrl = url;
    try {
      const response = await fetch("/api/unfurl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exchangeId, url }),
      });
      const result = await response.json() as {
        metadata?: { title: string | null; imageUrl: string | null; siteName: string | null; price: string | null; currency: string | null; description: string | null; variant: string | null; confidence: "high" | "medium" | "low"; reason: string | null };
        error?: string;
      };
      if (!response.ok) {
        setPreviewMessage(response.status === 400 ? result.error || "Check that the URL is valid." : "Check these details manually; the link preview service could not read this page.");
        return;
      }
      if (currentUrl.current !== requestedUrl) return;
      setPreviewedWithoutImage(!result.metadata?.imageUrl);
      if (result.metadata?.title) setTitle(result.metadata.title);
      if (result.metadata?.imageUrl) setImageUrl(result.metadata.imageUrl);
      if (result.metadata?.siteName) setStoreName(result.metadata.siteName);
      if (result.metadata?.price && (!result.metadata.currency || result.metadata.currency === "USD")) {
        const parsedPrice = Number.parseFloat(result.metadata.price.replace(/[^\d.]/g, ""));
        if (Number.isFinite(parsedPrice) && parsedPrice >= 0 && parsedPrice <= 1_000_000) {
          const wholePrice = String(Math.round(parsedPrice));
          setPriceMin(wholePrice);
          setPriceMax(wholePrice);
        }
      }
      const details = [result.metadata?.variant, result.metadata?.description].filter(Boolean).join(" · ").slice(0, 1000);
      if (details && (!currentNotes.current.trim() || currentNotes.current.trim() === autoDescription.current)) {
        autoDescription.current = details;
        currentNotes.current = details;
        setNotes(details);
      }
      const confidence = result.metadata?.confidence ?? "low";
      setPreviewMessage(confidence === "high" ? "Product details added. You can edit anything before saving." : "Check these details. The store provided limited product information.");
    } catch {
      setPreviewMessage("Check these details manually; the link preview service could not read this page.");
    } finally {
      setPreviewing(false);
    }
  }

  function updateUrl(value: string) {
    currentUrl.current = value;
    setUrl(value);
    setImageUrl("");
    setTitle("");
    setStoreName("");
    setPriceMin("");
    setPriceMax("");
    if (currentNotes.current.trim() === autoDescription.current) {
      currentNotes.current = "";
      setNotes("");
    }
    autoDescription.current = "";
    setPreviewMessage("");
    setPreviewedWithoutImage(false);
  }

  return (
    <Card className="space-y-4 border-border/80 p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-xl font-bold">Add a wish</h2>
        <p className="mt-1 text-sm text-muted-foreground">Paste a product link or add a gift idea by hand.</p>
      </div>
      <form action={createWishlistItem} className="grid gap-4">
        <input type="hidden" name="exchangeId" value={exchangeId} />
        <label className="grid gap-1.5 text-sm font-medium">Product link
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input name="url" type="url" value={url} onChange={(event) => updateUrl(event.target.value)} placeholder="https://shop.example.com/item" className="min-w-0 flex-1" />
            <Button type="button" variant="outline" onClick={previewLink} disabled={previewing}>{previewing ? "Checking link…" : "Preview link"}</Button>
          </div>
        </label>
        {previewedWithoutImage && url && !imageUrl && <p className="text-sm text-muted-foreground">Couldn't get a picture from this store. Add a screenshot?</p>}
        <WishlistImagePicker exchangeId={exchangeId} imageUrl={imageUrl} onChange={setImageUrl} />
        <label className="grid gap-1.5 text-sm font-medium">Gift title
          <Input name="title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A title your Santa will recognize" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">Store or maker
            <Input name="storeName" maxLength={100} value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Optional" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Priority
            <select name="priority" defaultValue="would_like" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="most_wanted">Most wanted</option>
              <option value="would_like">Would like</option>
              <option value="nice_to_have">Nice to have</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">Price from ($)<Input name="priceMin" type="number" inputMode="numeric" min="0" max="1000000" step="1" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} placeholder="Optional" /></label>
          <label className="grid gap-1.5 text-sm font-medium">Price up to ($)<Input name="priceMax" type="number" inputMode="numeric" min="0" max="1000000" step="1" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} placeholder="Optional" /></label>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">Notes
          <Textarea name="notes" maxLength={1000} rows={3} value={notes} onChange={(event) => { currentNotes.current = event.target.value; setNotes(event.target.value); }} placeholder="Product details are filled from the link when available." />
        </label>
        {previewMessage && <p role="status" className="text-sm text-muted-foreground">{previewMessage}</p>}
        <Button type="submit" className="w-full sm:w-fit">Add to my list</Button>
      </form>
    </Card>
  );
}
