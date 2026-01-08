"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useState, useRef, useEffect } from "react";
import { Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleDropdown = () => setIsOpen(!isOpen);

  const switchLocale = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5"
      >
        <Globe className="h-5 w-5" />
        <span className="uppercase text-sm font-medium">{locale}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute right-0 mt-2 w-32 bg-gray-900 border border-white/10 rounded-xl overflow-hidden shadow-xl z-50"
          >
            <div className="py-1">
              <button
                onClick={() => switchLocale("en")}
                className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-3 hover:bg-white/5 transition-colors ${
                  locale === "en" ? "text-blue-500" : "text-gray-300"
                }`}
              >
                <span>🇬🇧</span>
                <span>English</span>
              </button>
              <button
                onClick={() => switchLocale("fr")}
                className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-3 hover:bg-white/5 transition-colors ${
                  locale === "fr" ? "text-blue-500" : "text-gray-300"
                }`}
              >
                <span>🇫🇷</span>
                <span>Français</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}