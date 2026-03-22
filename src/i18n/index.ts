import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'
import en   from './locales/en.json'
import ja   from './locales/ja.json'
import ko   from './locales/ko.json'
import fr   from './locales/fr.json'
import de   from './locales/de.json'
import es   from './locales/es.json'
import pt   from './locales/pt.json'
import ru   from './locales/ru.json'
import ar   from './locales/ar.json'
import hi   from './locales/hi.json'
import id   from './locales/id.json'
import th   from './locales/th.json'
import vi   from './locales/vi.json'
import it   from './locales/it.json'

export interface LangMeta {
  code: string
  label: string
  flag: string
  rtl?: boolean
}

export const LANGUAGES: LangMeta[] = [
  { code: 'zh-CN', label: '简体中文',        flag: '🇨🇳' },
  { code: 'zh-TW', label: '繁體中文',        flag: '🇹🇼' },
  { code: 'en',    label: 'English',         flag: '🇺🇸' },
  { code: 'ja',    label: '日本語',          flag: '🇯🇵' },
  { code: 'ko',    label: '한국어',          flag: '🇰🇷' },
  { code: 'fr',    label: 'Français',        flag: '🇫🇷' },
  { code: 'de',    label: 'Deutsch',         flag: '🇩🇪' },
  { code: 'es',    label: 'Español',         flag: '🇪🇸' },
  { code: 'pt',    label: 'Português',       flag: '🇧🇷' },
  { code: 'ru',    label: 'Русский',         flag: '🇷🇺' },
  { code: 'ar',    label: 'العربية',         flag: '🇸🇦', rtl: true },
  { code: 'hi',    label: 'हिन्दी',          flag: '🇮🇳' },
  { code: 'id',    label: 'Bahasa Indonesia',flag: '🇮🇩' },
  { code: 'th',    label: 'ไทย',            flag: '🇹🇭' },
  { code: 'vi',    label: 'Tiếng Việt',     flag: '🇻🇳' },
  { code: 'it',    label: 'Italiano',        flag: '🇮🇹' },
]

export const RTL_LANGS = new Set(LANGUAGES.filter(l => l.rtl).map(l => l.code))

export function isRtl(lang: string): boolean {
  return RTL_LANGS.has(lang)
}

const STORAGE_KEY = 'clawpilot_lang'
const savedLang = localStorage.getItem(STORAGE_KEY) ?? 'zh-CN'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'zh-TW': { translation: zhTW },
      en:      { translation: en },
      ja:      { translation: ja },
      ko:      { translation: ko },
      fr:      { translation: fr },
      de:      { translation: de },
      es:      { translation: es },
      pt:      { translation: pt },
      ru:      { translation: ru },
      ar:      { translation: ar },
      hi:      { translation: hi },
      id:      { translation: id },
      th:      { translation: th },
      vi:      { translation: vi },
      it:      { translation: it },
    },
    lng: savedLang,
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
  })

// Apply RTL direction to <html> on startup
applyDir(savedLang)

export function setLanguage(lang: string) {
  i18n.changeLanguage(lang)
  localStorage.setItem(STORAGE_KEY, lang)
  applyDir(lang)
}

function applyDir(lang: string) {
  document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr'
  document.documentElement.lang = lang
}

export default i18n
