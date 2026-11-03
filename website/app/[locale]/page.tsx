import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { Screenshots } from "@/components/Screenshots";
import { Link } from "@/i18n/navigation";
import { buttonStyles } from "@/components/ui/Button";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "CTA" });
  return (
    <div className="flex flex-col min-h-screen">
      <Hero />
      <Features />
      <Screenshots />

      <section className="py-24 md:py-32">
        <div className="container mx-auto px-4 md:px-6 max-w-[1200px]">
          <div className="rounded-[32px] border border-brand/25 bg-[radial-gradient(ellipse_at_50%_0%,rgba(45,212,167,0.22),rgba(59,130,246,0.08)_50%,#0a1018_80%)] px-6 py-16 md:py-20 text-center">
            <h2 className="mx-auto max-w-3xl font-display text-4xl md:text-5xl font-bold leading-[1.1] tracking-[-0.03em]">{t("title")}</h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-soft">{t("description")}</p>
            <Link href="/download" className={buttonStyles({ size: "lg", className: "mt-9" })}>
              {t("button")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
