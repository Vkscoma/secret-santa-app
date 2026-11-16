/**
 * The one filled call-to-action used in emails. This is the intentional exception to the
 * app's outline-only button system documented in DESIGN.md: email clients cannot render the
 * app Button, and a filled button is the most reliable, recognisable action in an inbox.
 *
 * It is a "bulletproof" button: a table cell carries the fill for Gmail, Apple Mail and
 * mobile apps, and desktop Outlook (Word engine) gets a VML rounded rectangle, because it
 * ignores border-radius and link padding. Colors are hard-coded hex because email clients
 * do not support CSS variables.
 */

/** Cranberry fill from the approved email reference. White on it is 7.2:1. */
const FILL = "#953837";
const TEXT = "#ffffff";
const FONT = "Arial,Helvetica,sans-serif";
/** 15px padding + 20px line = 50px tap height, as in the reference. */
const HEIGHT = 50;
const RADIUS = 9;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function EmailButton({ href, label }: { href: string; label: string }) {
  const url = escapeHtml(href);
  const text = escapeHtml(label);
  // VML needs a fixed width, so estimate it from the label at 16px bold Arial.
  const outlookWidth = Math.max(180, Math.round(label.length * 8.6) + 56);
  const html = `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:${HEIGHT}px;v-text-anchor:middle;width:${outlookWidth}px;" arcsize="${Math.round((RADIUS / HEIGHT) * 100)}%" stroke="f" fillcolor="${FILL}">
<w:anchorlock/>
<center style="color:${TEXT};font-family:${FONT};font-size:16px;font-weight:bold;">${text}</center>
</v:roundrect>
<![endif]--><!--[if !mso]><!-->
<table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;border-collapse:separate;">
<tr>
<td align="center" bgcolor="${FILL}" style="border-radius:${RADIUS}px;background-color:${FILL};">
<a href="${url}" target="_blank" style="display:inline-block;padding:15px 28px;border-radius:${RADIUS}px;background-color:${FILL};color:${TEXT};font-family:${FONT};font-size:16px;line-height:20px;font-weight:700;text-decoration:none;">${text}</a>
</td>
</tr>
</table>
<!--<![endif]-->`;
  return <div style={{ textAlign: "center" }} dangerouslySetInnerHTML={{ __html: html }} />;
}
