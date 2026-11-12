import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const colors = { background: "#f3f7f4", pine: "#174d3b", red: "#a9363b", ink: "#20382d", muted: "#53645a" };

export type EmailKind = "magic-link" | "assignment" | "reminder" | "empty-wishlist" | "wishlist-digest" | "manual-nudge";

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
  const copy: Record<EmailKind, { preview: string; title: string; body: string; subject: string }> = {
    "magic-link": { preview: "A secure, one-time link to your Secret Santa account.", title: "Sign in to Secret Santa", body: "Use the secure link below to sign in or finish creating your account.", subject: "Your Secret Santa sign-in link" },
    assignment: { preview: "Your Secret Santa assignment is ready.", title: "You’ve been assigned!", body: "Open the app to see who you’re shopping for.", subject: "Your Secret Santa assignment is ready" },
    reminder: { preview: "A little reminder about your Secret Santa exchange.", title: "Your exchange is coming up", body: "Your exchange is coming up soon. Open Secret Santa to check your list and gift ideas.", subject: "A reminder about your Secret Santa exchange" },
    "empty-wishlist": { preview: "A friendly reminder to add a few gift ideas.", title: "Add a few gift ideas", body: "Your Secret Santa would love a few ideas to help find something that feels just right.", subject: "Add a few gift ideas to your wish list" },
    "wishlist-digest": { preview: "Your recipient added ideas to their wish list.", title: "Your recipient updated their wish list", body: "Your recipient has added or updated gift ideas. Sign in to see what’s new.", subject: "Your recipient updated their wish list" },
    "manual-nudge": { preview: "A friendly reminder to add a few gift ideas.", title: "Add a few gift ideas", body: "A little reminder to add the gifts you’d love to receive to your Secret Santa wish list.", subject: "A little Secret Santa reminder" },
  };
  const content = copy[kind];
  const preferencesUrl = new URL("/profile?preferences=1#email-preferences", url).toString();
  return (
    <Html lang="en">
      <Head />
      <Preview>{content.preview}</Preview>
      <Body style={{ margin: 0, backgroundColor: colors.background, color: colors.ink, fontFamily: "Arial,Helvetica,sans-serif" }}>
        <Container style={{ maxWidth: 560, margin: "32px auto", backgroundColor: "#ffffff", border: "1px solid #e1e9e3", borderRadius: 16, overflow: "hidden" }}>
          <Section style={{ padding: "22px 28px", textAlign: "center", backgroundColor: colors.pine, borderBottom: "3px solid #d7ad55" }}>
            <Text style={{ margin: 0, color: "#f4dfad", fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>A LITTLE HOLIDAY MAGIC</Text>
            <Text style={{ margin: "7px 0 0", color: "#ffffff", fontSize: 21, fontWeight: 700 }}>Secret Santa</Text>
          </Section>
          <Section style={{ padding: "36px 36px 30px" }}>
            {name && <Text style={{ margin: "0 0 10px", color: "#63766b", fontSize: 13 }}>{name}</Text>}
            {exchangeName && <Text style={{ margin: "0 0 10px", color: "#63766b", fontSize: 13 }}>{exchangeName}</Text>}
            <Heading as="h1" style={{ margin: "0 0 14px", color: colors.ink, fontSize: 28, lineHeight: "36px" }}>{content.title}</Heading>
            <Text style={{ margin: "0 0 26px", color: colors.muted, fontSize: 16, lineHeight: "25px" }}>{detail ?? content.body}</Text>
            <Button href={url} style={{ display: "block", width: "fit-content", margin: "0 auto", padding: "15px 28px", borderRadius: 9, backgroundColor: colors.red, color: "#ffffff", fontSize: 16, lineHeight: "20px", fontWeight: 700, textDecoration: "none" }}>
              {kind === "magic-link" ? "Continue securely" : kind === "empty-wishlist" || kind === "manual-nudge" ? "Open your wish list" : "Open Secret Santa"}
            </Button>
          </Section>
          <Section style={{ padding: "20px 30px 24px", borderTop: "1px solid #e7eee8", backgroundColor: "#f8faf8", textAlign: "center" }}>
            <Text style={{ margin: 0, color: "#6b786f", fontSize: 12, lineHeight: "19px" }}>
              {kind === "assignment" ? "Your recipient’s identity is only shown after you sign in." : "Made for the people you love, and the little surprises in between."}
            </Text>
            <Text style={{ margin: "12px 0 0", fontSize: 11 }}><a href={preferencesUrl} style={{ color: "#6b786f" }}>Manage email preferences</a></Text>
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
