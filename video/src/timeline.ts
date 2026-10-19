/**
 * Scene timing, shared by the composition and scripts/voice.ts (no React here).
 * Durations are frames at 30 fps; neighbours overlap by OVERLAP frames.
 */
export const FPS = 30;

/** Frames two neighbouring scenes overlap for the cross transition. */
export const OVERLAP = 18;

/** Frames after a scene starts before its voice line begins. */
export const VO_DELAY = 10;

/** Frames kept between the end of a line and the next scene's line. */
const VO_GAP = 8;

export const SCENES = [
  { id: 'brand', duration: 120 },
  { id: 'invite', duration: 150 },
  { id: 'qr', duration: 165 },
  { id: 'key', duration: 150 },
  { id: 'curl', duration: 195 },
  { id: 'replies', duration: 195 },
  { id: 'mcp', duration: 165 },
  { id: 'outro', duration: 135 },
] as const;

export type SceneId = (typeof SCENES)[number]['id'];

export const STARTS = SCENES.reduce<number[]>((acc, _s, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + SCENES[i - 1].duration - OVERLAP);
  return acc;
}, []);

export const TOTAL_FRAMES = STARTS[STARTS.length - 1] + SCENES[SCENES.length - 1].duration;

/** Seconds a scene's voice line may last: until just before the next line (last scene: 1 s before the end). */
export function voWindowSeconds(scene: string): number {
  const i = SCENES.findIndex((s) => s.id === scene);
  if (i < 0) throw new Error(`unknown scene ${scene}`);
  const end = i + 1 < SCENES.length ? STARTS[i + 1] + VO_DELAY - VO_GAP : TOTAL_FRAMES - FPS;
  return (end - (STARTS[i] + VO_DELAY)) / FPS;
}
