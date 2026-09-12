import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

// The same typefaces as the main app, so the board reads as part of CivicSim.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CivicSim Scan",
  description: "Photograph a street issue and see what fixing it would change.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3eee4",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
