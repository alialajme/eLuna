import type { Metadata } from "next";
import { Jost, Inter, IBM_Plex_Sans_Arabic, Reem_Kufi } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const jost = Jost({ subsets: ["latin"], weight: ["300","400","500","700"], variable: "--font-jost", display: "swap" });

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const ibmArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
});

const reemKufi = Reem_Kufi({ subsets: ["arabic"], weight: ["400","500","700"], variable: "--font-reem-kufi", display: "swap" });

export const metadata: Metadata = {
  title: "AYVANA Supplier — Materials OS",
  description: "Supply materials to AYVANA's boutiques",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" dir="ltr" className={`${jost.variable} ${inter.variable} ${ibmArabic.variable} ${reemKufi.variable}`}>
        <body className="bg-ivory font-sans text-ink antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
