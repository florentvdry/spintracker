"use client";

import { motion } from "framer-motion";
import { Button } from "./ui/Button";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Download } from "lucide-react";

export function Hero() {
  const t = useTranslations('Hero');
  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-blue-500/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400">
            {t('title')} <br className="hidden md:block" />
            {t('subtitle')}
          </h1>
          <p className="text-lg md:text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            {t('description')}
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/download">
              <Button size="lg" className="group">
                <Download className="mr-2 h-5 w-5" />
                {t('download_free')}
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="secondary" size="lg" className="group">
                {t('explore_features')}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Hero Image Placeholder */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-16 md:mt-24 relative"
        >
          <div className="relative rounded-xl border border-white/10 bg-gray-900/50 backdrop-blur-sm p-2 md:p-4 shadow-2xl shadow-blue-500/10 max-w-5xl mx-auto">
             <div className="aspect-[16/9] rounded-lg bg-gray-800 overflow-hidden relative group">
                {/* Placeholder for screenshot */}
                <div className="absolute inset-0 flex items-center justify-center text-gray-600">
                    <span className="text-lg">Dashboard Screenshot</span>
                </div>
                 {/*  Use a real image if available later */}
                 {/* <Image src="/dashboard.png" alt="Dashboard" fill className="object-cover" /> */}
             </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
