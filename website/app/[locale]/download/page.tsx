'use client';

import { Button } from "@/components/ui/Button";
import { Download, Monitor, Apple } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from 'next/navigation';

export default function DownloadPage() {
  const t = useTranslations('Download');
  const locale = useParams().locale;

  return (
    <div className="pt-32 pb-20 min-h-screen bg-black">
      <div className="container mx-auto px-4 md:px-6 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400">
          {t('title')}
        </h1>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto pt-5">
          {/* Windows */}
          <div className="p-8 rounded-2xl bg-gray-900 border border-white/10 hover:border-blue-500/50 transition-colors flex flex-col items-center">
            <div className="h-16 w-16 bg-blue-600/10 rounded-full flex items-center justify-center mb-6">
              <Monitor className="h-8 w-8 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{t('windows.title')}</h2>
            <p className="text-gray-400 mb-8">{t('windows.requirements')}</p>
            <a 
              href="https://github.com/florentvdry/spintracker-releases/releases/download/v1.0.1/SpinTracker-Setup-1.0.1.exe" 
              className="w-full"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" className="w-full">
                <Download className="mr-2 h-5 w-5" />
                {t('windows.button')}
              </Button>
            </a>
            <p className="mt-4 text-xs text-gray-500">{t('windows.info')}</p>
          </div>

          {/* macOS */}
          <div className="p-8 rounded-2xl bg-gray-900 border border-white/10 hover:border-gray-700 transition-colors flex flex-col items-center opacity-75">
            <div className="h-16 w-16 bg-gray-800 rounded-full flex items-center justify-center mb-6">
              <Apple className="h-8 w-8 text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{t('mac.title')}</h2>
            <p className="text-gray-400 mb-8">{t('mac.status')}</p>
            <Button size="lg" variant="secondary" disabled className="w-full">
              <Download className="mr-2 h-5 w-5" />
              {t('mac.button')}
            </Button>
          </div>
        </div>

        <div className="mt-20 border-t border-white/10 pt-12 max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold text-white mb-6">{t('requirements.title')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
            <div>
              <h4 className="font-semibold text-white mb-2">{t('requirements.min')}</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>• {t('requirements.os_win')}</li>
                <li>• {t('requirements.cpu_i3')}</li>
                <li>• {t('requirements.ram_4gb')}</li>
                <li>• {t('requirements.storage_2gb')}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-2">{t('requirements.rec')}</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>• {t('requirements.os_win11')}</li>
                <li>• {t('requirements.cpu_i5')}</li>
                <li>• {t('requirements.ram_8gb')}</li>
                <li>• {t('requirements.storage_2gb')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
