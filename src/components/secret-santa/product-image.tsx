"use client";

import { useState } from "react";
import Image from "next/image";
import { Gift } from "lucide-react";

type Props = {
  src: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
  placeholderTone?: "secondary" | "muted";
};

/** Displays an external product image only after validating its URL, with a gift fallback. */
export function ProductImage({
  src,
  alt,
  className = "",
  iconClassName = "size-6",
  placeholderTone = "secondary",
}: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  let safeSrc: string | null = null;
  if (src) {
    try {
      const parsed = new URL(src);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") safeSrc = parsed.toString();
    } catch {
      safeSrc = null;
    }
  }
  const showImage = Boolean(safeSrc && safeSrc !== failedSrc);
  const fallbackColors =
    placeholderTone === "muted"
      ? "bg-muted text-muted-foreground"
      : "bg-secondary text-secondary-foreground";

  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl ${fallbackColors} ${className}`}
    >
      {showImage ? (
        <Image
          src={safeSrc!}
          alt={alt}
          fill
          unoptimized
          referrerPolicy="no-referrer"
          sizes="(max-width: 640px) 112px, 160px"
          className="object-cover"
          onError={() => setFailedSrc(safeSrc)}
        />
      ) : (
        <Gift aria-hidden="true" className={iconClassName} />
      )}
    </div>
  );
}
