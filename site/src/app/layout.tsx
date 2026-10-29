import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { SITE } from "@/lib/links";
const TITLE = "browser-sandbox — Run agent-generated code in your web app, safely";
const DESCRIPTION =
  "@faustine-ai/browser-sandbox runs the JavaScript an agent writes inside a Worker in an opaque-origin iframe: no network, no DOM, no storage, only the functions you hand it. Approval at the bridge, real timeouts, adapters for the AI SDK, Cloudflare codemode and TanStack AI. MIT.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: "%s — browser-sandbox" },
  description: DESCRIPTION,
  applicationName: "browser-sandbox",
  keywords: [
    "browser sandbox",
    "code mode",
    "client-side tools",
    "AI SDK",
    "web worker sandbox",
    "iframe sandbox",
    "CSP",
    "prompt injection",
    "agent tools",
    "LLM generated code",
  ],
  authors: [{ name: "Faustine", url: "https://faustine.ai" }],
  creator: "Faustine",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "browser-sandbox",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: "#0b0918",
  colorScheme: "light",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "@faustine-ai/browser-sandbox",
  description: DESCRIPTION,
  programmingLanguage: "TypeScript",
  runtimePlatform: "Browser",
  license: "https://opensource.org/licenses/MIT",
  codeRepository: "https://github.com/faustine-ai/browser-sandbox",
  author: { "@type": "Organization", name: "Faustine", url: "https://faustine.ai" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-zinc-900">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
      </body>
    </html>
  );
}
