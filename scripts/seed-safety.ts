export type SeedEnvironment = {
  NODE_ENV?: string;
  VERCEL?: string;
  SEED_SYNTHETIC_DATA?: string;
};

export function assertSyntheticSeedAllowed(environment: SeedEnvironment) {
  if (environment.NODE_ENV === "production" || environment.VERCEL) {
    throw new Error("Synthetic seed data is disabled in production and hosted Vercel environments.");
  }
  if (environment.SEED_SYNTHETIC_DATA !== "true") {
    throw new Error("Set SEED_SYNTHETIC_DATA=true to confirm you are seeding a development database.");
  }
}

export function upcomingSecretSantaYear(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return month === 12 && day > 25 ? year + 1 : year;
}
