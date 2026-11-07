"use client";

import { motion } from "framer-motion";
import { BarChart2, Users, Target, History, Settings, PlayCircle, PanelsTopLeft, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function Features() {
  const t = useTranslations("Features");
  const nav = useTranslations("Navbar");

  const features = [
    { icon: BarChart2, key: "dashboard", wide: true, tint: "brand" },
    { icon: History, key: "handhistory", tint: "blue" },
    { icon: Target, key: "analysis", tint: "brand" },
    { icon: PlayCircle, key: "replayer", tint: "blue" },
    { icon: Users, key: "range", tint: "brand" },
    { icon: PanelsTopLeft, key: "hud", wide: true, tint: "blue" },
    { icon: SlidersHorizontal, key: "customstats", tint: "brand" },
    { icon: Settings, key: "settings", full: true, tint: "brand" },
  ];

  return (
    <section id="features" className="relative py-24 md:py-36">
      <div className="container mx-auto px-4 md:px-6 max-w-[1200px]">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold tracking-[0.14em] text-brand uppercase">{nav("features")}</div>
          <h2 className="mt-3.5 font-display text-4xl md:text-5xl font-bold leading-[1.08] tracking-[-0.03em]">{t("title")}</h2>
          <p className="mt-5 text-lg leading-relaxed text-soft">{t("subtitle")}</p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className={cn(
                "group flex flex-col gap-3.5 rounded-3xl border border-line bg-panel p-8 transition-colors hover:border-brand/40",
                f.wide && "md:col-span-2",
                f.full && "md:col-span-3"
              )}
            >
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-2xl",
                  f.tint === "brand" ? "bg-brand/12 text-brand" : "bg-brand-blue/15 text-[#7db0fb]"
                )}
              >
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className={cn("mt-2 font-display font-semibold tracking-[-0.02em]", f.wide || f.full ? "text-2xl" : "text-[22px]")}>
                {t(`items.${f.key}.title`)}
              </h3>
              <p className="max-w-xl leading-relaxed text-[#a3adbc]">{t(`items.${f.key}.description`)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
