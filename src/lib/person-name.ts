/**
 * The short, friendly name to show for a person.
 *
 * Fallback order:
 * 1. First word of the display name ("Michelle Scoma" → "Michelle").
 * 2. First word of the profile name. A single-word name is used as entered
 *    ("Michellescoma"), even if it looks like a username.
 * 3. The part of the email before the @.
 * 4. `null`, so the caller can use a generic label such as "your recipient".
 */
export function formatFirstName(
  displayName: string | null | undefined,
  fullName: string | null | undefined,
  email?: string | null
): string | null {
  const firstWord = (value: string | null | undefined) => value?.trim().split(/\s+/)[0] || null;
  return firstWord(displayName) ?? firstWord(fullName) ?? (email?.trim().split("@")[0] || null);
}

/** Possessive form of a name. Always adds ’s, including after a final "s" ("James’s"). */
export function possessive(name: string): string {
  return `${name}’s`;
}
