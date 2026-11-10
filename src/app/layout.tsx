import localFont from "next/font/local";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import type { Metadata, Viewport } from "next";

const jakarta = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-jakarta",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Secret Santa", template: "%s | Secret Santa" },
  description: "A little holiday magic for the people you love.",
  applicationName: "Secret Santa",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Secret Santa" },
  formatDetection: { telephone: false },
  openGraph: { type: "website", locale: "en_US", siteName: "Secret Santa", title: "Secret Santa", description: "A little holiday magic for the people you love." },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "oklch(0.985 0.004 200)" },
    { media: "(prefers-color-scheme: dark)", color: "oklch(0.17 0.03 175)" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${jakarta.variable} flex min-h-screen flex-col antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SiteHeader />
          <main id="main-content" className="relative flex-1">{children}</main>
          <SiteFooter />
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
