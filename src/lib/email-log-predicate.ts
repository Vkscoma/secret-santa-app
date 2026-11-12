import { and, eq, lt, or, type SQL } from "drizzle-orm";
import { emailLog } from "@/lib/schema";

export function retryableEmailLogPredicate(staleBefore: Date): SQL {
  const predicate = or(
    eq(emailLog.status, "failed"),
    and(eq(emailLog.status, "pending"), lt(emailLog.updatedAt, staleBefore))
  );
  if (!predicate) throw new Error("Unable to build email log retry predicate.");
  return predicate;
}
