import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import logoImg from "../assets/img/logo.png";

export function Footer() {
  const t = useTranslations("Footer");

  return (
    <footer className="border-t border-line">
      <div className="container mx-auto px-4 md:px-6 max-w-[1200px] pt-12 pb-10">
        <div className="flex flex-wrap justify-between gap-10">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src={logoImg} alt="" width={36} height={36} className="object-contain" />
              <span className="font-display text-xl font-semibold">
                Spin<span className="text-brand">Tracker</span>
              </span>
            </Link>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">{t("description")}</p>
          </div>

          <div>
            <h3 className="mb-4 font-semibold text-white">{t("legal")}</h3>
            <ul className="space-y-3 text-[15px] text-muted">
              <li><Link href="/privacy" className="hover:text-white transition-colors">{t("links.privacy")}</Link></li>
              <li><Link href="/terms" className="hover:text-white transition-colors">{t("links.terms")}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm text-[#8a94a6]">
          <p>© {new Date().getFullYear()} SpinTracker. {t("rights")}</p>
          <a
            href="https://discord.gg/x9ZSQA2mN2"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
            className="inline-flex items-center gap-2 hover:text-white transition-colors"
          >
            <FontAwesomeIcon icon={faDiscord} className="h-5 w-5" />
            Discord
          </a>
        </div>
      </div>
    </footer>
  );
}
