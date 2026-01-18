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
          {/* Feature 2 */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
             <motion.div 
               initial={{ opacity: 0, x: -20 }}
               whileInView={{ opacity: 1, x: 0 }}
               viewport={{ once: true }}
               className="bg-gray-900 aspect-video rounded-xl border border-white/10 flex items-center justify-center relative overflow-hidden"
             >
               <Image src={replayerImg} alt={t('replayer.alt')} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-bottom" />
                <div className="absolute inset-0 bg-gradient-to-tr from-green-500/10 to-blue-500/10 pointer-events-none" />
             </motion.div>
             <div>
                <h3 className="text-2xl font-bold text-white mb-4">{t('replayer.title')}</h3>
                <p className="text-gray-400 text-lg mb-6">
                  {t('replayer.description')}
                </p>
                <ul className="space-y-2 text-gray-400">
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    {t('replayer.list.analyze')}
                  </li>
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    {t('replayer.list.export')}
                  </li>
                </ul>
             </div>

          </div>

          {/* Feature 3 */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
             <div className="order-2 md:order-1">
                <h3 className="text-2xl font-bold text-white mb-4">{t('range_research.title')}</h3>
                <p className="text-gray-400 text-lg mb-6">{t('range_research.description')}</p>
             </div>
             <motion.div 
               initial={{ opacity: 0, x: 20 }}
               whileInView={{ opacity: 1, x: 0 }}
               viewport={{ once: true }}
               className="order-1 md:order-2 bg-gray-900 aspect-video rounded-xl border border-white/10 flex items-center justify-center relative overflow-hidden"
             >
               <Image src={rangeResearchImg} alt={t('range_research.alt') || 'Range Research'} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-left-top" />
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 pointer-events-none" />
             </motion.div>
          </div>
          </div>
        </div>
    </section>
  );
}
