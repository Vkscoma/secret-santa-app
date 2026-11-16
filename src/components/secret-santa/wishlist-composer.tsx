"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronDown, ClipboardPaste, Gift, LoaderCircle } from "lucide-react";
import { WishFields } from "@/components/secret-santa/wish-fields";
import { useWishlistPaste } from "@/components/secret-santa/wishlist-paste-provider";
import { createPasteSession, singlePastedUrl } from "@/components/secret-santa/wishlist-paste-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createWishlistItem, createPastedWishlistItem } from "@/lib/actions/wishlists";
import { prepareWishlistImage } from "@/lib/prepare-wishlist-image";
import { cn } from "@/lib/utils";

export type WishlistComposerProps = {
  exchangeId: string; initialUrl?: string; initialTitle?: string; initialImageUrl?: string; initialPrice?: string; initialStoreName?: string;
  /** Called once a wish has been saved, e.g. so a mobile sheet can close and reveal the list. */
  onSaved?: () => void;
  /**
   * `sheet` fills a height-limited bottom sheet: the fields scroll inside it and the
   * action stays pinned at the bottom. `inline` flows with the page.
   */
  layout?: "inline" | "sheet";
};

function price(details: FormData, name: string) {
  const value = details.get(name);
  return value ? Math.round(Number(value)) : null;
}

export function WishlistComposer({ exchangeId, initialUrl = "", initialTitle = "", initialImageUrl = "", initialPrice = "", initialStoreName = "", onSaved, layout = "inline" }: WishlistComposerProps) {
  const router = useRouter();
  const pasteContext = useWishlistPaste();
  const session = useRef(createPasteSession(() => crypto.randomUUID()));
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(initialUrl || initialTitle);
  const [url, setUrl] = useState(initialUrl);
  // The detail fields are uncontrolled; a new key clears them after a save.
  const [fieldsKey, setFieldsKey] = useState(0);
  const [prefilled, setPrefilled] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("");
  const [pasting, setPasting] = useState(false);
  const [savedUrl, setSavedUrl] = useState("");
  const activeItemId = useRef<string | null>(null);
  const sheet = layout === "sheet";
  const draftIsLink = Boolean(url);

  function resetDraft() {
    if (activeItemId.current && !savedUrl) pasteContext?.removePending(activeItemId.current);
    activeItemId.current = null; session.current.reset(); setDraft(""); setUrl(""); setSavedUrl(""); setPreviewMessage("");
    setPrefilled(false); setFieldsKey((key) => key + 1);
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
            notes: String(details.get("notes") ?? ""),
            priceMin: price(details, "priceMin"), priceMax: price(details, "priceMax"),
            priority: String(details.get("priority") ?? "would_like") as "most_wanted" | "would_like" | "nice_to_have",
          } } : {}) });
          if (!result.ok) throw new Error(result.error || "Could not save your wish. Try again.");
          setSavedUrl(originalUrl);
          router.refresh();
          onSaved?.();
          setPreviewMessage("Your wish is saved. We’ll add the gift name and picture when we can.");
          void (async () => {
            try {
              const response = await fetch("/api/wishlist-items/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exchangeId, itemId, preserveTitle: Boolean(details && String(details.get("title") ?? "").trim()) }) });
              const result = await response.json() as { ok?: boolean; error?: string };
              if (!response.ok || !result.ok) throw new Error(result.error || "We couldn’t get details from that link.");
              if (activeItemId.current === itemId) setPreviewMessage("Your wish is saved. You can change its name or add a photo in your list.");
            } catch {
              if (activeItemId.current === itemId) setPreviewMessage("Your wish is saved. We couldn’t get details from that link, but you can add a name or photo in your list.");
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
    setUrl(singlePastedUrl(value) ?? "");
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
    <Card className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", sheet ? "rounded-none border-0 bg-transparent shadow-none" : "border-border/80 p-5 shadow-sm sm:p-6")}>
      <div className={cn("flex shrink-0 items-start gap-3", sheet ? "px-5 pt-5 pr-14 pb-3" : "mb-5")}>
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Gift className="size-5" aria-hidden="true" /></div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold">Add a wish</h2>
          <p className="mt-1 text-sm text-muted-foreground">Type a gift name or paste a link. You can add details later.</p>
        </div>
      </div>
      <form ref={formRef} action={submitWish} className="flex min-h-0 flex-1 flex-col">
        {/* pt-1 leaves room for the focus ring, which a scroll container would otherwise clip. */}
        <div data-wish-scroll className={cn("grid min-h-0 flex-1 content-start gap-4", sheet && "overflow-y-auto overscroll-contain px-5 pt-1 pb-4")}>
          <input type="hidden" name="exchangeId" value={exchangeId} />
          <input type="hidden" name="url" value={url} />
          {/* The main field is the gift name unless it holds a link; then "Gift name" in More details is the title. */}
          {!draftIsLink && <input type="hidden" name="title" value={draft} />}
          <label htmlFor="wishlist-wish-draft" className="sr-only">Gift idea or product link</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="wishlist-wish-draft"
              value={draft}
              onChange={(event) => updateDraft(event.target.value)}
              onPaste={(event) => { const pasted = singlePastedUrl(event.clipboardData.getData("text")); if (pasted) { event.preventDefault(); setDraft(pasted); setUrl(pasted); void savePasted(pasted, formRef.current ? new FormData(formRef.current) : undefined); } }}
              placeholder="Type a gift or paste a link"
              autoComplete="off"
              required
              readOnly={previewing || Boolean(savedUrl)}
              className="h-12 w-full min-w-0 rounded-xl px-4 text-base sm:w-auto sm:flex-1"
            />
            <Button type="button" variant="neutral" onClick={pasteFromClipboard} disabled={pasting || previewing || Boolean(savedUrl)} className="h-12 w-full shrink-0 rounded-xl sm:w-auto sm:min-w-32">
              {previewing ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ClipboardPaste className="size-4" aria-hidden="true" />}
              {previewing ? "Adding…" : pasting ? "Pasting…" : "Paste link"}
            </Button>
          </div>
          {previewing && <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Saving your wish…</p>}
          {!savedUrl && <details className="group border-t border-border pt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
              More details (optional)
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </summary>
            <div className="pt-3 pb-1">
              <WishFields
                key={fieldsKey}
                exchangeId={exchangeId}
                showTitle={draftIsLink}
                defaults={prefilled ? { title: initialTitle, storeName: initialStoreName, priceMin: initialPrice, priceMax: initialPrice, imageUrl: initialImageUrl } : {}}
              />
            </div>
          </details>}
        </div>
        <div className={cn("grid shrink-0 gap-3 border-t border-border", sheet ? "px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]" : "mt-4 pt-4")}>
          {previewMessage && <p role="status" className="text-sm text-muted-foreground">{previewMessage}</p>}
          {savedUrl
            ? <Button type="button" variant="neutral" onClick={resetDraft} disabled={previewing} className="h-12 w-full rounded-xl sm:ml-auto sm:w-auto">Add another wish</Button>
            : <Button type="submit" variant="affirmative" disabled={previewing} aria-busy={previewing} className="h-12 w-full min-w-44 rounded-xl sm:ml-auto sm:w-auto">{previewing ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Saving…</> : <>Add to my list <ArrowUpRight className="size-4" aria-hidden="true" /></>}</Button>}
        </div>
      </form>
    </Card>
  );
}
