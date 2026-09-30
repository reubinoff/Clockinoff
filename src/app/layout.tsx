import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { appearanceBootScript } from "@/lib/appearance";

export const metadata: Metadata = {
  title: {
    default: "Timely",
    template: "%s · Timely",
  },
  description: "Solo time tracker — one running timer, that's it.",
  applicationName: "Timely",
  openGraph: {
    title: "Timely — solo time tracker",
    description: "One running timer. That's it.",
    type: "website",
    siteName: "Timely",
  },
  twitter: {
    card: "summary_large_image",
    title: "Timely — solo time tracker",
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
