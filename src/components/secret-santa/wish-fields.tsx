"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { WishlistImagePicker } from "@/components/secret-santa/wishlist-image-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type WishFieldDefaults = {
  title?: string;
  url?: string;
  storeName?: string;
  priceMin?: string | number | null;
  priceMax?: string | number | null;
  priority?: string;
  notes?: string;
  imageUrl?: string;
};

type WishFieldsProps = {
  exchangeId: string;
  itemId?: string;
  defaults?: WishFieldDefaults;
  /** Show the editable gift name. The add form hides it while its main field is the gift name. */
  showTitle?: boolean;
  titleRequired?: boolean;
  /** Show the product link. The add form's main field already holds the link. */
  showUrl?: boolean;
  /** Extra controls under the product link, such as refreshing the image from it. */
  urlActions?: ReactNode;
};

const labelClass = "grid gap-1.5 text-sm font-medium";
const fieldClass = "h-12 rounded-xl px-4";

const priorities = [
  { value: "most_wanted", label: "Most wanted" },
  { value: "would_like", label: "Would like" },
  { value: "nice_to_have", label: "Nice to have" },
] as const;

/** Follows a title that is filled in later from the product link, until the person edits it. */
function GiftNameField({ initialTitle, required }: { initialTitle: string; required: boolean }) {
  const [title, setTitle] = useState(initialTitle);
  const userHasEdited = useRef(false);

  useEffect(() => {
    if (!userHasEdited.current) setTitle(initialTitle);
  }, [initialTitle]);

  return (
    <label className={labelClass}>
      Gift name
      <Input
        name="title"
        required={required}
        maxLength={200}
        value={title}
        onChange={(event) => {
          userHasEdited.current = true;
          setTitle(event.target.value);
        }}
        placeholder="For example, a blue wool scarf"
        className={fieldClass}
      />
    </label>
  );
}

function PriceInput({ name, label, placeholder, defaultValue }: { name: string; label: string; placeholder: string; defaultValue: string | number | null | undefined }) {
  return (
    <div className="relative min-w-0">
      <span aria-hidden="true" className="text-muted-foreground pointer-events-none absolute inset-y-0 left-4 grid place-items-center">
        $
      </span>
      <Input
        name={name}
        type="number"
        inputMode="decimal"
        min="0"
        max="1000000"
        step="any"
        aria-label={label}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        // Prices are saved in whole dollars.
        onBlur={(event) => {
          const value = event.currentTarget.value;
          if (value !== "" && Number.isFinite(Number(value))) event.currentTarget.value = String(Math.round(Number(value)));
        }}
        className={cn(fieldClass, "[appearance:textfield] pl-8 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none")}
      />
    </div>
  );
}

/** The gift detail fields shared by the add form and the edit form, in one order. */
export function WishFields({ exchangeId, itemId, defaults = {}, showTitle = false, titleRequired = false, showUrl = false, urlActions }: WishFieldsProps) {
  const priorityLabelId = useId();
  const priceLabelId = useId();
  const photoLabelId = useId();
  const selectedPriority = priorities.some(({ value }) => value === defaults.priority) ? defaults.priority : "would_like";

  return (
    <div className="grid min-w-0 gap-4">
      {showTitle && <GiftNameField initialTitle={defaults.title ?? ""} required={titleRequired} />}

      {showUrl && (
        <div className="grid gap-2">
          <label className={labelClass}>
            Product link
            <Input name="url" type="url" inputMode="url" maxLength={2000} defaultValue={defaults.url ?? ""} placeholder="https://" className={fieldClass} />
          </label>
          {urlActions}
        </div>
      )}

      <label className={labelClass}>
        Store or website
        <Input name="storeName" maxLength={100} defaultValue={defaults.storeName ?? ""} placeholder="e.g., REI or rei.com" className={fieldClass} />
      </label>

      <div role="group" aria-labelledby={priceLabelId} className="grid gap-1.5">
        <p id={priceLabelId} className="text-sm font-medium">Price range</p>
        <div className="grid grid-cols-2 gap-2">
          <PriceInput name="priceMin" label="Minimum price in dollars" placeholder="Min" defaultValue={defaults.priceMin} />
          <PriceInput name="priceMax" label="Maximum price in dollars" placeholder="Max" defaultValue={defaults.priceMax} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <p id={priorityLabelId} className="text-sm font-medium">Priority</p>
        <div role="radiogroup" aria-labelledby={priorityLabelId} className="border-input grid grid-cols-3 gap-1 rounded-xl border p-1">
          {priorities.map(({ value, label }) => (
            <label key={value} className="relative min-w-0 cursor-pointer">
              <input type="radio" name="priority" value={value} defaultChecked={value === selectedPriority} className="peer sr-only" />
              <span className="text-muted-foreground hover:text-foreground peer-checked:bg-primary/15 peer-checked:text-foreground peer-checked:ring-primary peer-focus-visible:outline-ring flex min-h-11 items-center justify-center gap-1 rounded-lg px-1.5 text-center text-[0.8125rem] leading-tight transition-colors peer-checked:font-semibold peer-checked:ring-2 peer-checked:ring-inset peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-checked:[&>svg]:block">
                <Check className="text-affirmative-text hidden size-3.5 shrink-0" aria-hidden="true" />
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <label className={labelClass}>
        Notes
        <Textarea name="notes" maxLength={1000} rows={2} defaultValue={defaults.notes ?? ""} placeholder="Size, color, or anything helpful" className="rounded-xl px-4 py-3" />
      </label>

      <div role="group" aria-labelledby={photoLabelId} className="grid gap-1.5">
        <p id={photoLabelId} className="text-sm font-medium">Photo</p>
        <WishlistImagePicker exchangeId={exchangeId} imageUrl={defaults.imageUrl ?? ""} {...(itemId ? { itemId } : {})} />
      </div>
    </div>
  );
}
