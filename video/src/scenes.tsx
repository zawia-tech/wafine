import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import {
  Badge,
  Button,
  Caption,
  Card,
  Check,
  Field,
  Mark,
  SceneFrame,
  StepText,
  Wordmark,
  fade,
  typed,
  useSpring,
} from './components';
import { useLocale } from './i18n';
import { c, font, radius, shadow } from './theme';

type SceneProps = { duration: number };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Right-hand stage for a step visual: x 640–1184, vertically centred above the caption. */
function Stage({ children }: { children: ReactNode }) {
  const { rtl } = useLocale();
  return (
    <div
      style={{
        position: 'absolute',
        left: rtl ? 96 : 640,
        top: 70,
        width: 544,
        height: 540,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
  );
}

/** 0→1→0 press pulse centred on `at`. */
function press(frame: number, at: number) {
  return interpolate(frame, [at - 4, at, at + 6], [0, 1, 0], clamp);
}

// 1) Brand open ---------------------------------------------------------------

export function BrandScene({ duration }: SceneProps) {
  const frame = useCurrentFrame();
  const { t } = useLocale();
  const mark = useSpring(0, { damping: 16, stiffness: 150 });
  const word = useSpring(5, { damping: 20, stiffness: 150 });
  const line = useSpring(10, { damping: 22, stiffness: 140 });
  const float = Math.sin(frame / 24) * 6;
  return (
    <SceneFrame duration={duration} enterDelay={0}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, direction: 'ltr' }}>
          <div
            style={{
              transform: `translateY(${float}px) scale(${0.6 + 0.4 * mark}) rotate(${(1 - mark) * -8}deg)`,
              opacity: Math.min(1, mark * 1.4),
              filter: 'drop-shadow(0 22px 30px rgba(28,92,66,0.28))',
            }}
          >
            <Mark size={200} />
          </div>
          <div style={{ opacity: Math.min(1, word), transform: `translateX(${(1 - word) * 40}px)` }}>
            <Wordmark size={120} />
          </div>
        </div>
        <div
          style={{
            marginTop: 34,
            fontFamily: font.body,
            fontSize: 28,
            color: c.muted,
            opacity: Math.min(1, line),
            transform: `translateY(${(1 - line) * 18}px)`,
          }}
        >
          {t.brand.tagline}
        </div>
        <div style={{ marginTop: 22, opacity: Math.min(1, line) }}>
          <Badge>{t.brand.badge}</Badge>
        </div>
      </AbsoluteFill>
      <Caption text={t.brand.caption} start={36} />
    </SceneFrame>
  );
}

// 2) Request an invite ----------------------------------------------------------

export function InviteScene({ duration }: SceneProps) {
  const frame = useCurrentFrame();
  const { t } = useLocale();
  const email = typed('you@example.com', frame, 22, 0.6);
  const phone = typed('+212 6XX XX XX XX', frame, 52, 0.7);
  const p = press(frame, 86);
  const done = useSpring(90);
  return (
    <SceneFrame
      duration={duration}
      visual={
        <Stage>
          <Card style={{ width: 460 }}>
            <div style={{ fontFamily: font.display, fontWeight: 600, fontSize: 30, color: c.ink, marginBottom: 6 }}>{t.invite.cardTitle}</div>
            <div style={{ fontFamily: font.body, fontSize: 16, color: c.muted, marginBottom: 22 }}>{t.invite.cardSub}</div>
            <Field label={t.invite.email} value={email} cursor={frame < 52} />
            <Field label={t.invite.phone} value={phone} cursor={frame >= 52 && frame < 86} />
            <Button pressed={p} style={{ width: '100%', marginTop: 6 }}>
              {t.invite.button}
            </Button>
            <div
              style={{
                marginTop: 16,
                height: 52,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0 18px',
                borderRadius: 14,
                background: 'rgba(28,92,66,0.09)',
                color: c.pine,
                fontFamily: font.body,
                fontWeight: 600,
                fontSize: 17,
                opacity: Math.min(1, done),
                transform: `translateY(${(1 - done) * 12}px)`,
              }}
            >
              <Check /> {t.invite.done}
            </div>
          </Card>
        </Stage>
      }
    >
      <StepText step={1} title={t.invite.title} body={t.invite.body} />
      <Caption text={t.invite.caption} />
    </SceneFrame>
  );
}

