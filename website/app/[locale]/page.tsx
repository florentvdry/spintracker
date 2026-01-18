import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { Screenshots } from "@/components/Screenshots";
import { getTranslations } from "next-intl/server";

export default async function Home() {
  const t = await getTranslations('CTA');
  return (
    <div className="flex flex-col min-h-screen">
      <Hero />
      <Features />
      <Screenshots />
      
      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-b from-black to-blue-950/20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">
            {t('title')}
          </h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            {t('description')}
          </p>
          <a href="/download" className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
            {t('button')}
          </a>
        </div>
      </section>
    </div>
  );
}
