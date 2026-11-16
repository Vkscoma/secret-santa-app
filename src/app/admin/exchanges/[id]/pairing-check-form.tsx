"use client";

import { useActionState } from "react";
import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkExchangePairings, type PairingCheckState } from "@/lib/actions/admin-pairings";

const initialState: PairingCheckState = {};

export function PairingCheckForm({ exchangeId }: { exchangeId: string }) {
  const [state, action, pending] = useActionState(checkExchangePairings, initialState);
  const result = state.result;

  return (
    <div className="space-y-3">
      <form action={action}>
        <input type="hidden" name="exchangeId" value={exchangeId} />
        <Button type="submit" variant="neutral" disabled={pending} aria-busy={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
          {pending ? "Checking pairings…" : "Check pairings"}
        </Button>
      </form>

      <div aria-live="polite" aria-atomic="true">
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {result && <div className="space-y-3 rounded-xl bg-muted/60 p-4">
          <p className={`flex items-center gap-2 font-semibold ${result.allPassed ? "text-success" : "text-destructive"}`}>
            {result.allPassed ? <Check className="size-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="size-4 shrink-0" aria-hidden="true" />}
            {result.allPassed
              ? `${result.participantCount} participants, ${result.pairingCount} pairings, all rules pass.`
              : `${result.failedRuleCount} ${result.failedRuleCount === 1 ? "rule failed" : "rules failed"}; ${result.affectedParticipantCount} ${result.affectedParticipantCount === 1 ? "person is" : "people are"} affected.`}
          </p>
          <ul className="space-y-2 text-sm">
            {result.rules.map((rule) => <li key={rule.key} className="flex items-start gap-2">
              {rule.passed
                ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                : <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />}
              <span>{rule.label}: {rule.passed ? "Pass" : `Fail · ${rule.affectedCount} ${rule.affectedCount === 1 ? "person" : "people"} affected`}</span>
            </li>)}
          </ul>
          {!result.allPassed && <p className="text-sm text-muted-foreground">Redraw names may fix these issues.</p>}
        </div>}
      </div>
    </div>
  );
}
