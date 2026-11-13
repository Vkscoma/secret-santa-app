"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Gift, LoaderCircle, ArrowUpRight } from "lucide-react";
import { WishlistImagePicker } from "@/components/secret-santa/wishlist-image-picker";
import { useWishlistPaste } from "@/components/secret-santa/wishlist-paste-provider";
import { createPasteSession, singlePastedUrl } from "@/components/secret-santa/wishlist-paste-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createWishlistItem, createPastedWishlistItem } from "@/lib/actions/wishlists";
import { prepareWishlistImage } from "@/lib/prepare-wishlist-image";

export type WishlistComposerProps = {
  exchangeId: string; initialUrl?: string; initialTitle?: string; initialImageUrl?: string; initialPrice?: string; initialStoreName?: string;
  /** Called once a wish has been saved, e.g. so a mobile sheet can close and reveal the list. */
  onSaved?: () => void;
};

export function WishlistComposer({ exchangeId, initialUrl = "", initialTitle = "", initialImageUrl = "", initialPrice = "", initialStoreName = "", onSaved }: WishlistComposerProps) {
  const router = useRouter();
  const pasteContext = useWishlistPaste();
  const session = useRef(createPasteSession(() => crypto.randomUUID()));
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(initialUrl || initialTitle);
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState(initialTitle);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [storeName, setStoreName] = useState(initialStoreName);
  const [priceMin, setPriceMin] = useState(initialPrice);
  const [priceMax, setPriceMax] = useState(initialPrice);
  const [previewing, setPreviewing] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("");
  const [pasting, setPasting] = useState(false);
  const [savedUrl, setSavedUrl] = useState("");
  const activeItemId = useRef<string | null>(null);

  function resetDraft() {
    if (activeItemId.current && !savedUrl) pasteContext?.removePending(activeItemId.current);
    activeItemId.current = null; session.current.reset(); setDraft(""); setUrl(""); setTitle(""); setImageUrl(""); setStoreName(""); setPriceMin(""); setPriceMax(""); setSavedUrl(""); setPreviewMessage("");
  }

  async function savePasted(link: string, details?: FormData) {
    // The link is now being handled automatically; clear it so it cannot look
    // like another item waiting to be added.
    setDraft("");
    setUrl("");
    try {
      await session.current.run(link, async ({ itemId, url: originalUrl }) => {
        activeItemId.current = itemId;
        setPreviewing(true);
        pasteContext?.setPending({ itemId, url: originalUrl });
        setPreviewMessage("Saving your wish…");
        try {
          if (details) await prepareWishlistImage(details);
          const result = await createPastedWishlistItem({ exchangeId, itemId, url: originalUrl, ...(details ? { details: {
            title: String(details.get("title") ?? ""), imageUrl: String(details.get("imageUrl") ?? ""), storeName: String(details.get("storeName") ?? ""),
            priceMin: details.get("priceMin") ? Number(details.get("priceMin")) : null, priceMax: details.get("priceMax") ? Number(details.get("priceMax")) : null,
            priority: String(details.get("priority") ?? "would_like") as "most_wanted" | "would_like" | "nice_to_have",
          } } : {}) });
          if (!result.ok) throw new Error(result.error || "Could not save your wish. Try again.");
          setSavedUrl(originalUrl);
          router.refresh();
          onSaved?.();
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
    try { await prepareWishlistImage(formData); await createWishlistItem(formData); resetDraft(); router.refresh(); onSaved?.(); }
    catch (error) { setPreviewMessage(error instanceof Error ? error.message : "Could not save your wish."); }
    finally { setPreviewing(false); }
  }

  async function pasteFromClipboard() {
    if (!navigator.clipboard?.readText) { setPreviewMessage("Paste the link into the field to add it."); return; }
    setPasting(true);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      const link = singlePastedUrl(text);
      if (link) { setDraft(link); setUrl(link); void savePasted(link, formRef.current ? new FormData(formRef.current) : undefined); }
      else updateDraft(text);
    } catch { setPreviewMessage("Your browser could not read the clipboard. Paste into the field instead."); }
    finally { setPasting(false); }
  }

  return (
    <Card className="overflow-hidden border-border/80 p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Gift className="size-5" aria-hidden="true" /></div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold">Add a wish</h2>
          <p className="mt-1 text-sm text-muted-foreground">A link, a little detail, or just an idea.</p>
        </div>
      </div>
      <form ref={formRef} action={submitWish} className="grid gap-4">
        <input type="hidden" name="exchangeId" value={exchangeId} />
        <input type="hidden" name="url" value={url} />
        <label htmlFor="wishlist-wish-draft" className="sr-only">Paste a link or type a wish</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="wishlist-wish-draft"
            value={draft}
            onChange={(event) => updateDraft(event.target.value)}
            onPaste={(event) => { const pasted = singlePastedUrl(event.clipboardData.getData("text")); if (pasted) { event.preventDefault(); setDraft(pasted); setUrl(pasted); void savePasted(pasted, formRef.current ? new FormData(formRef.current) : undefined); } }}
            placeholder="Add a wish or paste a link"
            autoComplete="off"
            readOnly={previewing || Boolean(savedUrl)}
            className="h-12 min-w-0 flex-1 rounded-xl px-4 text-base"
          />
          <Button type="button" onClick={pasteFromClipboard} disabled={pasting || previewing || Boolean(savedUrl)} className="h-12 w-full shrink-0 rounded-xl sm:w-auto sm:min-w-32">
            {previewing ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ClipboardPaste className="size-4" aria-hidden="true" />}
            {previewing ? "Adding…" : pasting ? "Pasting…" : "Paste link"}
          </Button>
        </div>
        {previewing && <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Saving your wish…</p>}
        {!savedUrl && <WishlistImagePicker exchangeId={exchangeId} imageUrl={imageUrl} onChange={(value) => { setImageUrl(value); }} />}
        {!savedUrl && <details open className="group mt-5 border-t pt-4">
          <summary className="list-none cursor-pointer text-sm font-semibold marker:hidden">More details <span className="float-right text-muted-foreground transition group-open:rotate-180">⌄</span></summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">Gift title
              <Input name="title" required={!url} maxLength={200} value={title} onChange={(event) => { setTitle(event.target.value); }} placeholder="A title your Santa will recognize" className="h-12 rounded-xl px-4 sm:col-span-2" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">Merchant
                <Input name="storeName" maxLength={100} value={storeName} onChange={(event) => { setStoreName(event.target.value); }} placeholder="Optional" className="h-12 rounded-xl px-4" />
              </label>
            <fieldset className="space-y-2 text-sm font-medium"><legend>Priority</legend><div className="flex flex-wrap gap-2">
                <label className="cursor-pointer"><input className="peer sr-only" type="radio" name="priority" value="most_wanted" /><span className="inline-flex h-10 items-center rounded-xl border border-border px-4 transition peer-checked:border-secondary peer-checked:bg-secondary peer-checked:text-secondary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">Most wanted</span></label>
                <label className="cursor-pointer"><input className="peer sr-only" type="radio" name="priority" value="would_like" defaultChecked /><span className="inline-flex h-10 items-center rounded-xl border border-border px-4 transition peer-checked:border-secondary peer-checked:bg-secondary peer-checked:text-secondary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">Would like</span></label>
                <label className="cursor-pointer"><input className="peer sr-only" type="radio" name="priority" value="nice_to_have" /><span className="inline-flex h-10 items-center rounded-xl border border-border px-4 transition peer-checked:border-secondary peer-checked:bg-secondary peer-checked:text-secondary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">Nice to have</span></label>
              </div></fieldset>
            <label className="grid gap-1.5 text-sm font-medium">Price range <div className="flex gap-2">
                <Input name="priceMin" type="number" inputMode="numeric" min="0" max="1000000" step="1" value={priceMin} onChange={(event) => { setPriceMin(event.target.value); }} placeholder="Min" className="h-12 rounded-xl px-4" />
                <Input name="priceMax" type="number" inputMode="numeric" min="0" max="1000000" step="1" value={priceMax} onChange={(event) => { setPriceMax(event.target.value); }} placeholder="Max" className="h-12 rounded-xl px-4" />
              </div></label>
          </div>
          <Button type="submit" disabled={previewing} size="lg" className="mt-5 w-full rounded-xl">{previewing ? "Saving…" : "Add to my list"} <ArrowUpRight className="size-4" /></Button>
        </details>}
        {previewMessage && <p role="status" className="text-sm text-muted-foreground">{previewMessage}</p>}
        {savedUrl && <Button type="button" variant="outline" onClick={resetDraft} disabled={previewing}>Add another wish</Button>}
      </form>
    </Card>
  );
}
