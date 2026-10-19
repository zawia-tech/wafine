import type { ComponentType } from 'react';
import { AbsoluteFill, Audio, Sequence, getStaticFiles, interpolate, staticFile } from 'remotion';
import ar from '../voiceover/ar.json';
import en from '../voiceover/en.json';
import fr from '../voiceover/fr.json';
import { Background } from './components';
import { type Locale, LocaleContext, STRINGS } from './i18n';
import {
  BrandScene,
  CurlScene,
  InviteScene,
  KeyScene,
  McpScene,
  OutroScene,
  QrScene,
  REPLY_AT,
  RepliesScene,
  curlSentAt,
} from './scenes';
import { FPS, SCENES as TIMELINE, STARTS, type SceneId, TOTAL_FRAMES, VO_DELAY } from './timeline';
import VO_DURATIONS from './vo-durations.json';

export { TOTAL_FRAMES };

type Sfx = 'click' | 'chime';

const COMPONENTS: Record<SceneId, ComponentType<{ duration: number }>> = {
  brand: BrandScene,
  invite: InviteScene,
  qr: QrScene,
  key: KeyScene,
  curl: CurlScene,
  replies: RepliesScene,
  mcp: McpScene,
  outro: OutroScene,
};

// Scene-relative frames of key actions (button presses, deliveries).
const SFX: Record<SceneId, (l: Locale) => [number, Sfx][]> = {
  brand: () => [],
  invite: () => [[86, 'click'], [92, 'chime']],
  qr: () => [[100, 'chime']],
  key: () => [[30, 'click'], [92, 'click']],
  curl: (l) => [[curlSentAt(STRINGS[l].curl.message), 'chime']],
  replies: () => REPLY_AT.map((at) => [at, 'chime'] as [number, Sfx]),
  mcp: () => [[72, 'click'], [80, 'chime']],
  outro: () => [],
};

// Durations and overlaps live in ./timeline, shared with scripts/voice.ts.
const SCENES = TIMELINE.map((s) => ({ ...s, Component: COMPONENTS[s.id], sfx: SFX[s.id] }));

// Kept subtle so they never compete with the voice.
const SFX_VOLUME: Record<Sfx | 'whoosh', number> = { click: 0.3, chime: 0.24, whoosh: 0.4 };
const VO_DURATIONS_S = VO_DURATIONS as Record<string, Record<string, number>>;
const VO_SCRIPTS: Record<Locale, { lines: { scene: string; text: string }[] }> = { en, fr, ar };

/** Voice-over lines whose mp3 exists in public/vo/<locale>/ (none until `bun run voice` has run). */
function voiceLines(locale: Locale) {
  const files = new Set(getStaticFiles().map((f) => f.name));
  return VO_SCRIPTS[locale].lines.flatMap(({ scene, text }) => {
    const i = SCENES.findIndex((s) => s.id === scene);
    const file = `vo/${locale}/${scene}.mp3`;
    if (i < 0 || !files.has(file)) return [];
    // Measured length from scripts/voice.ts (else ~2.5 words per second), for ducking the music.
    const secs = VO_DURATIONS_S[locale]?.[scene] ?? text.split(/\s+/).length / 2.5;
    const from = STARTS[i] + VO_DELAY;
    return [{ file, from, to: from + Math.ceil((secs + 0.2) * FPS) }];
  });
}

export const WaFineTutorial = ({ locale = 'en' }: { locale?: Locale }) => {
  const vo = voiceLines(locale);
  // Music sits at about -24 LUFS; it dips 6 dB (x0.5) while a line plays and fades out at the end.
  const musicVolume = (f: number) => {
    const duck = vo.reduce((v, l) => Math.min(v, interpolate(f, [l.from - 8, l.from, l.to, l.to + 12], [1, 0.5, 0.5, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })), 1);
    const fadeOut = interpolate(f, [TOTAL_FRAMES - 60, TOTAL_FRAMES], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return duck * fadeOut;
  };
  return (
    <LocaleContext.Provider value={locale}>
      <AbsoluteFill style={{ direction: locale === 'ar' ? 'rtl' : 'ltr' }}>
        <Background />
        {SCENES.map(({ id, Component, duration }, i) => (
          <Sequence key={id} from={STARTS[i]} durationInFrames={duration} name={id}>
            <Component duration={duration} />
          </Sequence>
        ))}
        <Audio src={staticFile('music/ambient.mp3')} volume={musicVolume} />
        {STARTS.slice(1).map((start, i) => (
          <Sequence key={`whoosh-${i}`} from={start} durationInFrames={15} name="sfx-whoosh">
            <Audio src={staticFile('sfx/whoosh.mp3')} volume={SFX_VOLUME.whoosh} />
          </Sequence>
        ))}
        {SCENES.flatMap(({ id, sfx }, i) =>
          sfx(locale).map(([at, kind]) => (
            <Sequence key={`${id}-${kind}-${at}`} from={STARTS[i] + at} durationInFrames={15} name={`sfx-${kind}`}>
              <Audio src={staticFile(`sfx/${kind}.mp3`)} volume={SFX_VOLUME[kind]} />
            </Sequence>
          )),
        )}
        {vo.map((l) => (
          <Sequence key={l.file} from={l.from} name={`vo-${l.file}`}>
            <Audio src={staticFile(l.file)} />
          </Sequence>
        ))}
      </AbsoluteFill>
    </LocaleContext.Provider>
  );
};
