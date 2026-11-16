import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { EmailButton } from "./email-button";

/** Exact values from the approved email reference. Hard-coded because email clients do not support CSS variables. */
const colors = {
  background: "#f2f6f3",
  card: "#ffffff",
  pine: "#204234",
  gold: "#cca556",
  ink: "#213028",
  muted: "#53645a",
  footer: "#f7f9f7",
  footerText: "#6b786f",
};

export const EMAIL_KINDS = ["magic-link", "assignment", "reminder", "empty-wishlist", "wishlist-digest", "manual-nudge"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export function NotificationEmail({
  kind,
  name,
  exchangeName,
  url,
  detail,
}: {
  kind: EmailKind;
  name?: string;
  exchangeName?: string;
  url: string;
  detail?: string;
}) {
  const copy: Record<EmailKind, { preview: string; title: string; body: string; subject: string; cta: string }> = {
    "magic-link": { preview: "A secure, one-time link to your Secret Santa account.", title: "Sign in to Secret Santa", body: "Tap the button to sign in. This link works once and expires in 15 minutes. If you didn’t ask for this, you can ignore this email.", subject: "Your Secret Santa sign-in link", cta: "Sign in to Secret Santa" },
    assignment: { preview: "Your Secret Santa assignment is ready.", title: "You’ve been assigned!", body: "Open the app to see who you’re shopping for.", subject: "Your Secret Santa assignment is ready", cta: "Open Secret Santa" },
    reminder: { preview: "A little reminder about your Secret Santa exchange.", title: "Your exchange is coming up", body: "Your exchange is coming up soon. Open Secret Santa to check your list and gift ideas.", subject: "A reminder about your Secret Santa exchange", cta: "Open Secret Santa" },
    "empty-wishlist": { preview: "A friendly reminder to add a few gift ideas.", title: "Add a few gift ideas", body: "Your Secret Santa would love a few ideas to help find something that feels just right.", subject: "Add a few gift ideas to your wish list", cta: "Open your wish list" },
    "wishlist-digest": { preview: "Your recipient added ideas to their wish list.", title: "Your recipient updated their wish list", body: "Your recipient has added or updated gift ideas. Sign in to see what’s new.", subject: "Your recipient updated their wish list", cta: "Open Secret Santa" },
    "manual-nudge": { preview: "A friendly reminder to add a few gift ideas.", title: "Add a few gift ideas", body: "A little reminder to add the gifts you’d love to receive to your Secret Santa wish list.", subject: "A little Secret Santa reminder", cta: "Open your wish list" },
  };
  const content = copy[kind];
  const preferencesUrl = new URL("/profile?preferences=1#email-preferences", url).toString();
  return (
    <Html lang="en">
      <Head>
        {/* Light-only: stops Apple Mail auto-inverting the card. The dark button fill and white label stay readable where clients force dark mode. */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{content.preview}</Preview>
      <Body style={{ margin: 0, backgroundColor: colors.background, color: colors.ink, fontFamily: "Arial,Helvetica,sans-serif" }}>
        <Container style={{ maxWidth: 560, margin: "32px auto", backgroundColor: colors.card, border: "1px solid #e1e9e3", borderRadius: 16, overflow: "hidden" }}>
          <Section style={{ padding: "22px 28px", textAlign: "center", backgroundColor: colors.pine, borderBottom: `4px solid ${colors.gold}` }}>
            <Text style={{ margin: 0, color: "#f4dfad", fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>A LITTLE HOLIDAY MAGIC</Text>
            <Text style={{ margin: "7px 0 0", color: "#ffffff", fontSize: 21, fontWeight: 700 }}>Secret Santa</Text>
          </Section>
          <Section style={{ padding: "36px 36px 30px" }}>
            {name && <Text style={{ margin: "0 0 10px", color: "#63766b", fontSize: 13 }}>{name}</Text>}
            {exchangeName && <Text style={{ margin: "0 0 10px", color: "#63766b", fontSize: 13 }}>{exchangeName}</Text>}
            <Heading as="h1" style={{ margin: "0 0 14px", color: colors.ink, fontSize: 28, lineHeight: "36px" }}>{content.title}</Heading>
            <Text style={{ margin: "0 0 26px", color: colors.muted, fontSize: 16, lineHeight: "25px" }}>{detail ?? content.body}</Text>
            <EmailButton href={url} label={content.cta} />
            <Text style={{ margin: "20px 0 0", color: colors.footerText, fontSize: 12, lineHeight: "18px", textAlign: "center" }}>
              Button not working? Copy and paste this link:{" "}
              <a href={url} style={{ color: colors.footerText, wordBreak: "break-all" }}>{url}</a>
            </Text>
          </Section>
          <Section style={{ padding: "20px 30px 24px", borderTop: "1px solid #e7eee8", backgroundColor: colors.footer, textAlign: "center" }}>
            <Text style={{ margin: 0, color: colors.footerText, fontSize: 12, lineHeight: "19px" }}>
              {kind === "assignment" ? "Your recipient’s identity is only shown after you sign in." : "Made for the people you love, and the little surprises in between."}
            </Text>
            <Text style={{ margin: "12px 0 0", fontSize: 11 }}><a href={preferencesUrl} style={{ color: colors.footerText }}>Manage email preferences</a></Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function emailSubject(kind: EmailKind) {
  const labels: Record<EmailKind, string> = {
    "magic-link": "Your Secret Santa sign-in link",
    assignment: "Your Secret Santa assignment is ready",
    reminder: "A reminder about your Secret Santa exchange",
    "empty-wishlist": "Add a few gift ideas to your wish list",
    "wishlist-digest": "Your recipient updated their wish list",
    "manual-nudge": "A little Secret Santa reminder",
  };
  return labels[kind];
}
