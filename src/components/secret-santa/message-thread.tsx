"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Message = { id: string; senderRole: "giver" | "recipient"; body: string; sentAt: string; readAt: string | null };
type ThreadData = { viewerRole: "giver" | "recipient"; title: string; messages: Message[] };

export function MessageThread({ exchangeId }: { exchangeId: string }) {
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/messages/${exchangeId}`, { cache: "no-store" });
    if (!response.ok) { setError("Could not load messages."); return; }
    setThread(await response.json() as ThreadData);
  }, [exchangeId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh]);
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    startTransition(async () => {
      const response = await fetch(`/api/messages/${exchangeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setError(result.error ?? "Could not send message."); return; }
      setBody(""); await refresh();
    });
  }
  return <Card className="space-y-4 p-4 sm:p-6">
    <h2 className="font-bold">Chat with {thread?.title ?? "your Secret Santa"}</h2>
    <div aria-live="polite" className="max-h-[55vh] min-h-48 space-y-3 overflow-y-auto rounded-xl bg-muted/40 p-3">
      {thread?.messages.map((message) => <div key={message.id} className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl p-3 text-sm ${message.senderRole === thread.viewerRole ? "ml-auto bg-primary text-primary-foreground" : "bg-card"}`}>{message.body}<time className="mt-1 block text-[10px] opacity-70">{new Date(message.sentAt).toLocaleString()}</time></div>)}
      {!thread?.messages.length && <p className="py-12 text-center text-sm text-muted-foreground">Say hello and keep the surprise alive.</p>}
    </div>
    <form onSubmit={send} className="space-y-2">
      <label className="sr-only" htmlFor="message-body">Write a message</label>
      <Textarea id="message-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} required rows={3} placeholder="Write a message…" />
      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{body.length}/1000</span><Button disabled={pending || !body.trim()}>{pending ? "Sending…" : "Send message"}</Button></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  </Card>;
}
