"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste } from "lucide-react";
import { WishlistImagePicker } from "@/components/secret-santa/wishlist-image-picker";
import { useWishlistPaste } from "@/components/secret-santa/wishlist-paste-provider";
import { createPasteSession, singlePastedUrl } from "@/components/secret-santa/wishlist-paste-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createWishlistItem, createPastedWishlistItem } from "@/lib/actions/wishlists";

type Props = { exchangeId: string; initialUrl?: string; initialTitle?: string; initialImageUrl?: string; initialPrice?: string; initialStoreName?: string };

export function WishlistComposer({ exchangeId, initialUrl = "", initialTitle = "", initialImageUrl = "", initialPrice = "", initialStoreName = "" }: Props) {
  const router = useRouter();
  const pasteContext = useWishlistPaste();
  const session = useRef(createPasteSession(() => crypto.randomUUID()));
  const [draft, setDraft] = useState(initialUrl || initialTitle);
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState(initialTitle);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [storeName, setStoreName] = useState(initialStoreName);
  const [priceMin, setPriceMin] = useState(initialPrice);
  const [priceMax, setPriceMax] = useState(initialPrice);
  const [notes, setNotes] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("");
  const [pasting, setPasting] = useState(false);
  const [savedUrl, setSavedUrl] = useState("");
  const activeItemId = useRef<string | null>(null);

  function resetDraft() {
    if (activeItemId.current && !savedUrl) pasteContext?.removePending(activeItemId.current);
    activeItemId.current = null; session.current.reset(); setDraft(""); setUrl(""); setTitle(""); setImageUrl(""); setStoreName(""); setPriceMin(""); setPriceMax(""); setNotes(""); setSavedUrl(""); setPreviewMessage("");
  }

  async function savePasted(link: string, details?: FormData) {
    try {
      await session.current.run(link, async ({ itemId, url: originalUrl }) => {
        activeItemId.current = itemId;
        setPreviewing(true);
        pasteContext?.setPending({ itemId, url: originalUrl });
        setPreviewMessage("Saving your wish…");
        try {
          const result = await createPastedWishlistItem({ exchangeId, itemId, url: originalUrl, ...(details ? { details: {
            title: String(details.get("title") ?? ""), notes: String(details.get("notes") ?? ""), imageUrl: String(details.get("imageUrl") ?? ""), storeName: String(details.get("storeName") ?? ""),
            priceMin: details.get("priceMin") ? Number(details.get("priceMin")) : null, priceMax: details.get("priceMax") ? Number(details.get("priceMax")) : null,
            priority: String(details.get("priority") ?? "would_like") as "most_wanted" | "would_like" | "nice_to_have",
          } } : {}) });
          if (!result.ok) throw new Error(result.error || "Could not save your wish. Try again.");
          setSavedUrl(originalUrl);
          router.refresh();
          setPreviewMessage("Wish saved. Finding its picture and title… You can edit it in your list.");
          void (async () => {
            try {
              const response = await fetch("/api/wishlist-items/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exchangeId, itemId, preserveTitle: Boolean(details && String(details.get("title") ?? "").trim()) }) });
              const result = await response.json() as { ok?: boolean; error?: string };
              if (!response.ok || !result.ok) throw new Error(result.error || "Preview unavailable.");
              if (activeItemId.current === itemId) setPreviewMessage("Wish saved. Review its details in your list; you can edit its title or add a picture there.");
            } catch {
              if (activeItemId.current === itemId) setPreviewMessage("Wish saved. This page could not be previewed; you can name the gift and add a picture in your list.");
            } finally { router.refresh(); }
          })();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not save your wish. Try again.";
          pasteContext?.setPending({ itemId, url: originalUrl, error: message });
          setPreviewMessage(message);
          throw error;
        } finally { setPreviewing(false); }
      });
    } catch { /* The same action identity is retained for a safe retry. */ }
  }

  function updateDraft(value: string) {
    if (previewing) return;
    if (activeItemId.current && !savedUrl) pasteContext?.removePending(activeItemId.current);
    activeItemId.current = null;
    session.current.reset(); setSavedUrl(""); setDraft(value); setPreviewMessage("");
    const link = singlePastedUrl(value);
    setUrl(link ?? "");
    if (!link) setTitle(value);
  }

  async function submitWish(formData: FormData) {
    const link = singlePastedUrl(draft);
    if (link) { await savePasted(link, formData); return; }
    setPreviewing(true);
    try { await createWishlistItem(formData); resetDraft(); router.refresh(); }
    catch (error) { setPreviewMessage(error instanceof Error ? error.message : "Could not save your wish."); }
    finally { setPreviewing(false); }
  }

  async function pasteFromClipboard() {
    if (!navigator.clipboard?.readText) { setPreviewMessage("Paste the link into the field to add it."); return; }
    setPasting(true);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      const link = singlePastedUrl(text);
      if (link) { setDraft(link); setUrl(link); void savePasted(link); }
      else updateDraft(text);
    } catch { setPreviewMessage("Your browser could not read the clipboard. Paste into the field instead."); }
    finally { setPasting(false); }
  }

  return (
    <Card className="space-y-4 border-border/80 p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-xl font-bold">Add a wish</h2>
        <p className="mt-1 text-sm text-muted-foreground">Paste a product link or type a gift idea. We’ll fill in product details when we can.</p>
      </div>
      <form action={submitWish} className="grid gap-4">
        <input type="hidden" name="exchangeId" value={exchangeId} />
        <input type="hidden" name="url" value={url} />
        <label htmlFor="wishlist-wish-draft" className="sr-only">Paste a link or type a wish</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="wishlist-wish-draft"
            value={draft}
            onChange={(event) => updateDraft(event.target.value)}
            onPaste={(event) => { const pasted = singlePastedUrl(event.clipboardData.getData("text")); if (pasted) { event.preventDefault(); setDraft(pasted); setUrl(pasted); void savePasted(pasted); } }}
            placeholder="Paste a link or type a wish"
            autoComplete="off"
            readOnly={previewing || Boolean(savedUrl)}
            className="min-h-12 min-w-0 flex-1 text-base"
          />
          <Button type="button" variant="outline" onClick={pasteFromClipboard} disabled={pasting || previewing} className="min-h-12 shrink-0">
            <ClipboardPaste className="size-4" />{pasting ? "Pasting…" : "Paste"}
          </Button>
        </div>
        {previewing && <p role="status" className="text-sm text-muted-foreground">Saving your wish…</p>}
        {!savedUrl && <WishlistImagePicker exchangeId={exchangeId} imageUrl={imageUrl} onChange={(value) => { setImageUrl(value); }} />}
        {!savedUrl && <details className="group rounded-lg border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">Details</summary>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">Gift title
              <Input name="title" required={!url} maxLength={200} value={title} onChange={(event) => { setTitle(event.target.value); }} placeholder="A title your Santa will recognize" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">Store or maker
                <Input name="storeName" maxLength={100} value={storeName} onChange={(event) => { setStoreName(event.target.value); }} placeholder="Optional" />
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
              <label className="grid gap-1.5 text-sm font-medium">Price from ($)<Input name="priceMin" type="number" inputMode="numeric" min="0" max="1000000" step="1" value={priceMin} onChange={(event) => { setPriceMin(event.target.value); }} placeholder="Optional" /></label>
              <label className="grid gap-1.5 text-sm font-medium">Price up to ($)<Input name="priceMax" type="number" inputMode="numeric" min="0" max="1000000" step="1" value={priceMax} onChange={(event) => { setPriceMax(event.target.value); }} placeholder="Optional" /></label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">Notes
              <Textarea name="notes" maxLength={1000} rows={3} value={notes} onChange={(event) => { setNotes(event.target.value); }} placeholder="Product details are filled from the link when available." />
            </label>
          </div>
        </details>}
        {previewMessage && <p role="status" className="text-sm text-muted-foreground">{previewMessage}</p>}
        {savedUrl ? <Button type="button" variant="outline" onClick={resetDraft} disabled={previewing}>Add another wish</Button> : <Button type="submit" disabled={previewing} className="min-h-11 w-full sm:w-fit">{previewing ? "Saving…" : "Add to my list"}</Button>}
      </form>
    </Card>
  );
}
