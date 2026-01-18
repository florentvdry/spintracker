import { getTranslations } from "next-intl/server";
import { FileText, CheckCircle, AlertTriangle, XCircle, Info, Mail } from "lucide-react";

export default async function TermsPage() {
  const t = await getTranslations('Terms');
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[300px] bg-blue-500/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400">
            {t('title')}
          </h1>
          <p className="text-lg md:text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            {t('intro')}
          </p>
        </div>
      </section>

      {/* Content Sections */}
      <div className="container mx-auto px-4 pb-20 max-w-4xl">
        <div className="space-y-8">
          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <CheckCircle className="h-8 w-8 text-blue-400 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-semibold mb-4 text-white">{t('acceptance.title')}</h2>
                <p className="text-gray-300 leading-relaxed">{t('acceptance.content')}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <FileText className="h-8 w-8 text-blue-400 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-semibold mb-4 text-white">{t('useLicense.title')}</h2>
                <p className="text-gray-300 leading-relaxed">{t('useLicense.content')}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-8 w-8 text-blue-400 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-semibold mb-4 text-white">{t('restrictions.title')}</h2>
                <p className="text-gray-300 leading-relaxed">{t('restrictions.content')}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <XCircle className="h-8 w-8 text-blue-400 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-semibold mb-4 text-white">{t('termination.title')}</h2>
                <p className="text-gray-300 leading-relaxed">{t('termination.content')}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <Info className="h-8 w-8 text-blue-400 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-semibold mb-4 text-white">{t('disclaimer.title')}</h2>
                <p className="text-gray-300 leading-relaxed">{t('disclaimer.content')}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <Info className="h-8 w-8 text-blue-400 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-semibold mb-4 text-white">{t('updates.title')}</h2>
                <p className="text-gray-300 leading-relaxed">{t('updates.content')}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <Mail className="h-8 w-8 text-blue-400 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-semibold mb-4 text-white">{t('contact.title')}</h2>
                <p className="text-gray-300 leading-relaxed">{t('contact.content')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}