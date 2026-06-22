import type { Metadata } from "next";
import { Bodoni_Moda, Hanken_Grotesk, IBM_Plex_Sans_Arabic } from "next/font/google";
import { RTLProvider, LunaChatWidget } from "@e-luna/ui";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";
import "./globals.css";

const hasClerkKeys = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-bodoni",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const ibmArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Luna — The Gulf's AI-powered abaya marketplace",
  description: "Discover abayas styled for you by AI",
};

// ClerkProvider is only imported when keys are present
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ClerkProvider = hasClerkKeys ? require("@clerk/nextjs").ClerkProvider : null;

function MaybeClerkProvider({ children }: { children: React.ReactNode }) {
  if (!ClerkProvider) return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <MaybeClerkProvider>
      <html lang="en" dir="ltr" className={`${bodoni.variable} ${hanken.variable} ${ibmArabic.variable}`}>
        <body className="bg-ivory font-sans text-ink antialiased">
          <RTLProvider>
            <Nav />
            <main>{children}</main>
            <Footer />
            <LunaChatWidget apiPath="/api/chat" />
          </RTLProvider>
        </body>
      </html>
    </MaybeClerkProvider>
  );
}
