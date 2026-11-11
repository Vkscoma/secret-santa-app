"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { WishlistImagePicker } from "@/components/secret-santa/wishlist-image-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createWishlistItem } from "@/lib/actions/wishlists";

type Props = {
  exchangeId: string;
  initialUrl?: string;
  initialTitle?: string;
  initialImageUrl?: string;
  initialPrice?: string;
  initialStoreName?: string;
};
type MetadataField = "title" | "imageUrl" | "storeName" | "priceMin" | "priceMax";

function firstUrl(value: string): string | null {
  const candidate = value.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.;!?]+$/, "");
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function WishlistComposer({ exchangeId, initialUrl = "", initialTitle = "", initialImageUrl = "", initialPrice = "", initialStoreName = "" }: Props) {
  const [draft, setDraft] = useState(initialUrl || initialTitle);
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState(initialTitle);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [storeName, setStoreName] = useState(initialStoreName);
  const [priceMin, setPriceMin] = useState(initialPrice);
  const [priceMax, setPriceMax] = useState(initialPrice);
  const [notes, setNotes] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewedWithoutImage, setPreviewedWithoutImage] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("");
  const [pasting, setPasting] = useState(false);
  const currentUrl = useRef(initialUrl);
  const previewRequest = useRef(0);
  const currentNotes = useRef("");
  const autoDescription = useRef("");
  const touched = useRef<Record<MetadataField | "notes", boolean>>({
    title: Boolean(initialTitle),
    imageUrl: Boolean(initialImageUrl),
    storeName: Boolean(initialStoreName),
    priceMin: Boolean(initialPrice),
    priceMax: Boolean(initialPrice),
    notes: false,
  });

  const previewLink = useCallback(async (requestedUrl: string) => {
    if (!requestedUrl.trim()) return;
    const requestId = ++previewRequest.current;
    setPreviewMessage("");
    setPreviewing(true);
    try {
      const response = await fetch("/api/unfurl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exchangeId, url: requestedUrl }),
      });
      const result = await response.json() as {
        metadata?: { title: string | null; imageUrl: string | null; siteName: string | null; price: string | null; currency: string | null; description: string | null; variant: string | null; confidence: "high" | "medium" | "low"; reason: string | null };
        error?: string;
      };
      if (!response.ok) {
        if (currentUrl.current === requestedUrl) {
          setPreviewMessage(response.status === 400 ? result.error || "Check that the URL is valid." : "Check these details manually; the link preview service could not read this page.");
        }
        return;
      }
      if (currentUrl.current !== requestedUrl) return;
      const metadata = result.metadata;
      setPreviewedWithoutImage(!metadata?.imageUrl);
      if (metadata?.title && !touched.current.title) setTitle(metadata.title);
      if (metadata?.imageUrl && !touched.current.imageUrl) setImageUrl(metadata.imageUrl);
      if (metadata?.siteName && !touched.current.storeName) setStoreName(metadata.siteName);
      if (metadata?.price && (!metadata.currency || metadata.currency === "USD")) {
        const parsedPrice = Number.parseFloat(metadata.price.replace(/[^\d.]/g, ""));
        if (Number.isFinite(parsedPrice) && parsedPrice >= 0 && parsedPrice <= 1_000_000) {
          const wholePrice = String(Math.round(parsedPrice));
          if (!touched.current.priceMin) setPriceMin(wholePrice);
          if (!touched.current.priceMax) setPriceMax(wholePrice);
        }
      }
      const details = [metadata?.variant, metadata?.description].filter(Boolean).join(" · ").slice(0, 1000);
      if (details && !touched.current.notes && (!currentNotes.current.trim() || currentNotes.current.trim() === autoDescription.current)) {
        autoDescription.current = details;
        currentNotes.current = details;
        setNotes(details);
      }
      const confidence = metadata?.confidence ?? "low";
      setPreviewMessage(confidence === "high" ? "Product details added. You can edit anything before saving." : "Check these details. The store provided limited product information.");
    } catch {
      if (currentUrl.current === requestedUrl) setPreviewMessage("Check these details manually; the link preview service could not read this page.");
    } finally {
      if (previewRequest.current === requestId) setPreviewing(false);
    }
  }, [exchangeId]);

  function updateDraft(value: string) {
    setDraft(value);
    const detectedUrl = firstUrl(value);
    if (detectedUrl) {
      if (currentUrl.current !== detectedUrl) {
        currentUrl.current = detectedUrl;
        setUrl(detectedUrl);
        setPreviewedWithoutImage(false);
        setPreviewMessage("");
      }
      return;
    }
    currentUrl.current = "";
    previewRequest.current += 1;
    setPreviewing(false);
    setUrl("");
    touched.current.title = true;
    setTitle(value);
    setPreviewMessage("");
    setPreviewedWithoutImage(false);
  }

  useEffect(() => {
    if (!url) return;
    const timer = window.setTimeout(() => void previewLink(url), 650);
    return () => window.clearTimeout(timer);
  }, [previewLink, url]);

  async function pasteFromClipboard() {
    if (!navigator.clipboard?.readText) {
      setPreviewMessage("Paste the link into the field, then it will be checked automatically.");
      return;
    }
    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPreviewMessage("Your clipboard is empty.");
        return;
      }
      updateDraft(text.trim());
    } catch {
      setPreviewMessage("Your browser could not read the clipboard. Paste the link into the field instead.");
    } finally {
      setPasting(false);
    }
  }

  return (
    <Card className="space-y-4 border-border/80 p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-xl font-bold">Add a wish</h2>
        <p className="mt-1 text-sm text-muted-foreground">Paste a product link or type a gift idea. We’ll fill in product details when we can.</p>
      </div>
      <form action={createWishlistItem} className="grid gap-4">
        <input type="hidden" name="exchangeId" value={exchangeId} />
        <input type="hidden" name="url" value={url} />
        <label htmlFor="wishlist-wish-draft" className="sr-only">Paste a link or type a wish</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="wishlist-wish-draft"
            value={draft}
            onChange={(event) => updateDraft(event.target.value)}
            placeholder="Paste a link or type a wish"
            autoComplete="off"
            className="min-h-12 min-w-0 flex-1 text-base"
          />
          <Button type="button" variant="outline" onClick={pasteFromClipboard} disabled={pasting || previewing} className="min-h-12 shrink-0">
            <ClipboardPaste className="size-4" />{pasting ? "Pasting…" : "Paste"}
          </Button>
        </div>
        {previewing && <p role="status" className="text-sm text-muted-foreground">Checking the product link…</p>}
        {previewedWithoutImage && url && !imageUrl && <p className="text-sm text-muted-foreground">Couldn’t get a picture from this store. Add a screenshot?</p>}
        <WishlistImagePicker exchangeId={exchangeId} imageUrl={imageUrl} onChange={(value) => { touched.current.imageUrl = true; setImageUrl(value); }} />
        <details className="group rounded-lg border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">Details</summary>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">Gift title
              <Input name="title" required maxLength={200} value={title} onChange={(event) => { touched.current.title = true; setTitle(event.target.value); }} placeholder="A title your Santa will recognize" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">Store or maker
                <Input name="storeName" maxLength={100} value={storeName} onChange={(event) => { touched.current.storeName = true; setStoreName(event.target.value); }} placeholder="Optional" />
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
              <label className="grid gap-1.5 text-sm font-medium">Price from ($)<Input name="priceMin" type="number" inputMode="numeric" min="0" max="1000000" step="1" value={priceMin} onChange={(event) => { touched.current.priceMin = true; setPriceMin(event.target.value); }} placeholder="Optional" /></label>
              <label className="grid gap-1.5 text-sm font-medium">Price up to ($)<Input name="priceMax" type="number" inputMode="numeric" min="0" max="1000000" step="1" value={priceMax} onChange={(event) => { touched.current.priceMax = true; setPriceMax(event.target.value); }} placeholder="Optional" /></label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">Notes
              <Textarea name="notes" maxLength={1000} rows={3} value={notes} onChange={(event) => { touched.current.notes = true; currentNotes.current = event.target.value; setNotes(event.target.value); }} placeholder="Product details are filled from the link when available." />
            </label>
          </div>
        </details>
        {previewMessage && <p role="status" className="text-sm text-muted-foreground">{previewMessage}</p>}
        <Button type="submit" className="min-h-11 w-full sm:w-fit">Add to my list</Button>
      </form>
    </Card>
  );
}
