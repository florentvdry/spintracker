import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en/translation.json'
import es from './locales/es/translation.json'
import fr from './locales/fr/translation.json'
import it from './locales/it/translation.json'
import pt from './locales/pt/translation.json'

/** Languages of the interface: the code and the name in that language (what the selector shows). */
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
] as const

const LANGUAGE_STORAGE_KEY = 'spintracker-language'
const DEFAULT_LANGUAGE = 'fr'

function storedLanguage(): string {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function setLanguage(language: string): void {
  void i18n.changeLanguage(language)
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Storage can be unavailable; the language simply will not persist.
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr }, es: { translation: es }, it: { translation: it }, pt: { translation: pt } },
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
