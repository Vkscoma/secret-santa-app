"use client";

import { Plus } from "lucide-react";
import { WishComposer } from "@/components/secret-santa/components";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function MobileAddWish() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button aria-label="Add a wish" className="fixed bottom-6 right-5 z-20 size-14 rounded-full p-0 shadow-lg sm:hidden"><Plus className="size-6" /></Button>
      </DialogTrigger>
      <DialogContent className="fixed inset-x-0 bottom-0 top-auto left-0 z-50 max-h-[88svh] w-full max-w-full translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-b-none rounded-t-2xl border-x-0 border-b-0 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:hidden" showCloseButton>
        <DialogTitle className="sr-only">Add a wish</DialogTitle>
        <DialogDescription className="sr-only">Add an item to your Secret Santa wish list.</DialogDescription>
        <WishComposer />
      </DialogContent>
    </Dialog>
  );
}
