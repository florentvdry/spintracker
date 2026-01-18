import { Link } from "@/i18n/navigation";
import { BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDiscord } from '@fortawesome/free-brands-svg-icons';

export function Footer() {
  const t = useTranslations('Footer');

  return (
    <footer className="bg-black border-t border-white/10 py-12 md:py-16">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="space-y-4">
            <Link href="/" className="flex items-center space-x-2">
              <BarChart3 className="h-6 w-6 text-blue-500" />
              <span className="text-lg font-bold text-white">SpinTracker</span>
            </Link>
            <p className="text-sm text-gray-400 max-w-xs">
              {t('description')}
            </p>
          </div>

          <div>
          </div>

          <div>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">{t('legal')}</h3>
            <ul className="space-y-2">
              <li><Link href="/privacy" className="text-sm text-gray-400 hover:text-white">{t('links.privacy')}</Link></li>
              <li><Link href="/terms" className="text-sm text-gray-400 hover:text-white">{t('links.terms')}</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/10">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} SpinTracker. {t('rights')}
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a
              href="https://discord.gg/x9ZSQA2mN2"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              className="text-gray-400 hover:text-white"
            >
              <FontAwesomeIcon icon={faDiscord} className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
