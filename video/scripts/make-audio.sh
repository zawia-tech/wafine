#!/usr/bin/env bash
# Synthesises the tutorial's sound effects and music with ffmpeg only.
# Everything is generated from sine waves and noise, so it is original and
# license-free. Re-run after changing a sound: bash scripts/make-audio.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/sfx public/music
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }

# Soft UI click: a short 1.4 kHz tick with a fast decay (0.1 s).
ff -f lavfi -i "aevalsrc='0.5*sin(2*PI*1400*t)*exp(-70*t)+0.25*sin(2*PI*2800*t)*exp(-110*t)':s=44100:d=0.1" \
  -af "afade=t=out:st=0.07:d=0.03" -ac 1 -b:a 64k public/sfx/click.mp3

# Gentle whoosh: band-passed pink noise swelling in and out (0.4 s).
ff -f lavfi -i "anoisesrc=d=0.4:c=pink:a=0.6:r=44100" \
  -af "highpass=f=400,lowpass=f=2400,afade=t=in:d=0.2:curve=qsin,afade=t=out:st=0.2:d=0.2:curve=qsin,volume=0.7" \
  -ac 1 -b:a 64k public/sfx/whoosh.mp3

# Light "sent" chime: two bell-like partials, C6 then G6 (0.4 s).
ff -f lavfi -i "aevalsrc='0.35*sin(2*PI*1046.5*t)*exp(-9*t)+0.3*gt(t,0.07)*sin(2*PI*1568*(t-0.07))*exp(-10*(t-0.07))':s=44100:d=0.4" \
  -af "afade=t=out:st=0.32:d=0.08" -ac 1 -b:a 64k public/sfx/chime.mp3

# Ambient pad + soft pulse, 40 s. Two chords (Am9 and Fmaj9) crossfade on a
# 16 s cycle, with a slow tremolo, a low 1 Hz pulse, a lowpass and fades.
# Loudness-normalised to about -24 LUFS so it sits under the voice.
A="(sin(2*PI*220*t)+0.8*sin(2*PI*261.63*t)+0.7*sin(2*PI*329.63*t)+0.5*sin(2*PI*493.88*t))"
F="(sin(2*PI*174.61*t)+0.8*sin(2*PI*220*t)+0.7*sin(2*PI*261.63*t)+0.5*sin(2*PI*392*t))"
W="(0.5+0.5*cos(2*PI*t/16))"
TREM="(0.85+0.15*sin(2*PI*0.25*t))"
PULSE="0.25*sin(2*PI*55*t)*pow(0.5+0.5*cos(2*PI*1*t),6)"
ff -f lavfi -i "aevalsrc='0.08*${TREM}*(${W}*${A}+(1-${W})*${F})+${PULSE}':s=44100:d=40" \
  -af "lowpass=f=1400,aecho=0.8:0.6:420:0.25,afade=t=in:d=3,afade=t=out:st=35:d=5,loudnorm=I=-24:TP=-3:LRA=7" \
  -ar 44100 -ac 1 -b:a 80k public/music/ambient.mp3

ls -l public/sfx public/music
