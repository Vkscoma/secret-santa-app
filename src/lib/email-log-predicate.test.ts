import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { retryableEmailLogPredicate } from "./email-log-predicate";

describe("email log retry predicate", () => {
  it("keeps the stale timestamp typed through the Drizzle column encoder", () => {
    const staleBefore = new Date("2026-11-12T12:00:00.000Z");
    const query = new PgDialect().sqlToQuery(retryableEmailLogPredicate(staleBefore));
    expect(query.sql).toContain('"email_log"."updated_at" < $3');
    expect(query.params).toEqual(["failed", "pending", staleBefore.toISOString()]);
  });
});
