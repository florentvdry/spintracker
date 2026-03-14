import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "SpinTracker - Le Tracker Poker pour les Spins",
    template: "%s | SpinTracker"
  },
  description: "Analysez votre jeu, identifiez vos fuites et améliorez vos performances avec SpinTracker. Compatible Betclic. Dashboard, Replayer, Analyse de range et plus.",
  keywords: ["poker tracker", "spin tracker", "hand history", "poker analysis", "poker software", "betclic", "poker tools", "range research", "poker replayer"],
  authors: [{ name: "SpinTracker" }],
  creator: "SpinTracker",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "https://spintracker.com",
    siteName: "SpinTracker",
    title: "SpinTracker - Le Tracker Poker pour les Spins",
    description: "Analysez votre jeu, identifiez vos fuites et améliorez vos performances avec SpinTracker.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "SpinTracker - Poker Tracking Software"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "SpinTracker - Le Tracker Poker pour les Spins",
    description: "Analysez votre jeu, identifiez vos fuites et améliorez vos performances avec SpinTracker.",
    images: ["/og-image.png"]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  }
};

export default async function LocaleLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}>) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html lang={locale} className="dark">
      <body className={`${inter.className} bg-black text-white antialiased min-h-screen flex flex-col`}>
        <NextIntlClientProvider messages={messages}>
          <Navbar />
          <main className="flex-grow">
            {children}
          </main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
