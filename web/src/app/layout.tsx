import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import ExperienceShell from "@/components/experience/ExperienceShell";
import { ExperienceProvider } from "@/components/experience/ExperienceProvider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CivicSim — Neighborhood Decision Studio",
  description: "Test neighborhood decisions before they are built.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ExperienceProvider>
          <ExperienceShell>{children}</ExperienceShell>
        </ExperienceProvider>
      </body>
    </html>
  );
}
