import { i18n } from '@/lib/i18n';
import { uiTranslations } from 'fumadocs-ui/i18n';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const LANGUAGES = i18n.languages;

// Translates the fumadocs UI strings in French and Arabic; English is built in. Keys are the
// official fumadocs-ui translation keys (fully qualified by the component context).
export const translations = i18n.translations().extend(uiTranslations()).add({
  fr: {
    displayName: 'Français',
    'Search(search dialog)': 'Rechercher',
    'Search(search trigger)': 'Rechercher',
    'No results found(search dialog)': 'Aucun résultat',
    'Search failed(search dialog)': 'Échec de la recherche',
    'Search failed, showing results for {query}(search dialog)':
      'Échec de la recherche, résultats pour {query}',
    'On this page(table of contents)': 'Sur cette page',
    'Table of Contents(inline table of contents)': 'Sommaire',
    'No Headings(table of contents)': 'Aucun titre',
    'Next Page(pagination)': 'Page suivante',
    'Previous Page(pagination)': 'Page précédente',
    'Page Not Found(404 page)': 'Page introuvable',
    'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)':
      'La page demandée a peut-être été supprimée, déplacée ou est temporairement indisponible.',
    'Back to Home(404 page)': "Retour à l'accueil",
    'Toggle Menu(mobile menu)(aria-label)': 'Ouvrir le menu',
    'Toggle Theme(theme switcher)(aria-label)': 'Changer de thème',
    'Light(theme switcher)(aria-label)': 'Clair',
    'Dark(theme switcher)(aria-label)': 'Sombre',
    'System(theme switcher)(aria-label)': 'Système',
    'Choose a language(language switcher)': 'Choisir une langue',
    'Choose a language(language switcher)(aria-label)': 'Choisir une langue',
    'Copy Text(code block)(aria-label)': 'Copier le texte',
    'Copied Text(code block)(aria-label)': 'Texte copié',
    'Copy Link(accordion)(aria-label)': 'Copier le lien',
    'Copied Link(accordion)(aria-label)': 'Lien copié',
    'Copy Markdown(page actions)': 'Copier en Markdown',
    'Copied Markdown(page actions)': 'Markdown copié',
    'Last updated on(page footer)': 'Dernière mise à jour le',
  },
  ar: {
    displayName: 'العربية',
    'Search(search dialog)': 'بحث',
    'Search(search trigger)': 'بحث',
    'No results found(search dialog)': 'لا توجد نتائج',
    'Search failed(search dialog)': 'فشل البحث',
    'Search failed, showing results for {query}(search dialog)': 'فشل البحث، النتائج لِـ {query}',
    'On this page(table of contents)': 'في هذه الصفحة',
    'Table of Contents(inline table of contents)': 'المحتوى',
    'No Headings(table of contents)': 'لا عناوين',
    'Next Page(pagination)': 'الصفحة التالية',
    'Previous Page(pagination)': 'الصفحة السابقة',
    'Page Not Found(404 page)': 'الصفحة غير موجودة',
    'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)':
      'قد تكون الصفحة المطلوبة قد حُذفت أو تغيّر مسارها أو أنها غير متاحة مؤقتًا.',
    'Back to Home(404 page)': 'العودة للرئيسية',
    'Toggle Menu(mobile menu)(aria-label)': 'فتح القائمة',
    'Toggle Theme(theme switcher)(aria-label)': 'تبديل المظهر',
    'Light(theme switcher)(aria-label)': 'فاتح',
    'Dark(theme switcher)(aria-label)': 'داكن',
    'System(theme switcher)(aria-label)': 'النظام',
    'Choose a language(language switcher)': 'اختر لغة',
    'Choose a language(language switcher)(aria-label)': 'اختر لغة',
    'Copy Text(code block)(aria-label)': 'نسخ النص',
    'Copied Text(code block)(aria-label)': 'تم نسخ النص',
    'Copy Link(accordion)(aria-label)': 'نسخ الرابط',
    'Copied Link(accordion)(aria-label)': 'تم نسخ الرابط',
    'Copy Markdown(page actions)': 'نسخ بصيغة Markdown',
    'Copied Markdown(page actions)': 'تم النسخ بصيغة Markdown',
    'Last updated on(page footer)': 'آخر تحديث في',
  },
});

export function baseOptions(_locale: string): BaseLayoutProps {
  return {
    nav: { title: 'WaFine docs' },
  };
}

// Footer text per locale: the disclaimer is required, so it stays in all three languages.
export function footerText(locale: string): { brand: string; legal: string } {
  if (locale === 'fr') {
    return {
      brand: 'WaFine, parrainée par Ai4x Academy, créée par ZawIA.Tech, open-core sur OpenWA.',
      legal:
        "WaFine est une passerelle indépendante et non officielle. Elle n'est ni affiliée à, autorisée par ni approuvée par WhatsApp LLC ou Meta Platforms, Inc. WhatsApp est une marque de WhatsApp LLC. Claude est une marque d'Anthropic, PBC.",
    };
  }
  if (locale === 'ar') {
    return {
      brand: 'WaFine، مدعومة من Ai4x Academy، من بناء ZawIA.Tech، مفتوحة المصدر على أساس OpenWA.',
      legal:
        'WaFine بوابة مستقلة وغير رسمية. ليست مرتبطة بـ WhatsApp LLC أو Meta Platforms, Inc. ولا معتمدة منهما. WhatsApp علامة تجارية مملوكة لـ WhatsApp LLC، وClaude علامة تجارية لـ Anthropic PBC.',
    };
  }
  return {
    brand: 'WaFine, sponsored by Ai4x Academy, built by ZawIA.Tech, open-core on OpenWA.',
    legal:
      'WaFine is an independent, unofficial gateway. It is not affiliated with, authorized or endorsed by WhatsApp LLC or Meta Platforms, Inc. WhatsApp is a trademark of WhatsApp LLC. Claude is a trademark of Anthropic, PBC.',
  };
}
