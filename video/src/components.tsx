import type { CSSProperties, ReactNode } from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { useLocale } from './i18n';
import { c, font, radius, shadow } from './theme';

import { OVERLAP } from './timeline';

export { OVERLAP };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** A calm spring (slight settle, no wobble) starting at `delay` frames. */
export function useSpring(delay = 0, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.9, ...config },
  });
}

export function fade(frame: number, from: number, to: number) {
  return interpolate(frame, [from, to], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
}

/** Characters of `text` revealed at `perFrame` chars/frame from `start`. */
export function typed(text: string, frame: number, start: number, perFrame = 1.2) {
  const n = Math.max(0, Math.floor((frame - start) * perFrame));
  return text.slice(0, n);
}

/** The WaFine bubble mark, paths copied from docs/design-system/assets/Logos/wafine-mark.svg. */
export function Mark({ size = 120, bubble = c.pine, word = c.paper }: { size?: number; bubble?: string; word?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="WaFine">
      <path
        d="M156 64H356A112 112 0 0 1 468 176V288A112 112 0 0 1 356 400H260C210 400 150 418 96 468C140 430 170 410 180 400H156A112 112 0 0 1 44 288V176A112 112 0 0 1 156 64Z"
        fill={bubble}
      />
      <g transform="translate(106.0 158.4) scale(0.09659)">
        <path
          d="M368 775Q332 775 310.5 751.5Q289 728 289 690Q289 650 309.5 627.5Q330 605 368 605Q404 605 425.0 627.0Q446 649 446 690Q446 730 424.5 752.5Q403 775 368 775Z M734 1282Q720 1403 637.5 1462.5Q555 1522 410 1522H384Q339 1522 298.5 1514.5Q258 1507 223 1490Q146 1452 105.5 1379.5Q65 1307 65 1216Q65 1161 81.0 1100.5Q97 1040 123 995H287Q272 1055 262.5 1117.5Q253 1180 253 1222Q253 1289 291.5 1331.5Q330 1374 388 1374H406Q477 1374 511.5 1331.0Q546 1288 546 1216V780H735V1134H877Q882 1134 882 1138V1277Q882 1282 877 1282Z M1030 1520Q994 1520 975.0 1497.0Q956 1474 956 1440Q956 1405 975.0 1382.5Q994 1360 1030 1360Q1065 1360 1084.0 1381.5Q1103 1403 1103 1440Q1103 1477 1083.0 1498.5Q1063 1520 1030 1520ZM1228 1520Q1194 1520 1174.0 1498.0Q1154 1476 1154 1440Q1154 1403 1174.0 1381.5Q1194 1360 1228 1360Q1262 1360 1281.5 1381.0Q1301 1402 1301 1440Q1301 1477 1280.5 1498.5Q1260 1520 1228 1520Z M867 1282Q862 1282 862 1277V1138Q862 1134 867 1134H1017V780H1206V1134H1356Q1361 1134 1361 1138V1277Q1361 1282 1356 1282Z M1675 702Q1639 702 1617.5 678.5Q1596 655 1596 617Q1596 577 1616.5 554.5Q1637 532 1675 532Q1711 532 1732.0 554.0Q1753 576 1753 617Q1753 657 1731.5 679.5Q1710 702 1675 702Z M1346 1282Q1341 1282 1341 1277V1138Q1341 1134 1346 1134H1495Q1467 1116 1447.0 1080.5Q1427 1045 1427 1003Q1427 936 1464.0 886.0Q1501 836 1571.5 808.0Q1642 780 1742 780H1951V1282ZM1737 1134H1762V928H1745Q1686 928 1650.0 953.0Q1614 978 1614 1029Q1614 1063 1632.5 1086.5Q1651 1110 1679.0 1122.0Q1707 1134 1737 1134Z M2136 522H2325V1282H2136Z M2718 1535Q2655 1535 2596.0 1517.5Q2537 1500 2490 1472L2559 1340Q2605 1369 2644.5 1379.0Q2684 1389 2719 1389Q2775 1389 2804.5 1361.0Q2834 1333 2834 1297V1282H2777Q2635 1282 2564.5 1217.0Q2494 1152 2494 1046Q2494 956 2542.5 897.0Q2591 838 2672.5 809.0Q2754 780 2853 780H3021V1271Q3021 1393 2944.0 1464.0Q2867 1535 2718 1535ZM2832 1134V928H2808Q2753 928 2718.5 956.5Q2684 985 2684 1035Q2684 1084 2710.5 1109.0Q2737 1134 2793 1134Z"
          fill={word}
        />
      </g>
    </svg>
  );
}

export function Wordmark({ size = 64, color = c.ink }: { size?: number; color?: string }) {
  return (
    <span style={{ fontFamily: font.display, fontWeight: 600, fontSize: size, letterSpacing: '-0.02em', color, lineHeight: 1 }}>
      WaFine
    </span>
  );
}

/**
 * Paper ground with two warm light pools and a faint eight-point star lattice
 * (zellige), each drifting at its own speed for parallax depth.
 */
export function Background() {
  const frame = useCurrentFrame();
  const drift = frame * 0.25;
  return (
    <AbsoluteFill style={{ backgroundColor: c.paper, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          left: -260 + Math.sin(frame / 90) * 40,
          top: -380 + drift * 0.2,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(28,92,66,0.13) 0%, rgba(28,92,66,0) 65%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 820,
          height: 820,
          right: -300 + Math.cos(frame / 110) * 50,
          bottom: -420 + drift * 0.15,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(165,86,47,0.13) 0%, rgba(165,86,47,0) 65%)',
        }}
      />
      <svg
        width={1280 + 200}
        height={720 + 200}
        style={{ position: 'absolute', left: -100 - (drift % 96), top: -100, opacity: 0.6 }}
      >
        <defs>
          <pattern id="zellige" width="96" height="96" patternUnits="userSpaceOnUse">
            <g fill="none" stroke={c.pine} strokeOpacity="0.07" strokeWidth="1.5">
              <rect x="30" y="30" width="36" height="36" />
              <rect x="30" y="30" width="36" height="36" transform="rotate(45 48 48)" />
              <circle cx="0" cy="0" r="6" />
              <circle cx="96" cy="96" r="6" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#zellige)" />
      </svg>
    </AbsoluteFill>
  );
}

