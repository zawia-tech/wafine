import { defineI18n } from 'fumadocs-core/i18n';

// English is the default language and is served without a prefix (`hideLocale`); French lives
// under `/fr/...`, Arabic under `/ar/...` and is rendered RTL. The same config drives the proxy
// (`app/proxy.ts`), the content loader and the UI provider.
export const i18n = defineI18n({
  defaultLanguage: 'en',
  languages: ['en', 'fr', 'ar'],
  parser: 'dot',
  hideLocale: 'default-locale',
});
