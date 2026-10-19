'use client';

import { useState, useSyncExternalStore } from 'react';
import { BrandMark } from '@/components/brand';
import { Badge } from '@/components/ui/badge';

type ThreadMessage = { side: 'in' | 'out'; text: string; time?: string };
type ThreadData = { label: string; messages: ThreadMessage[] };

/** Subscribes to prefers-reduced-motion (no-preference flips re-render the stage). */
function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: no-preference)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * Motion allowance via useSyncExternalStore: false on the server and before
 * mount, then the live prefers-reduced-motion state — no setState-in-effect.
 */
function useMotionOk() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: no-preference)').matches,
    () => false,
  );
}

/**
 * The hero visual: a muted, looping product clip behind a floating, real HTML
 * chat thread. `HERO_CLIP` files live under `app/web/public/media/`; none is
 * committed yet, so the panel renders its CSS fallback (the poster state) until
 * the owner drops `hero-loop(.mp4|-poster.png)` in. The markup path stays the
 * same either way, and the clip never plays under reduced motion.
 */
const HERO_CLIP = { src: '/media/hero-loop.mp4', poster: '/media/hero-loop-poster.png' } as const;

export function HeroStage({
  thread,
  caption,
  className = '',
}: {
  thread: ThreadData;
  caption: string;
  className?: string;
}) {
  const motionOk = useMotionOk();
  return (
    <figure className={`relative mx-auto w-full max-w-md ${className}`.trim()}>
      {/* Panel: the drifting backdrop. The rounded box clips the looping clip. */}
      <div className={`absolute inset-0 overflow-hidden rounded-box bg-neutral ${motionOk ? 'hero-drift' : ''}`}>
        <VideoLayer motionOk={motionOk} />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-neutral/20 via-primary/5 to-primary/25" />
      </div>
      {/* The conversation floats over the panel and drifts the gentlest counter-move. */}
      <div className={`relative px-4 pb-5 pt-10 sm:px-7 ${motionOk ? 'hero-drift-soft' : ''}`.trim()}>
        <div className="relative mx-auto w-full max-w-sm rounded-box border border-base-300 bg-base-100 p-4 shadow-floating sm:p-5">
          <div className="flex items-center gap-2 border-b border-base-200 pb-3">
            <BrandMark size={22} />
            <span className="font-display text-sm font-semibold">WaFine</span>
            <Badge size="sm" className="ms-auto font-medium">
              {thread.label}
            </Badge>
          </div>
          <ol className="mt-4 flex flex-col gap-2.5">
            {thread.messages.map((message, index) => (
              <MessageBubble key={`${message.side}-${index}`} message={message} />
            ))}
          </ol>
        </div>
      </div>
      <figcaption className="relative pb-3 text-center text-sm text-base-content/75">{caption}</figcaption>
    </figure>
  );
}

function VideoLayer({ motionOk }: { motionOk: boolean }) {
  // Failed fetch (clip not committed yet, 404) or reduced motion: calm CSS panel.
  const [videoFailed, setVideoFailed] = useState(false);
  const showVideo = motionOk && !videoFailed;
  return showVideo ? (
    <video
      className="absolute inset-0 h-full w-full object-cover"
      src={HERO_CLIP.src}
      poster={HERO_CLIP.poster || undefined}
      muted
      loop
      playsInline
      autoPlay
      preload="metadata"
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
      onError={() => setVideoFailed(true)}
    />
  ) : (
    <PlaceholderPanel />
  );
}

/**
 * The poster fallback, drawn in CSS only (no photography or illustrations per
 * the design system): pine ground, three quiet rings, an empty chat arch.
 */
function PlaceholderPanel() {
  return (
    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-primary via-primary-hover to-neutral">
      <div className="absolute inset-0 grid place-items-center">
        <span className="absolute size-52 rounded-full border border-primary-content/15" />
        <span className="absolute size-80 rounded-full border border-primary-content/10" />
        <span className="absolute size-[28rem] rounded-full border border-primary-content/5" />
      </div>
      <svg
        className="absolute inset-0 m-auto text-primary-content/25"
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.7-.3-3.9-.9L3 21l1.9-5.6a8.5 8.5 0 1 1 16.1-3.9Z" />
      </svg>
    </div>
  );
}

function MessageBubble({ message }: { message: ThreadMessage }) {
  const outgoing = message.side === 'out';
  return (
    <li
      className={`flex max-w-[85%] flex-col ${
        outgoing
          ? 'self-end items-end rounded-2xl rounded-ee-md bg-primary text-primary-content'
          : 'self-start items-start rounded-2xl rounded-ss-md bg-base-200 text-base-content'
      }`}
    >
      {message.time && <span className="mb-0.5 ps-3.5 pt-2 text-[11px] text-current opacity-70">{message.time}</span>}
      <p className="px-3.5 pb-2.5 text-sm leading-relaxed">
        {message.text}
        {outgoing && <Ticks className="ms-1.5 inline align-baseline" />}
      </p>
    </li>
  );
}

function Ticks({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="12"
      viewBox="0 0 16 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="m1 6.5 2.5 3L9 2.5" />
      <path d="m6.5 7.5 2 2L15 2.5" />
    </svg>
  );
}
