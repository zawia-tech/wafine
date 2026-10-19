# WaFine tutorial video

Three cuts of the same 38 s tutorial: English, French and Arabic (right to left).

## Edit

- Scenes: `src/scenes.tsx`. Scene durations: `src/timeline.ts`. Sound placement: `src/WaFineTutorial.tsx`. Brand tokens and fonts: `src/theme.ts`.
- All on-screen copy lives in `src/i18n.ts` (`en`, `fr`, `ar`). The product name stays "WaFine" in every locale. The Arabic copy is Modern Standard Arabic and still needs a native check (Youssef).
- Compositions: `WaFineTutorial-en`, `WaFineTutorial-fr`, `WaFineTutorial-ar`, plus `WaFineTutorial` (English, used on the docs page).
- Preview: `bun install && bunx remotion studio`.

## Render

The machine is low on RAM, so every render uses one tab (`--concurrency=1`).

```bash
bun run render:all    # wafine-tutorial-{en,fr,ar}.mp4, then copies EN to wafine-tutorial.mp4
bun run poster:all    # wafine-tutorial-{en,fr,ar}-poster.png
bun run poster        # wafine-tutorial-poster.png (EN, docs page)
```

Outputs land in `../app/docs/public/media/`.

## Sound

- Music (`public/music/ambient.mp3`) and effects (`public/sfx/click.mp3`, `whoosh.mp3`, `chime.mp3`) are original: `scripts/make-audio.sh` synthesises them from sine waves and noise with ffmpeg, so there is nothing to license. Re-create them with `bun run audio`. The music is normalised to about -24 LUFS and dips 6 dB while a voice line plays.
- Voice-over script: `voiceover/<locale>.json`, one short line per scene. `scripts/voice.ts` writes `public/vo/<locale>/<scene>.mp3` (44.1 kHz mono, about -16 LUFS, true peak -1.5 dB, silence trimmed) and `src/vo-durations.json`, which the composition uses to duck the music exactly while each line plays. Each line must fit its scene (until just before the next line, see `voWindowSeconds` in `src/timeline.ts`): the script speeds Piper up slightly (length scale down to 0.85) and fails if a line is still too long, so shorten the text instead.
- Default engine: **[Piper](https://github.com/rhasspy/piper)** (MIT, offline, free). Install it outside the repo and fetch the voices (`<name>.onnx` + `<name>.onnx.json`) from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices):

  ```bash
  uv venv /tmp/piper && uv pip install --python /tmp/piper/bin/python piper-tts
  PIPER_BIN=/tmp/piper/bin/piper PIPER_MODELS=/path/to/voices bun run voice && bun run render:all
  ```

  `bun run voice fr` does one locale. `PIPER_VOICE_EN` / `_FR` / `_AR` pick other voices, `PIPER_LENGTH_SCALE` the base pace (default 1.0). French says "WaFine" as "Wa Faïne" (spoken spelling in `PRONOUNCE`; a line's optional `say` field overrides it).

  | Locale | Voice | Dataset license |
  |---|---|---|
  | en | `en_GB-jenny_dioco-medium` | [Jenny (Dioco)](https://github.com/dioco-group/jenny-tts-dataset): commercial use allowed; attribution ("Jenny (Dioco)") required in apps that generate speech on demand, not for distributed clips. |
  | fr | `fr_FR-siwis-medium` | [SIWIS](https://datashare.is.ed.ac.uk/handle/10283/2353): CC BY 4.0 (credit: SIWIS French Speech Synthesis Database). |
  | ar | none yet | The only Arabic Piper voice, `ar_JO-kareem`, is trained on [arabicttstrain](https://github.com/AliMokhammad/arabicttstrain), which has no license, so it is skipped. The Arabic cut has music and effects only until a permissively licensed voice exists (or the owner clears kareem: `PIPER_VOICE_AR=ar_JO-kareem-medium`). |

  `en_US-amy-medium` was the other English candidate; its model card only points to the mimic3-voices repo, without a clear dataset license, so Jenny is used. All three medium voices are fine-tuned from Piper's `en_US-lessac` base, whose Blizzard 2013 data has its own terms; check them before commercial use.
- ElevenLabs (model `eleven_multilingual_v2`) still works, for a key whose plan allows API voices: `VOICE_ENGINE=elevenlabs ELEVENLABS_API_KEY=$(pass show elevenlabs/api-key) bun run voice`. `ELEVENLABS_VOICE_ID` picks the voice. The key is never printed. A locale without mp3s renders with music and effects only.

## License

Remotion is free for individuals and for companies of up to 3 people. Check the [Remotion license](https://www.remotion.dev/license) before the team grows past that; larger companies need a company license.
