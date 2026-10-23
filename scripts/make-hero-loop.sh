#!/usr/bin/env bash
# make-hero-loop.sh — render the abstract hero backdrop (no people, logos or text).
# Output: app/web/public/media/hero-loop.mp4 (8 s seamless loop, muted) and hero-loop-poster.png.
# Needs ffmpeg. Palette: pine #1c5c42, clay #a5562f, paper #fcfaf6 (design system v5).
set -euo pipefail
out="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/app/web/public/media"
mkdir -p "$out"
W=960 H=540 D=8 FPS=24
# Two soft light blobs drift on closed sin/cos paths whose period is exactly D seconds,
# so frame D wraps to frame 0 with no seam.
g() { # $1 base channel, $2 pine lift, $3 clay lift
  local b1="exp(-((X-W*(0.30+0.12*sin(2*PI*T/$D)))*(X-W*(0.30+0.12*sin(2*PI*T/$D)))+(Y-H*(0.35+0.15*cos(2*PI*T/$D)))*(Y-H*(0.35+0.15*cos(2*PI*T/$D))))/(W*W*0.10))"
  local b2="exp(-((X-W*(0.72+0.10*cos(2*PI*T/$D)))*(X-W*(0.72+0.10*cos(2*PI*T/$D)))+(Y-H*(0.66+0.12*sin(2*PI*T/$D)))*(Y-H*(0.66+0.12*sin(2*PI*T/$D))))/(W*W*0.12))"
  printf '%s+%s*%s+%s*%s' "$1" "$2" "$b1" "$3" "$b2"
}
ffmpeg -y -loglevel error -f lavfi -i "color=c=black:s=${W}x${H}:r=$FPS:d=$D" \
  -vf "geq=r='$(g 22 38 70)':g='$(g 74 60 22)':b='$(g 52 44 10)',format=yuv420p" \
  -c:v libx264 -preset slow -crf 26 -movflags +faststart -an "$out/hero-loop.mp4"
ffmpeg -y -loglevel error -i "$out/hero-loop.mp4" -frames:v 1 "$out/hero-loop-poster.png"
ls -l "$out"
