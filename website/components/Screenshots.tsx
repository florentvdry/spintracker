"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

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
          {/* Feature 1 */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
             <div className="order-2 md:order-1">
                <h3 className="text-2xl font-bold text-white mb-4">{t('hud.title')}</h3>
                <p className="text-gray-400 text-lg mb-6">
                  {t('hud.description')}
                </p>
                <ul className="space-y-2 text-gray-400">
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    {t('hud.list.positional')}
                  </li>
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    {t('hud.list.vs_hero')}
                  </li>
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    {t('hud.list.pot_odds')}
                  </li>
                </ul>
             </div>
             <motion.div 
               initial={{ opacity: 0, x: 20 }}
               whileInView={{ opacity: 1, x: 0 }}
               viewport={{ once: true }}
               className="order-1 md:order-2 bg-gray-900 aspect-video rounded-xl border border-white/10 flex items-center justify-center relative overflow-hidden group"
             >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
                <span className="text-gray-600 font-medium">{t('hud.alt')}</span>
             </motion.div>
          </div>

          {/* Feature 2 */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
             <motion.div 
               initial={{ opacity: 0, x: -20 }}
               whileInView={{ opacity: 1, x: 0 }}
               viewport={{ once: true }}
               className="bg-gray-900 aspect-video rounded-xl border border-white/10 flex items-center justify-center relative overflow-hidden"
             >
                <div className="absolute inset-0 bg-gradient-to-tr from-green-500/5 to-blue-500/5" />
                <span className="text-gray-600 font-medium">{t('replayer.alt')}</span>
             </motion.div>
             <div>
                <h3 className="text-2xl font-bold text-white mb-4">{t('replayer.title')}</h3>
                <p className="text-gray-400 text-lg mb-6">
                  {t('replayer.description')}
                </p>
                <ul className="space-y-2 text-gray-400">
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    {t('replayer.list.equity')}
                  </li>
                  <li className="flex items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    {t('replayer.list.range')}
                  </li>
                </ul>
             </div>
          </div>
        </div>
      </div>
    </section>
  );
}
