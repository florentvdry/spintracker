"use client";

import { motion } from "framer-motion";
import { buttonStyles } from "./ui/Button";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import Image from "next/image";
import dashboardImg from "../assets/img/dashboard.png";

export function Hero() {
  const t = useTranslations("Hero");
  return (
    <section className="relative pt-36 pb-10 md:pt-44 overflow-hidden">
      <div className="absolute -top-64 left-1/2 -translate-x-1/2 w-[1040px] max-w-[160vw] h-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(45,212,167,0.28),rgba(59,130,246,0.12)_55%,transparent)] pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 relative z-10 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2.5 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-[#7ee8c8]">
            <span className="h-2 w-2 rounded-full bg-brand" />
            {t("badge")}
          </div>

          <h1 className="mx-auto mt-7 max-w-4xl font-display text-5xl md:text-7xl lg:text-[84px] font-bold leading-[1.02] tracking-[-0.035em]">
            {t("title")} <span className="text-brand">{t("subtitle")}</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg md:text-xl leading-relaxed text-soft">{t("description")}</p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/download" className={buttonStyles({ size: "lg" })}>
              <Download className="h-5 w-5" />
              {t("download_free")}
            </Link>
            <Link href="/#features" className={buttonStyles({ variant: "outline", size: "lg" })}>
              {t("explore")}
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted">{t("compatible_rooms")}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-16 mx-auto max-w-[1080px] rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-2.5 shadow-[0_60px_120px_-30px_rgba(45,212,167,0.28),0_30px_80px_-20px_rgba(0,0,0,0.9)]"
        >
          <Image src={dashboardImg} alt="SpinTracker dashboard" priority sizes="(min-width: 1080px) 1060px, 100vw" className="block w-full h-auto rounded-[14px]" />
        </motion.div>
      </div>
    </section>
  );
}
