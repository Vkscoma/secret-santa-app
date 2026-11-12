"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nudgeRecipient } from "@/lib/actions/nudges";

export function NudgeButton({ exchangeId }: { exchangeId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <div className="flex flex-wrap items-center gap-2">
    <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
      const result = await nudgeRecipient(exchangeId);
      setMessage(result.message);
    })}>
      <Mail className="size-4" />{pending ? "Sending…" : "Nudge by email"}
    </Button>
    {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
  </div>;
}
