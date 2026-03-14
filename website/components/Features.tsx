"use client";

import { motion } from "framer-motion";
import { BarChart2, Users, Target, Database, History, Settings, PlayCircle } from "lucide-react";
import { useTranslations } from "next-intl";

export function Features() {
  const t = useTranslations('Features');

  const features = [
    {
      icon: BarChart2,
      title: t('items.dashboard.title'),
      description: t('items.dashboard.description'),
    },
    {
      icon: History,
      title: t('items.handhistory.title'),
      description: t('items.handhistory.description'),
    },
    {
      icon: Target,
      title: t('items.analysis.title'),
      description: t('items.analysis.description'),
    },
    {
      icon: PlayCircle,
      title: t('items.replayer.title'),
      description: t('items.replayer.description'),
    },
    {
      icon: Users,
      title: t('items.range.title'),
      description: t('items.range.description'),
    },
    {
      icon: Settings,
      title: t('items.settings.title'),
      description: t('items.settings.description'),
    },
  ];

  return (
    <section id="features" className="py-20 md:py-32 bg-black relative">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            {t('title')}
          </h2>
          <p className="text-gray-400 text-lg">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="p-6 rounded-2xl bg-gray-900/50 border border-white/5 hover:border-blue-500/30 transition-colors group"
            >
              <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                <feature.icon className="h-6 w-6 text-blue-500" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-gray-400 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