/**
 * Wraps one scene: spring entrance, fade-and-lift exit over the last OVERLAP
 * frames, and a parallax split — the visual layer travels farther than the text.
 */
export function SceneFrame({
  duration,
  children,
  visual,
  enterDelay = 9,
}: {
  duration: number;
  children?: ReactNode;
  visual?: ReactNode;
  enterDelay?: number;
}) {
  const frame = useCurrentFrame();
  // Hand-off: the outgoing scene clears in the first ~11 overlap frames while
  // the incoming one waits `enterDelay`, so titles never sit on top of each other.
  const enter = useSpring(enterDelay, { damping: 20, stiffness: 90 });
  const exit = interpolate(frame, [duration - OVERLAP, duration - OVERLAP + 11], [0, 1], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(enter, 1) * (1 - exit);
  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ transform: `translateY(${(1 - enter) * 36 - exit * 30}px)` }}>{children}</AbsoluteFill>
      {visual ? (
        <AbsoluteFill
          style={{
            transform: `translateY(${(1 - enter) * 90 - exit * 70}px) scale(${0.96 + 0.04 * enter - 0.02 * exit})`,
          }}
        >
          {visual}
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}

export function StepText({ step, title, body }: { step: number; title: string; body: string }) {
  const frame = useCurrentFrame();
  const { t, rtl } = useLocale();
  return (
    <div style={{ position: 'absolute', [rtl ? 'right' : 'left']: 96, top: 170, width: 470 }}>
      <div
        style={{
          fontFamily: font.body,
          fontWeight: 600,
          fontSize: 17,
          letterSpacing: rtl ? 0 : '0.12em',
          textTransform: 'uppercase',
          color: c.clay,
          opacity: fade(frame, 4, 18),
        }}
      >
        {t.step(step)}
      </div>
      <div
        style={{
          marginTop: 16,
          fontFamily: font.display,
          fontWeight: 600,
          fontSize: rtl ? 48 : 54,
          lineHeight: rtl ? 1.35 : 1.08,
          letterSpacing: rtl ? 0 : '-0.02em',
          color: c.ink,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 22,
          fontFamily: font.body,
          fontSize: 23,
          lineHeight: 1.45,
          color: c.muted,
          opacity: fade(frame, 12, 28),
        }}
      >
        {body}
      </div>
    </div>
  );
}

/** On-screen caption (the video has no voice). */
export function Caption({ text, start = 14 }: { text: string; start?: number }) {
  const frame = useCurrentFrame();
  const o = fade(frame, start, start + 14);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 42,
        display: 'flex',
        justifyContent: 'center',
        opacity: o,
        transform: `translateY(${(1 - o) * 10}px)`,
      }}
    >
      <div
        style={{
          maxWidth: 1040,
          padding: '12px 26px',
          borderRadius: radius.pill,
          background: 'rgba(15, 21, 18, 0.86)',
          color: c.paper,
          fontFamily: font.body,
          fontWeight: 500,
          fontSize: 22,
          lineHeight: 1.35,
          textAlign: 'center',
          boxShadow: shadow.raised,
        }}
      >
        {text}
      </div>
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: `1px solid ${c.paper3}`,
        borderRadius: radius.box,
        boxShadow: shadow.floating,
        padding: 28,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  pressed = 0,
  variant = 'primary',
  style,
}: {
  children: ReactNode;
  pressed?: number;
  variant?: 'primary' | 'outline' | 'paper';
  style?: CSSProperties;
}) {
  const v = {
    primary: { background: c.pine, color: c.paper, border: `1px solid ${c.pine}` },
    outline: { background: 'transparent', color: c.pine, border: `1.5px solid ${c.pine}` },
    paper: { background: c.paper, color: c.pineDeep, border: `1px solid ${c.paper}` },
  }[variant];
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        padding: '0 26px',
        borderRadius: radius.pill,
        fontFamily: font.body,
        fontWeight: 600,
        fontSize: 18,
        transform: `scale(${1 - 0.05 * pressed})`,
        boxShadow: variant === 'primary' ? `0 ${6 - 4 * pressed}px 14px rgba(28,92,66,${0.28 - 0.15 * pressed})` : 'none',
        ...v,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Field({ label, value, cursor = false, mono = false, dark = false }: { label: string; value: string; cursor?: boolean; mono?: boolean; dark?: boolean }) {
  const frame = useCurrentFrame();
  const showCursor = cursor && Math.floor(frame / 15) % 2 === 0;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: font.body, fontWeight: 600, fontSize: 15, color: dark ? 'rgba(252,250,246,0.8)' : c.inkSoft, marginBottom: 8 }}>
        {label}
      </div>
      <div
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          borderRadius: radius.pill,
          border: `1.5px solid ${dark ? 'rgba(252,250,246,0.25)' : c.paper3}`,
          background: dark ? 'rgba(252,250,246,0.08)' : c.paper,
          fontFamily: mono ? font.mono : font.body,
          fontSize: mono ? 17 : 18,
          color: dark ? c.paper : c.ink,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          direction: 'ltr',
        }}
      >
        {value}
        <span style={{ display: 'inline-block', width: 2, height: 22, marginLeft: 2, background: showCursor ? (dark ? c.paper : c.pine) : 'transparent' }} />
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'clay', style }: { children: ReactNode; tone?: 'clay' | 'pine' | 'paper'; style?: CSSProperties }) {
  const t = {
    clay: { background: 'rgba(165,86,47,0.12)', color: c.clay, border: '1px solid rgba(165,86,47,0.35)' },
    pine: { background: 'rgba(28,92,66,0.1)', color: c.pine, border: '1px solid rgba(28,92,66,0.3)' },
    paper: { background: 'rgba(252,250,246,0.14)', color: c.paper, border: '1px solid rgba(252,250,246,0.3)' },
  }[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 14px',
        borderRadius: radius.pill,
        fontFamily: font.body,
        fontWeight: 600,
        fontSize: 14,
        ...t,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Check({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
