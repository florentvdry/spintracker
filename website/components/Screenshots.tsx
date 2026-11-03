"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Image from "next/image";
import historyImg from "../assets/img/history.png";
import statsImg from "../assets/img/stats.png";
import replayerImg from "../assets/img/replayer.png";
import rangesImg from "../assets/img/ranges.png";
import { cn } from "@/lib/utils";

export function Screenshots() {
  const t = useTranslations("Screenshots");
  const nav = useTranslations("Navbar");

  const shots = [
    { key: "handhistory", image: historyImg, items: ["filters", "tournaments", "export"] },
    { key: "analysis", image: statsImg, items: ["situations", "leaks", "filters"] },
    { key: "replayer", image: replayerImg, items: ["analyze", "export"] },
    { key: "range_research", image: rangesImg, items: ["grid", "compare"] },
  ];

  return (
    <section id="screenshots" className="py-12 md:py-24">
      <div className="container mx-auto px-4 md:px-6 max-w-[1200px]">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold tracking-[0.14em] text-brand uppercase">{nav("screenshots")}</div>
          <h2 className="mt-3.5 font-display text-4xl md:text-5xl font-bold leading-[1.08] tracking-[-0.03em]">{t("title")}</h2>
          <p className="mt-5 text-lg leading-relaxed text-soft">{t("subtitle")}</p>
        </div>

        <div className="mt-16 flex flex-col gap-24">
          {shots.map((s, i) => (
            <div key={s.key} className="flex flex-wrap items-center gap-12">
              <div className={cn("flex-1 basis-[360px] min-w-0", i % 2 === 1 && "md:order-2")}>
                <h3 className="font-display text-3xl font-semibold tracking-[-0.025em]">{t(`${s.key}.title`)}</h3>
                <p className="mt-4 text-[17px] leading-relaxed text-[#a3adbc]">{t(`${s.key}.description`)}</p>
                <ul className="mt-6 flex flex-col gap-3 text-[#d5dbe5]">
                  {s.items.map((it) => (
                    <li key={it} className="flex items-center gap-3">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      {t(`${s.key}.list.${it}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className={cn(
                  "flex-[1.5] basis-[480px] min-w-0 rounded-[18px] border border-white/10 bg-white/[0.04] p-2",
                  i % 2 === 1 && "md:order-1"
                )}
              >
                <Image src={s.image} alt={t(`${s.key}.alt`)} sizes="(min-width: 1200px) 700px, 100vw" className="block w-full h-auto rounded-[11px]" />
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
