import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "../globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {NextIntlClientProvider} from 'next-intl';
import {getMessages, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {routing} from '@/i18n/routing';

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });

const SITE_URL = "https://florentvdry.github.io/spintracker";

const COPY = {
  en: {
    title: "SpinTracker - Free Open-Source Poker Tracker for Spin & Go",
    description: "Free, open-source poker tracker for Spin & Go. Import Winamax, Betclic and Unibet hand histories, find your leaks, replay hands and study ranges. 100% local.",
    ogLocale: "en_US",
  },
  fr: {
    title: "SpinTracker - Tracker Poker Gratuit et Open Source pour Spin & Go",
    description: "Tracker poker gratuit et open source pour les Spin & Go. Importez vos mains Winamax, Betclic et Unibet, détectez vos leaks, rejouez vos mains et étudiez vos ranges. 100% local.",
    ogLocale: "fr_FR",
  },
} as const;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const copy = COPY[locale as keyof typeof COPY] ?? COPY.en;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: copy.title, template: "%s | SpinTracker" },
    description: copy.description,
    keywords: ["poker tracker", "spin and go tracker", "spin tracker", "hand history", "poker analysis", "open source poker", "free poker tracker", "winamax", "betclic", "unibet", "range research", "poker replayer", "leak finder"],
    authors: [{ name: "SpinTracker contributors" }],
    creator: "SpinTracker",
    alternates: {
      canonical: `${SITE_URL}/${locale}/`,
      languages: { en: `${SITE_URL}/en/`, fr: `${SITE_URL}/fr/`, "x-default": `${SITE_URL}/en/` },
    },
    openGraph: {
      type: "website",
      locale: copy.ogLocale,
      url: `${SITE_URL}/${locale}/`,
      siteName: "SpinTracker",
      title: copy.title,
      description: copy.description,
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1920, height: 1080, alt: "SpinTracker dashboard" }],
    },
    twitter: { card: "summary_large_image", title: copy.title, description: copy.description, images: [`${SITE_URL}/og-image.png`] },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}>) {
  const { locale } = await params;
  const messages = await getMessages({ locale });

  return (
    <html lang={locale} className={`dark ${inter.variable} ${grotesk.variable}`}>
      <body className="bg-ink text-white font-sans antialiased min-h-screen flex flex-col">
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
