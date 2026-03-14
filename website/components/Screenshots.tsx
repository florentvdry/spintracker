"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Image from "next/image";
import dashboardImg from "../assets/img/dashboard.jpg";
import historyImg from "../assets/img/history.jpg";
import rangeResearchImg from "../assets/img/range_research.jpg";
import replayerImg from "../assets/img/replayer.jpg";
import analysisImg from "../assets/img/analysis.jpg";
import statsBuilderImg from "../assets/img/stats_builder.jpg";

export function Screenshots() {
  const t = useTranslations('Screenshots');

  const screenshots = [
    {
      image: dashboardImg,
      alt: t('dashboard.alt'),
      title: t('dashboard.title'),
      description: t('dashboard.description'),
      items: [t('dashboard.list.sessions'), t('dashboard.list.winrate'), t('dashboard.list.stats')],
      reverse: false,
    },
    {
      image: historyImg,
      alt: t('handhistory.alt'),
      title: t('handhistory.title'),
      description: t('handhistory.description'),
      items: [t('handhistory.list.filters'), t('handhistory.list.tournaments'), t('handhistory.list.export')],
      reverse: true,
    },
    {
      image: analysisImg,
      alt: t('analysis.alt'),
      title: t('analysis.title'),
      description: t('analysis.description'),
      items: [t('analysis.list.situations'), t('analysis.list.leaks'), t('analysis.list.filters')],
      reverse: false,
    },
    {
      image: replayerImg,
      alt: t('replayer.alt'),
      title: t('replayer.title'),
      description: t('replayer.description'),
      items: [t('replayer.list.analyze'), t('replayer.list.export')],
      reverse: true,
    },
    {
      image: rangeResearchImg,
      alt: t('range_research.alt'),
      title: t('range_research.title'),
      description: t('range_research.description'),
      items: [t('range_research.list.grid'), t('range_research.list.compare')],
      reverse: false,
    },
  ];

  return (
    <section id="screenshots" className="py-20 md:py-32 bg-gray-950">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white">
            {t('title')}
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl">
            {t('subtitle')}
          </p>
        </div>

        <div className="space-y-24">
          {screenshots.map((screenshot, index) => (
            <div key={index} className={`grid md:grid-cols-2 gap-12 items-center ${screenshot.reverse ? 'md:flex-row-reverse' : ''}`}>
              <motion.div 
                initial={{ opacity: 0, x: screenshot.reverse ? 20 : -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className={`bg-gray-900 aspect-video rounded-xl border border-white/10 flex items-center justify-center relative overflow-hidden ${screenshot.reverse ? 'md:order-2' : ''}`}
              >
                <Image src={screenshot.image} alt={screenshot.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
                 <div className="absolute inset-0 bg-gradient-to-tr from-green-500/10 to-blue-500/10 pointer-events-none" />
              </motion.div>
              <div className={screenshot.reverse ? 'md:order-1' : ''}>
                 <h3 className="text-2xl font-bold text-white mb-4">{screenshot.title}</h3>
                 <p className="text-gray-400 text-lg mb-6">
                   {screenshot.description}
                 </p>
                 <ul className="space-y-2 text-gray-400">
                   {screenshot.items.map((item, i) => (
                     <li key={i} className="flex items-center">
                       <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                       {item}
                     </li>
                   ))}
                 </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
