"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { Menu, X, Download } from "lucide-react";
import Image from "next/image";
import logoImg from "../assets/img/logo.png";
import { cn } from "@/lib/utils";
import { buttonStyles } from "./ui/Button";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Navbar() {
  const t = useTranslations("Navbar");
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "/#features", label: t("features") },
    { href: "/#screenshots", label: t("screenshots") },
  ];

  return (
    <header className="fixed top-0 inset-x-0 z-50 px-3 pt-3 md:pt-4">
      <nav
        className={cn(
          "mx-auto max-w-5xl rounded-3xl md:rounded-full border transition-all duration-300",
          scrolled || isOpen
            ? "border-line-strong bg-ink/75 backdrop-blur-xl shadow-[0_10px_40px_-12px_rgba(0,0,0,0.8)]"
            : "border-transparent bg-transparent"
        )}
      >
        <div className="flex items-center justify-between h-14 pl-3 pr-2 md:pl-4">
          <Link href="/" className="flex items-center gap-2.5" onClick={() => setIsOpen(false)}>
            <Image src={logoImg} alt="" width={36} height={36} className="object-contain" />
            <span className="font-display text-lg font-semibold tracking-tight">
              Spin<span className="text-brand">Tracker</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="px-4 py-2 text-sm text-muted hover:text-white rounded-full hover:bg-white/5 transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-1">
            <LanguageSwitcher />
            <Link href="/download" className={buttonStyles({ size: "sm" })}>
              <Download className="h-4 w-4" />
              {t("download")}
            </Link>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <LanguageSwitcher />
            <button
              className="p-2 text-soft hover:text-white rounded-full hover:bg-white/5"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Menu"
              aria-expanded={isOpen}
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="md:hidden border-t border-line px-4 py-4 space-y-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setIsOpen(false)}
                className="block px-3 py-3 rounded-xl text-soft hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/download"
              onClick={() => setIsOpen(false)}
              className={buttonStyles({ className: "w-full mt-3" })}
            >
              <Download className="h-4 w-4" />
              {t("download")}
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
