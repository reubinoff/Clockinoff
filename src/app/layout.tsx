import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { appearanceBootScript } from "@/lib/appearance";

function resolveMetadataBase(): URL {
  // Mirrors `publicOrigin` from `src/lib/base-url.ts`, but Next.js runs
  // this during build / server render where no Request is available, so
  // we lean on NEXTAUTH_URL and fall back to the Next.js default only
  // when it isn't set (local dev). Without this, Next.js emits
  // `http://localhost:3000` into the generated OG / Twitter tags in prod.
  const configured = process.env.NEXTAUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured);
    } catch {
      // Fall through — a malformed NEXTAUTH_URL is a config bug but we
      // still prefer the local-dev default over crashing the build.
    }
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: "Clockinoff",
    template: "%s · Clockinoff",
  },
  description: "Solo time tracker — one running timer, that's it.",
  applicationName: "Clockinoff",
  openGraph: {
    title: "Clockinoff — solo time tracker",
    description: "One running timer. That's it.",
    type: "website",
    siteName: "Clockinoff",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clockinoff — solo time tracker",
    description: "One running timer. That's it.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    // V2-10 Dark #10: the boot script sets `data-theme` (and color-scheme)
    // on <html> before first paint from `localStorage['timely.appearance']`,
    // falling back to `prefers-color-scheme`. suppressHydrationWarning is
    // required because that attribute is set client-side before React
    // reconciles the <html> element on hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // The script is a static string built from the locked appearance
          // enum; it never injects arbitrary stored values into the DOM.
          dangerouslySetInnerHTML={{ __html: appearanceBootScript() }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