// 3) Link your number with a QR -------------------------------------------------

function rand(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function QrPlaceholder({ size = 200 }: { size?: number }) {
  const n = 25;
  const cell = size / n;
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inFinder(x, y)) continue;
      if (rand(y * n + x) > 0.52) {
        cells.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} rx={cell * 0.3} fill={c.ink} />);
      }
    }
  }
  const finder = (fx: number, fy: number) => (
    <g key={`f${fx}${fy}`}>
      <rect x={fx * cell} y={fy * cell} width={cell * 7} height={cell * 7} rx={cell * 1.6} fill={c.ink} />
      <rect x={(fx + 1) * cell} y={(fy + 1) * cell} width={cell * 5} height={cell * 5} rx={cell * 1.1} fill="#fff" />
      <rect x={(fx + 2) * cell} y={(fy + 2) * cell} width={cell * 3} height={cell * 3} rx={cell * 0.8} fill={c.pine} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {cells}
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  );
}

export function QrScene({ duration }: SceneProps) {
  const frame = useCurrentFrame();
  const { t } = useLocale();
  const scanT = interpolate(frame, [30, 96], [0, 1], clamp);
  const scanY = Math.abs(Math.sin(scanT * Math.PI * 1.5)) * 126;
  const phoneIn = useSpring(12, { damping: 18, stiffness: 120 });
  const linked = useSpring(100);
  const phoneFloat = Math.sin(frame / 20) * 4;
  const corner = (pos: CSSProperties) => (
    <div style={{ position: 'absolute', width: 26, height: 26, borderColor: c.clay, borderStyle: 'solid', borderWidth: 0, ...pos }} />
  );
  return (
    <SceneFrame
      duration={duration}
      visual={
        <Stage>
          {/* WaFine web app: browser frame with the "Link WhatsApp" panel showing the QR */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 46,
              width: 336,
              borderRadius: radius.box,
              background: '#ffffff',
              border: `1px solid ${c.paper3}`,
              boxShadow: shadow.floating,
              overflow: 'hidden',
            }}
          >
            <div style={{ height: 38, display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px', background: c.paper2, borderBottom: `1px solid ${c.paper3}` }}>
              {[c.clay, c.ochre, c.pine].map((col) => (
                <span key={col} style={{ width: 10, height: 10, borderRadius: 5, background: col, opacity: 0.75 }} />
              ))}
              <div
                style={{
                  marginLeft: 10,
                  flex: 1,
                  height: 22,
                  borderRadius: radius.pill,
                  background: '#ffffff',
                  border: `1px solid ${c.paper3}`,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  fontFamily: font.body,
                  fontSize: 12,
                  color: c.muted,
                  direction: 'ltr',
                }}
              >
                app.example.com/sessions
              </div>
            </div>
            <div style={{ padding: '18px 22px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Mark size={26} />
                <div style={{ fontFamily: font.display, fontWeight: 600, fontSize: 25, color: c.ink }}>{t.qr.panel}</div>
              </div>
              <div style={{ marginTop: 6, fontFamily: font.body, fontSize: 14, lineHeight: 1.4, color: c.muted }}>
                {t.qr.hint}
              </div>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
                <div style={{ position: 'relative', padding: 10, background: '#fff', borderRadius: 16, border: `1px solid ${c.paper3}` }}>
                  <QrPlaceholder size={176} />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 16,
                      background: 'rgba(28,92,66,0.93)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      color: c.paper,
                      fontFamily: font.display,
                      fontWeight: 600,
                      fontSize: 24,
                      opacity: Math.min(1, linked),
                      transform: `scale(${0.9 + 0.1 * Math.min(1, linked)})`,
                    }}
                  >
                    <Check size={42} />
                    {t.qr.linked}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, fontFamily: font.body, fontWeight: 500, fontSize: 15, color: c.inkSoft }}>
                <span style={{ width: 11, height: 11, borderRadius: 6, background: linked > 0.5 ? c.pine : c.ochre }} />
                {linked > 0.5 ? t.qr.connected : t.qr.waiting}
              </div>
            </div>
          </div>
          {/* the phone, beside it, scanning the web app's QR with its camera */}
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 78,
              width: 192,
              height: 384,
              borderRadius: 34,
              background: c.ink,
              padding: 9,
              boxShadow: shadow.floating,
              opacity: Math.min(1, phoneIn),
              transform: `translate(${(1 - phoneIn) * 40}px, ${phoneFloat}px) rotate(-4deg)`,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 26,
                background: c.inkSoft,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: 30,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', top: 9, width: 54, height: 7, borderRadius: 4, background: c.ink }} />
              <div style={{ fontFamily: font.body, fontWeight: 600, fontSize: 13, color: c.paper }}>{t.qr.phoneTitle}</div>
              <div style={{ marginTop: 3, fontFamily: font.body, fontSize: 11, color: 'rgba(252,250,246,0.7)' }}>{t.qr.phoneSub}</div>
              <div style={{ position: 'relative', marginTop: 34, width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ padding: 6, background: 'rgba(255,255,255,0.92)', borderRadius: 8 }}>
                  <QrPlaceholder size={114} />
                </div>
                {corner({ left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 10 })}
                {corner({ right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 10 })}
                {corner({ left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 10 })}
                {corner({ right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 10 })}
                <div
                  style={{
                    position: 'absolute',
                    left: 10,
                    right: 10,
                    top: 12 + scanY,
                    height: 3,
                    borderRadius: 2,
                    background: c.clay,
                    boxShadow: '0 0 14px rgba(165,86,47,0.8)',
                    opacity: frame > 28 && frame < 100 ? 1 : 0,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 12,
                    background: 'rgba(28,92,66,0.92)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: c.paper,
                    opacity: Math.min(1, linked),
                  }}
                >
                  <Check size={52} />
                </div>
              </div>
              <div style={{ marginTop: 30, width: 120, height: 8, borderRadius: 4, background: 'rgba(252,250,246,0.18)' }} />
              <div style={{ marginTop: 8, width: 84, height: 8, borderRadius: 4, background: 'rgba(252,250,246,0.18)' }} />
            </div>
          </div>
        </Stage>
      }
    >
      <StepText step={2} title={t.qr.title} body={t.qr.body} />
      <Caption text={t.qr.caption} />
    </SceneFrame>
  );
}

