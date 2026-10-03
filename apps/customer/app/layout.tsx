import type { Metadata } from "next";
import { Jost, Inter, IBM_Plex_Sans_Arabic, Reem_Kufi } from "next/font/google";
import dynamic from "next/dynamic";
import { RTLProvider, AyvanaChatWidget } from "@ayvana/ui";
import { getSetting } from "@ayvana/db";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";
import "./globals.css";

const hasClerkKeys = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

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
  title: "AYVANA — The Abaya Marketplace",
  description: "Curated abayas and modest luxury across the GCC",
};

// Only bundle Clerk when keys are configured — prevents client crash when keys are absent
const ClerkProviderWrapper = hasClerkKeys
  ? dynamic(() => import("./components/ClerkProviderWrapper").then((m) => m.ClerkProviderWrapper))
  : null;

function MaybeClerkProvider({ children }: { children: React.ReactNode }) {
  if (!ClerkProviderWrapper) return <>{children}</>;
  return <ClerkProviderWrapper>{children}</ClerkProviderWrapper>;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const maintenanceBanner = await getSetting("maintenance_banner");
  return (
    <MaybeClerkProvider>
      <html lang="en" dir="ltr" className={`${jost.variable} ${inter.variable} ${ibmArabic.variable} ${reemKufi.variable}`}>
        <body className="bg-ivory font-sans text-ink antialiased">
          <RTLProvider>
            {maintenanceBanner && (
              <div className="bg-gold px-4 py-2 text-center text-body-sm font-medium text-ink">
                {maintenanceBanner}
              </div>
            )}
            <Nav />
            <main>{children}</main>
            <Footer />
            <AyvanaChatWidget apiPath="/api/chat" hiddenPaths={["/chat", "/checkout"]} hiddenPrefixes={["/orders"]} agentType="SHOPPING" />
          </RTLProvider>
        </body>
      </html>
    </MaybeClerkProvider>
  );
}
