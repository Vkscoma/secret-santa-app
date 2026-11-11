"use client";

import { useRef, useState } from "react";
import { ProductImage } from "@/components/secret-santa/product-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = { exchangeId: string; imageUrl: string; onChange?: (url: string) => void; itemId?: string };

async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size <= 3_800_000) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.82;
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  while (blob && blob.size > 3_800_000 && quality > 0.4) {
    quality -= 0.12;
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  }
  if (!blob || blob.size > 3_800_000) throw new Error("This image is too large to upload.");
  return new File([blob], "wishlist-image.webp", { type: "image/webp" });
}

export function WishlistImagePicker({ exchangeId, itemId, imageUrl, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl);
  const displayedImageUrl = onChange ? imageUrl : currentImageUrl;
  function changeImage(url: string) { setCurrentImageUrl(url); onChange?.(url); }

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const compressed = await shrinkImage(file);
      const form = new FormData();
      form.set("exchangeId", exchangeId);
      if (itemId) form.set("itemId", itemId);
      form.set("file", compressed);
      const response = await fetch("/api/wishlist-images/upload", { method: "POST", body: form });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Image upload failed.");
      changeImage(result.url);
      setMessage("Image added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <div className="grid gap-2" onPaste={(event) => {
    const image = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile();
    if (image) { event.preventDefault(); void upload(image); }
  }}>
    <input type="hidden" name="imageUrl" value={displayedImageUrl} />
    {displayedImageUrl && <ProductImage src={displayedImageUrl} alt="Gift image preview" className="size-24" />}
    <div className="flex flex-wrap gap-2">
      <input ref={inputRef} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Choose a gift image" onChange={(event) => void upload(event.target.files?.[0])} />
      <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Adding image…" : "Add photo or screenshot"}</Button>
      <label className="sr-only" htmlFor={`wishlist-image-url-${itemId ?? "new"}`}>Paste image URL</label>
      <Input id={`wishlist-image-url-${itemId ?? "new"}`} type="url" value={displayedImageUrl} onChange={(event) => changeImage(event.target.value)} placeholder="Or paste an image URL" className="min-w-[14rem] flex-1" />
    </div>
    <p role="status" className="text-xs text-muted-foreground">You can also paste a copied image here.</p>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </div>;
}