// 4) Create an API key -----------------------------------------------------------

export function KeyScene({ duration }: SceneProps) {
  const frame = useCurrentFrame();
  const { t } = useLocale();
  const p = press(frame, 30);
  const chip = useSpring(36, { damping: 14, stiffness: 140 });
  const copied = frame > 92;
  const pc = press(frame, 92);
  return (
    <SceneFrame
      duration={duration}
      visual={
        <Stage>
          <Card style={{ width: 500 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: font.display, fontWeight: 600, fontSize: 28, color: c.ink }}>{t.key.cardTitle}</div>
              <Button pressed={p} style={{ height: 42, fontSize: 16, padding: '0 20px' }}>
                {t.key.create}
              </Button>
            </div>
            <div style={{ marginTop: 8, fontFamily: font.body, fontSize: 15, color: c.muted }}>{t.key.cardSub}</div>
            <div
              style={{
                marginTop: 24,
                padding: 18,
                borderRadius: 16,
                border: `1.5px solid ${c.ochre}`,
                background: 'rgba(192,138,46,0.1)',
                opacity: Math.min(1, chip),
                transform: `translateY(${(1 - chip) * 26}px) scale(${0.92 + 0.08 * chip})`,
                boxShadow: shadow.raised,
              }}
            >
              <div style={{ fontFamily: font.body, fontWeight: 600, fontSize: 14, color: '#7a5418', marginBottom: 10 }}>
                {t.key.once}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    flex: 1,
                    height: 46,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 18px',
                    borderRadius: radius.pill,
                    background: '#fff',
                    border: `1px solid ${c.paper3}`,
                    fontFamily: font.mono,
                    fontSize: 17,
                    color: c.ink,
                    direction: 'ltr',
                  }}
                >
                  wf_live_••••••••••3f9a
                </div>
                <Button variant="outline" pressed={pc} style={{ height: 46, fontSize: 16, padding: '0 18px', width: 110 }}>
                  {copied ? t.key.copied : t.key.copy}
                </Button>
              </div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10, opacity: fade(frame, 60, 74) }}>
              <Badge tone="pine">{t.key.session}</Badge>
              <Badge tone="pine">{t.key.rest}</Badge>
              <Badge tone="pine">{t.key.mcp}</Badge>
            </div>
          </Card>
        </Stage>
      }
    >
      <StepText step={3} title={t.key.title} body={t.key.body} />
      <Caption text={t.key.caption} />
    </SceneFrame>
  );
}

