import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "CivicSim — South LA",
  description:
    "A participatory urban digital twin for testing neighborhood decisions before they are built.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
