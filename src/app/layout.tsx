import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
