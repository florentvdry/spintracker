"use client";

import { motion } from "framer-motion";
import { Button } from "./ui/Button";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Download } from "lucide-react";
import Image from "next/image";
import dashboardImg from "../assets/img/dashboard.jpg";

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
          <p className="text-sm md:text-base text-gray-500 mb-8 max-w-2xl mx-auto">
            {t('compatible_rooms')}
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/download">
              <Button size="lg" className="group">
                <Download className="mr-2 h-5 w-5" />
                {t('download_free')}
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
              <Image src={dashboardImg} alt="Dashboard" fill className="w-full" />
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 pointer-events-none" />
             </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
