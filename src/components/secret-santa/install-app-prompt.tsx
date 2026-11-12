"use client";

import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PromptMode = "ios" | "install" | null;
const dismissedKey = "secret-santa-install-tip-dismissed-v1";

function isIosDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function InstallAppPrompt() {
  const [mode, setMode] = useState<PromptMode>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = window.localStorage.getItem(dismissedKey) === "yes"; } catch { /* Storage can be disabled. */ }
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (dismissed || standalone) return;
    const ios = isIosDevice();
    const iosFrame = ios ? window.requestAnimationFrame(() => setMode("ios")) : null;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      if (!isIosDevice()) setMode("install");
    };
    const onInstalled = () => setMode(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      if (iosFrame !== null) window.cancelAnimationFrame(iosFrame);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mode) return null;

  function dismiss() {
    try { window.localStorage.setItem(dismissedKey, "yes"); } catch { /* The tip still closes for this visit. */ }
    setMode(null);
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setMode(null);
  }

  return <aside className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md sm:hidden" aria-label="Install Secret Santa">
    <Card className="safe-bottom relative border-pine/20 bg-card/95 p-4 shadow-xl backdrop-blur">
      <Button type="button" variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss install tip" className="absolute right-2 top-2 size-8"><X className="size-4" /></Button>
      <div className="flex items-start gap-3 pr-7">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-pine">{mode === "ios" ? <Share2 className="size-5" /> : <Download className="size-5" />}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold">Add Secret Santa to your home screen</h2>
          {mode === "ios"
            ? <p className="mt-1 text-xs leading-5 text-muted-foreground">In Safari, tap Share, then choose <span className="font-semibold text-foreground">Add to Home Screen</span>.</p>
            : <p className="mt-1 text-xs leading-5 text-muted-foreground">Keep your exchange close at hand with the app on your home screen.</p>}
          {mode === "install" && <Button type="button" size="sm" className="mt-3" onClick={install}>Install app</Button>}
        </div>
      </div>
    </Card>
  </aside>;
}
