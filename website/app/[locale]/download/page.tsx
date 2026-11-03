import { buttonStyles } from "@/components/ui/Button";
import { Download, Monitor, Apple } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function DownloadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Download' });

  return (
    <div className="relative min-h-screen overflow-hidden pt-36 pb-20">
      <div className="absolute -top-72 left-1/2 -translate-x-1/2 w-[960px] max-w-[160vw] h-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(45,212,167,0.24),rgba(59,130,246,0.1)_55%,transparent)] pointer-events-none" />
      <div className="container relative mx-auto max-w-4xl px-4 md:px-6 text-center">
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] tracking-[-0.035em]">{t('title')}</h1>

        <div className="mt-14 grid gap-5 md:grid-cols-2 text-left">
          <div className="flex flex-col rounded-[28px] border border-brand/30 bg-gradient-to-b from-brand/10 to-panel to-60% p-9">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15 text-brand">
              <Monitor className="h-7 w-7" />
            </div>
            <h2 className="mt-6 font-display text-3xl font-semibold tracking-[-0.02em]">{t('windows.title')}</h2>
            <p className="mt-2 text-soft">{t('windows.requirements')}</p>
            <a
              href="https://github.com/florentvdry/spintracker/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonStyles({ size: "lg", className: "mt-8 w-full" })}
            >
              <Download className="h-5 w-5" />
              {t('windows.button')}
            </a>
            <p className="mt-4 text-center text-sm text-[#8a94a6]">{t('windows.info')}</p>
          </div>

          <div className="flex flex-col rounded-[28px] border border-dashed border-line-strong bg-[#0a0f17] p-9">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-muted">
              <Apple className="h-7 w-7" />
            </div>
            <h2 className="mt-6 font-display text-3xl font-semibold tracking-[-0.02em]">{t('mac.title')}</h2>
            <p className="mt-2 text-soft">{t('mac.status')}</p>
            <div
              aria-disabled="true"
              className="mt-8 flex h-14 items-center justify-center rounded-full border border-line-strong text-lg font-medium text-[#8a94a6]"
            >
              {t('mac.button')}
            </div>
          </div>
        </div>

        <div className="mt-20 border-t border-line pt-14 text-left">
          <h3 className="text-center font-display text-3xl font-semibold tracking-[-0.02em]">{t('requirements.title')}</h3>
          <div className="mt-9 grid gap-5 md:grid-cols-2">
            <div className="rounded-[20px] border border-line bg-panel p-7">
              <h4 className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{t('requirements.min')}</h4>
              <ul className="mt-5 space-y-3 text-[15px] text-[#d5dbe5]">
                <li>{t('requirements.os_win')}</li>
                <li>{t('requirements.cpu_i3')}</li>
                <li>{t('requirements.ram_4gb')}</li>
                <li>{t('requirements.storage_2gb')}</li>
              </ul>
            </div>
            <div className="rounded-[20px] border border-brand/25 bg-panel p-7">
              <h4 className="text-xs font-semibold tracking-[0.14em] text-brand uppercase">{t('requirements.rec')}</h4>
              <ul className="mt-5 space-y-3 text-[15px] text-[#d5dbe5]">
                <li>{t('requirements.os_win11')}</li>
                <li>{t('requirements.cpu_i5')}</li>
                <li>{t('requirements.ram_8gb')}</li>
                <li>{t('requirements.storage_2gb')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