// 5) Send your first message --------------------------------------------------------

const curlLines = (message: string) => [
  { t: '$ curl -X POST "https://api.example.com/wa/sessions/<session-id>/messages/send-text" \\', color: c.paper },
  { t: '    -H "X-API-Key: <your-key>" \\', color: '#e7c08a' },
  { t: '    -H "Content-Type: application/json" \\', color: '#e7c08a' },
  { t: `    -d '{"chatId":"<number>@c.us","text":"${message}"}'`, color: '#9fd3b8' },
];

/** Frame (scene-relative) at which the sent bubble lands; the chime plays here. */
export function curlSentAt(message: string) {
  const total = curlLines(message).reduce((n, l) => n + l.t.length, 0);
  return Math.ceil(total / 2.6) + 34;
}

export function CurlScene({ duration }: SceneProps) {
  const frame = useCurrentFrame();
  const { t, rtl } = useLocale();
  const CURL_LINES = curlLines(t.curl.message);
  const shown = Math.max(0, Math.floor((frame - 20) * 2.6));
  let left = shown;
  const bubble = useSpring(curlSentAt(t.curl.message), { damping: 15, stiffness: 130 });
  const cursorOn = Math.floor(frame / 14) % 2 === 0;
  const head = fade(frame, 2, 16);
  return (
    <SceneFrame
      duration={duration}
      visual={
        <div style={{ position: 'absolute', left: 96, top: 236, width: 1088, direction: 'ltr' }}>
          <div
            style={{
              borderRadius: radius.box,
              background: c.ink,
              boxShadow: shadow.floating,
              overflow: 'hidden',
            }}
          >
            <div style={{ height: 42, display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px', background: c.inkSoft }}>
              <span style={{ width: 12, height: 12, borderRadius: 6, background: c.clay }} />
              <span style={{ width: 12, height: 12, borderRadius: 6, background: c.ochre }} />
              <span style={{ width: 12, height: 12, borderRadius: 6, background: '#3e7a5f' }} />
              <span style={{ marginLeft: 14, fontFamily: font.body, fontSize: 14, color: 'rgba(252,250,246,0.6)' }}>terminal</span>
            </div>
            <div style={{ padding: '22px 28px 26px', fontFamily: font.mono, fontSize: 17.5, lineHeight: 1.7, whiteSpace: 'pre', minHeight: 150 }}>
              {CURL_LINES.map((l, i) => {
                const n = Math.max(0, Math.min(l.t.length, left));
                left -= l.t.length;
                const isActive = n > 0 && n < l.t.length;
                const isLastDone = i === CURL_LINES.length - 1 && n === l.t.length;
                return (
                  <div key={i} style={{ color: l.color, height: 30 }}>
                    {l.t.slice(0, n)}
                    {(isActive || isLastDone) && cursorOn ? <span style={{ background: c.paper, color: c.ink }}> </span> : null}
                  </div>
                );
              })}
            </div>
          </div>
          {/* result: the message lands on the phone */}
          <div
            style={{
              position: 'absolute',
              right: 30,
              bottom: -58,
              opacity: Math.min(1, bubble),
              transform: `translateY(${(1 - bubble) * 30}px) scale(${0.85 + 0.15 * bubble})`,
              transformOrigin: 'bottom right',
            }}
          >
            <div
              style={{
                padding: '12px 18px',
                borderRadius: '18px 18px 6px 18px',
                background: c.pine,
                color: c.paper,
                fontFamily: font.body,
                fontSize: 18,
                boxShadow: shadow.floating,
                display: 'flex',
                alignItems: 'flex-end',
                gap: 10,
              }}
            >
              <span dir="auto">{t.curl.message}</span>
              <span style={{ fontSize: 12, opacity: 0.75, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                10:02 <Check size={13} />
              </span>
            </div>
          </div>
        </div>
      }
    >
      <div style={{ position: 'absolute', [rtl ? 'right' : 'left']: 96, top: 92, opacity: head }}>
        <div style={{ fontFamily: font.body, fontWeight: 600, fontSize: 17, letterSpacing: rtl ? 0 : '0.12em', textTransform: 'uppercase', color: c.clay }}>
          {t.step(4)}
        </div>
        <div style={{ marginTop: 12, fontFamily: font.display, fontWeight: 600, fontSize: rtl ? 48 : 54, letterSpacing: rtl ? 0 : '-0.02em', color: c.ink }}>
          {t.curl.title}
        </div>
      </div>
      <Caption text={t.curl.caption} />
    </SceneFrame>
  );
}

// 6) Paced auto-replies ----------------------------------------------------------

const THREAD = [
  { side: 'in', at: 18 },
  { side: 'out', at: 58 },
  { side: 'in', at: 92 },
  { side: 'out', at: 128 },
] as const;

/** Scene-relative frames at which a paced reply lands; the chime plays here. */
export const REPLY_AT = THREAD.filter((m) => m.side === 'out').map((m) => m.at);

function Bubble({ side, text, at }: { side: 'in' | 'out'; text: string; at: number }) {
  const frame = useCurrentFrame();
  const s = useSpring(at, { damping: 16, stiffness: 150 });
  const out = side === 'out';
  if (frame < at) return null;
  return (
    <div
      style={{
        alignSelf: out ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        padding: '11px 16px',
        fontFamily: font.body,
        fontSize: 17,
        lineHeight: 1.4,
        borderRadius: out ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
        background: out ? c.pine : c.paper2,
        color: out ? c.paper : c.ink,
        opacity: Math.min(1, s),
        transform: `translateY(${(1 - s) * 16}px) scale(${0.94 + 0.06 * s})`,
        transformOrigin: out ? 'bottom right' : 'bottom left',
      }}
    >
      {text}
    </div>
  );
}

function Typing({ from, to }: { from: number; to: number }) {
  const frame = useCurrentFrame();
  const { t } = useLocale();
  if (frame < from || frame >= to) return null;
  return (
    <div style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 10 }}>
      <Badge style={{ fontSize: 13, padding: '3px 10px' }}>{t.replies.paced}</Badge>
      <div style={{ display: 'flex', gap: 5, padding: '12px 16px', borderRadius: 16, background: 'rgba(28,92,66,0.12)' }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: c.pine,
              opacity: 0.35 + 0.65 * Math.max(0, Math.sin((frame - from) / 4 - i)),
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function RepliesScene({ duration }: SceneProps) {
  const frame = useCurrentFrame();
  const { t } = useLocale();
  const float = Math.sin(frame / 26) * 5;
  return (
    <SceneFrame
      duration={duration}
      visual={
        <Stage>
          <div style={{ transform: `translateY(${float}px)` }}>
            <Card style={{ width: 470, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 14, borderBottom: `1px solid ${c.paper2}` }}>
                <Mark size={30} />
                <span style={{ fontFamily: font.display, fontWeight: 600, fontSize: 19, color: c.ink }}>WaFine</span>
                <Badge tone="pine" style={{ marginLeft: 'auto', fontSize: 13 }}>
                  {t.replies.badge}
                </Badge>
              </div>
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10, height: 300, justifyContent: 'flex-start' }}>
                <Bubble {...THREAD[0]} text={t.replies.thread[0]} />
                <Typing from={30} to={THREAD[1].at} />
                <Bubble {...THREAD[1]} text={t.replies.thread[1]} />
                <Bubble {...THREAD[2]} text={t.replies.thread[2]} />
                <Typing from={102} to={THREAD[3].at} />
                <Bubble {...THREAD[3]} text={t.replies.thread[3]} />
              </div>
            </Card>
          </div>
        </Stage>
      }
    >
      <StepText step={5} title={t.replies.title} body={t.replies.body} />
      <Caption text={t.replies.caption} />
    </SceneFrame>
  );
}

// 7) Connect Claude via MCP --------------------------------------------------------

export function McpScene({ duration }: SceneProps) {
  const frame = useCurrentFrame();
  const { t } = useLocale();
  const url = typed('https://api.example.com/mcp', frame, 30, 0.9);
  const p = press(frame, 72);
  const ok = useSpring(78);
  return (
    <SceneFrame
      duration={duration}
      visual={
        <Stage>
          <div
            style={{
              width: 480,
              borderRadius: radius.box,
              background: c.pine,
              padding: 28,
              boxShadow: shadow.floating,
              color: c.paper,
            }}
          >
            <div style={{ fontFamily: font.body, fontSize: 14, color: 'rgba(252,250,246,0.7)' }}>{t.mcp.crumb}</div>
            <div style={{ marginTop: 6, marginBottom: 20, fontFamily: font.display, fontWeight: 600, fontSize: 28 }}>{t.mcp.cardTitle}</div>
            <Field dark label={t.mcp.name} value="WaFine" />
            <Field dark mono label={t.mcp.url} value={url} cursor={frame < 72} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
              <Button variant="paper" pressed={p}>
                {t.mcp.add}
              </Button>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  opacity: Math.min(1, ok),
                  transform: `translateX(${(1 - ok) * -12}px)`,
                  fontFamily: font.body,
                  fontWeight: 600,
                  fontSize: 17,
                }}
              >
                <span style={{ width: 30, height: 30, borderRadius: 15, background: c.paper, color: c.pine, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={18} />
                </span>
                {t.mcp.connected}
              </div>
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 4, right: 20, opacity: fade(frame, 90, 104), transform: `translateY(${(1 - fade(frame, 90, 104)) * 12}px)` }}>
            <Card style={{ padding: '14px 20px', boxShadow: shadow.raised }}>
              <div style={{ fontFamily: font.body, fontSize: 16, color: c.inkSoft }}>{t.mcp.prompt}</div>
            </Card>
          </div>
        </Stage>
      }
    >
      <StepText step={6} title={t.mcp.title} body={t.mcp.body} />
      <Caption text={t.mcp.caption} />
    </SceneFrame>
  );
}

// 8) Outro ---------------------------------------------------------------------

export function OutroScene({ duration }: SceneProps) {
  const frame = useCurrentFrame();
  const { t } = useLocale();
  const s = useSpring(4, { damping: 16, stiffness: 140 });
  const line = useSpring(14);
  const btn = useSpring(22);
  return (
    <SceneFrame duration={duration + 18}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, direction: 'ltr', transform: `scale(${0.85 + 0.15 * s})`, opacity: Math.min(1, s) }}>
          <div style={{ filter: 'drop-shadow(0 18px 26px rgba(28,92,66,0.26))', transform: `translateY(${Math.sin(frame / 22) * 4}px)` }}>
            <Mark size={120} />
          </div>
          <Wordmark size={84} />
        </div>
        <div
          style={{
            marginTop: 30,
            fontFamily: font.display,
            fontWeight: 600,
            fontSize: 34,
            color: c.pine,
            opacity: Math.min(1, line),
            transform: `translateY(${(1 - line) * 14}px)`,
          }}
        >
          {t.outro.line}
        </div>
        <div style={{ marginTop: 30, display: 'flex', gap: 14, opacity: Math.min(1, btn), transform: `translateY(${(1 - btn) * 14}px)` }}>
          <Button>{t.outro.join}</Button>
          <Button variant="outline">{t.outro.docs}</Button>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
}
