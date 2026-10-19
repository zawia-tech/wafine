/**
 * Generates the voice-over, one mp3 per scene line.
 *
 *   PIPER_BIN=/path/to/venv/bin/piper PIPER_MODELS=/path/to/voices bun run voice [en fr ar]
 *   ELEVENLABS_API_KEY=$(pass show elevenlabs/api-key) VOICE_ENGINE=elevenlabs bun run voice
 *
 * Reads voiceover/<locale>.json and writes public/vo/<locale>/<scene>.mp3
 * (44.1 kHz mono, about -16 LUFS), plus src/vo-durations.json so the music
 * ducks exactly while each line plays.
 *
 * VOICE_ENGINE picks the engine: `piper` (default when ELEVENLABS_API_KEY is
 * not set) runs offline with open voices; `elevenlabs` calls the API and never
 * prints the key. Each line must fit its scene: Piper speeds up slightly
 * (length scale down to MIN_SCALE) and fails if the line is still too long, so
 * the text gets shortened instead of rushed.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, voWindowSeconds } from '../src/timeline';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['en', 'fr', 'ar'] as const;
type Locale = (typeof LOCALES)[number];
type Line = { scene: string; text: string; say?: string };
type Script = { locale: string; lines: Line[] };

// Piper voices from https://huggingface.co/rhasspy/piper-voices (licenses: README.md).
// null = no voice with a clear permissive license for that language yet.
const PIPER_VOICES: Record<Locale, string | null> = {
  en: process.env.PIPER_VOICE_EN || 'en_GB-jenny_dioco-medium',
  fr: process.env.PIPER_VOICE_FR || 'fr_FR-siwis-medium',
  ar: process.env.PIPER_VOICE_AR || null,
};
// Spoken spellings, so French says "Wa-Fine" and not "wa-fin". A line's own `say` field wins.
const PRONOUNCE: Partial<Record<Locale, [string, string][]>> = { fr: [['WaFine', 'Wa Faïne']] };
const BASE_SCALE = Number(process.env.PIPER_LENGTH_SCALE || 1.0); // >1 slower, <1 faster
const MIN_SCALE = 0.85; // never faster than this: shorten the line instead

const ELEVEN_MODEL = 'eleven_multilingual_v2';
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // "Rachel"

function run(cmd: string, args: string[], input?: string) {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}: ${(r.stderr || '').slice(-400)}`);
  return r.stdout;
}

const seconds = (file: string) =>
  Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());

/** Trim silence, normalise to about -16 LUFS (true peak -1.5 dB), 44.1 kHz mono mp3. */
function toMp3(input: string, output: string) {
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB';
  const filter = `${trim},areverse,${trim},areverse,loudnorm=I=-16:TP=-1.5:LRA=7`;
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-af', filter, '-ar', '44100', '-ac', '1', '-b:a', '96k', output]);
}

function piperWav(model: string, text: string, scale: number, out: string) {
  const bin = process.env.PIPER_BIN || 'piper';
  run(bin, ['-m', model, '-f', out, '--length-scale', String(scale), '--sentence-silence', '0.25'], text);
}

async function elevenWav(locale: Locale, text: string, out: string) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY as string, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: ELEVEN_MODEL,
      language_code: locale,
      voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
    }),
  });
  // The body is ElevenLabs' error message; it never contains the key.
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} for ${locale}: ${(await res.text()).slice(0, 300)}`);
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const engine = process.env.VOICE_ENGINE || (process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'piper');
  if (engine === 'elevenlabs' && !process.env.ELEVENLABS_API_KEY) throw new Error('VOICE_ENGINE=elevenlabs needs ELEVENLABS_API_KEY');
  const models = process.env.PIPER_MODELS || join(ROOT, '.piper');
  const wanted = process.argv.slice(2).filter((l): l is Locale => (LOCALES as readonly string[]).includes(l));
  const durationsFile = join(ROOT, 'src', 'vo-durations.json');
  const durations: Record<string, Record<string, number>> = JSON.parse(await readFile(durationsFile, 'utf8').catch(() => '{}'));
  const tmp = await mkdtemp(join(tmpdir(), 'wafine-vo-'));
  let tooLong = 0;
  try {
    for (const locale of wanted.length ? wanted : LOCALES) {
      const voice = PIPER_VOICES[locale];
      if (engine === 'piper' && !voice) {
        console.log(`${locale}: no Piper voice configured (set PIPER_VOICE_${locale.toUpperCase()}); skipping.`);
        continue;
      }
      const script = JSON.parse(await readFile(join(ROOT, 'voiceover', `${locale}.json`), 'utf8')) as Script;
      const outDir = join(ROOT, 'public', 'vo', locale);
      await mkdir(outDir, { recursive: true });
      durations[locale] = {};
      for (const { scene, text, say } of script.lines) {
        if (!SCENES.some((s) => s.id === scene)) throw new Error(`${locale}: unknown scene "${scene}"`);
        const window = voWindowSeconds(scene);
        const spoken = say || (PRONOUNCE[locale] ?? []).reduce((t, [from, to]) => t.replaceAll(from, to), text);
        const raw = join(tmp, `${locale}-${scene}.wav`);
        const mp3 = join(outDir, `${scene}.mp3`);
        let scale = BASE_SCALE;
        if (engine === 'piper') {
          const model = join(models, `${voice}.onnx`);
          // Piper's output length varies a little per run: aim 3% under the window, a few tries.
          for (let attempt = 0; attempt < 4; attempt++) {
            piperWav(model, spoken, scale, raw);
            toMp3(raw, mp3);
            const d = seconds(mp3);
            if (d <= window || scale <= MIN_SCALE) break;
            scale = Math.max(MIN_SCALE, Math.floor(((scale * window * 0.97) / d) * 100) / 100);
          }
        } else {
          await elevenWav(locale, spoken, raw);
          toMp3(raw, mp3);
        }
        const d = Math.round(seconds(mp3) * 100) / 100;
        durations[locale][scene] = d;
        const fits = d <= window;
        if (!fits) tooLong++;
        console.log(`${fits ? 'ok  ' : 'LONG'} ${locale}/${scene}.mp3  ${d.toFixed(2)} s / ${window.toFixed(2)} s  scale ${scale}`);
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  await writeFile(durationsFile, `${JSON.stringify(durations, null, 2)}\n`);
  if (tooLong) throw new Error(`${tooLong} line(s) are longer than their scene: shorten the text in voiceover/<locale>.json.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
