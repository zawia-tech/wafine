import { Composition } from 'remotion';
import { LOCALES } from './i18n';
import { WaFineTutorial, TOTAL_FRAMES } from './WaFineTutorial';

const base = { component: WaFineTutorial, durationInFrames: TOTAL_FRAMES, fps: 30, width: 1280, height: 720 } as const;

export const RemotionRoot = () => (
  <>
    {/* WaFineTutorial = the English cut used on the docs page. */}
    <Composition id="WaFineTutorial" {...base} defaultProps={{ locale: 'en' as const }} />
    {LOCALES.map((locale) => (
      <Composition key={locale} id={`WaFineTutorial-${locale}`} {...base} defaultProps={{ locale }} />
    ))}
  </>
);
