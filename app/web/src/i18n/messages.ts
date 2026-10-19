import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import ar from '../../messages/ar.json';
import type { Locale } from './routing';

const catalogs = { en, fr, ar } as const;

export function messagesFor(locale: Locale) {
  return catalogs[locale];
}

export type Messages = typeof en;
