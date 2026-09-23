'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getDisplayStyle, parseImageMeta } from '@/lib/imageMeta';
import {
  HERO_FALLBACK,
  HERO_POS_MAX,
  HERO_POS_MIN,
  clampHeroPos,
  isSafeHeroHref,
  trimHeroCopy,
  type HeroAlignX,
} from '@/modules/homepage/homepage-hero.constants';

export type HeroPlacementValue = {
  showText: boolean;
  showCta: boolean;
  /** 0–100 from the left edge of the banner. */
  posX: number;
  /** 0–100 from the top edge of the banner. */
  posY: number;
  alignX: HeroAlignX;
};

type Props = {
  label: string;
  width: number;
  height: number;
  imageUrl: string;
  eyebrow: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
  value: HeroPlacementValue;
  disabled?: boolean;
  onChange: (next: HeroPlacementValue) => void;
};

const ALIGN_PRESETS: Record<HeroAlignX, { x: number; y: number }> = {
  left: { x: 4, y: 58 },
  center: { x: 50, y: 50 },
  right: { x: 72, y: 58 },
};

function VisibilityChip({
  label,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60',
        on
          ? 'border-primary bg-primary text-white'
          : 'border-[#E9E3DD] bg-white text-[#667085] hover:border-primary/40',
      )}
    >
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          on ? 'bg-white/25' : 'bg-[#D9D9D9]',
        )}
        aria-hidden
      >
        <span
          className={cn(
            'absolute top-[2px] left-[2px] h-4 w-4 rounded-full bg-white shadow transition-transform',
            on && 'translate-x-4',
          )}
        />
      </span>
      {label}
      <span className="opacity-80">{on ? 'On' : 'Off'}</span>
    </button>
  );
}

/**
 * Studio-style text-on-image canvas: drag the copy stack on the banner.
 * Positions are stored as 0–100% from the top-left of the live-size card.
 */
export function HeroPlacementCanvas({
  label,
  width,
  height,
  imageUrl,
  eyebrow,
  headline,
  ctaLabel,
  ctaHref,
  value,
  disabled,
  onChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const eyebrowText = value.showText ? trimHeroCopy(eyebrow) : '';
  const headlineText = value.showText ? trimHeroCopy(headline) : '';
  const labelText = ctaLabel.trim();
  const showButton = value.showCta && labelText.length > 0 && isSafeHeroHref(ctaHref);
  const hasCopy = Boolean(eyebrowText || headlineText || showButton);
  const parsed = parseImageMeta(imageUrl || HERO_FALLBACK.desktopImageUrl);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setScale(Math.max(0.2, Math.min(1, el.clientWidth / width)));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const patch = useCallback(
    (partial: Partial<HeroPlacementValue>) => {
      onChange({ ...value, ...partial });
    },
    [onChange, value],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || !hasCopy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: value.posX,
      originY: value.posY,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || disabled) return;
    const dxPct = ((e.clientX - drag.startClientX) / (width * scale)) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / (height * scale)) * 100;
    patch({
      posX: clampHeroPos(drag.originX + dxPct),
      posY: clampHeroPos(drag.originY + dyPct),
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const nudge = (dx: number, dy: number) => {
    if (disabled || !hasCopy) return;
    patch({
      posX: clampHeroPos(value.posX + dx),
      posY: clampHeroPos(value.posY + dy),
    });
  };

  const snapAlign = (side: HeroAlignX) => {
    const preset = ALIGN_PRESETS[side];
    patch({ alignX: side, posX: preset.x, posY: preset.y });
  };

  const textAlign =
    value.alignX === 'center' ? 'text-center' : value.alignX === 'right' ? 'text-right' : 'text-left';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold text-[#1C1C1C] mr-1">{label}</p>
        <VisibilityChip
          label="Text"
          on={value.showText}
          disabled={disabled}
          onToggle={() => patch({ showText: !value.showText })}
        />
        <VisibilityChip
          label="Button"
          on={value.showCta}
          disabled={disabled}
          onToggle={() => patch({ showCta: !value.showCta })}
        />
        <span className="w-1" />
        {(['left', 'center', 'right'] as const).map((side) => (
          <button
            key={side}
            type="button"
            title={`Snap ${side}`}
            disabled={disabled || !hasCopy}
            onClick={() => snapAlign(side)}
            className={cn(
              'h-8 min-w-8 rounded-lg border px-2 text-[12px] font-bold disabled:opacity-50',
              value.alignX === side
                ? 'border-primary bg-[#F8E8EC] text-primary'
                : 'border-[#E9E3DD] bg-white text-[#667085]',
            )}
          >
            {side === 'left' ? '⇤' : side === 'right' ? '⇥' : '↔'}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || !hasCopy}
          onClick={() => nudge(-1, 0)}
          className="h-8 rounded-lg border border-[#E9E3DD] bg-white px-2 text-[12px] font-semibold text-[#667085] disabled:opacity-50"
        >
          ←
        </button>
        <button
          type="button"
          disabled={disabled || !hasCopy}
          onClick={() => nudge(1, 0)}
          className="h-8 rounded-lg border border-[#E9E3DD] bg-white px-2 text-[12px] font-semibold text-[#667085] disabled:opacity-50"
        >
          →
        </button>
        <button
          type="button"
          disabled={disabled || !hasCopy}
          onClick={() => nudge(0, -1)}
          className="h-8 rounded-lg border border-[#E9E3DD] bg-white px-2 text-[12px] font-semibold text-[#667085] disabled:opacity-50"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={disabled || !hasCopy}
          onClick={() => nudge(0, 1)}
          className="h-8 rounded-lg border border-[#E9E3DD] bg-white px-2 text-[12px] font-semibold text-[#667085] disabled:opacity-50"
        >
          ↓
        </button>
        <span className="text-[11px] text-[#667085]">
          {Math.round(value.posX)}%, {Math.round(value.posY)}%
        </span>
      </div>
      <p className="text-[11px] text-[#667085]">
        Drag the text on the image to place it — same idea as studio.aneeverse. Arrow
        buttons nudge 1%. Live size {width}×{height}, scaled to fit.
      </p>

      <div
        ref={wrapRef}
        className="w-full overflow-hidden rounded-2xl border border-[#E9E3DD] bg-[#FAF7F2]"
        style={{ height: height * scale }}
      >
        <div
          className="relative origin-top-left overflow-hidden bg-[#4A141F] [container-type:inline-size]"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
          }}
        >
          {parsed.src ? (
            <Image
              src={parsed.src}
              alt=""
              fill
              sizes={`${width}px`}
              className="object-cover"
              style={getDisplayStyle(parsed.meta)}
            />
          ) : null}

          {hasCopy ? (
            <div
              role="button"
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  nudge(e.shiftKey ? -4 : -1, 0);
                }
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  nudge(e.shiftKey ? 4 : 1, 0);
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  nudge(0, e.shiftKey ? -4 : -1);
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  nudge(0, e.shiftKey ? 4 : 1);
                }
              }}
              className={cn(
                'absolute z-10 max-w-[78%] cursor-grab touch-none select-none rounded-xl border border-white/40 bg-black/10 p-3 backdrop-blur-[1px] active:cursor-grabbing',
                textAlign,
                disabled && 'pointer-events-none opacity-80',
              )}
              style={{
                left: `${clampHeroPos(value.posX)}%`,
                top: `${clampHeroPos(value.posY)}%`,
                transform:
                  value.alignX === 'center'
                    ? 'translate(-50%, 0)'
                    : value.alignX === 'right'
                      ? 'translate(-100%, 0)'
                      : 'translate(0, 0)',
              }}
            >
              {eyebrowText ? (
                <p className="mb-1.5 whitespace-pre-line text-[11px] font-semibold uppercase leading-snug tracking-[0.14em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                  {eyebrowText}
                </p>
              ) : null}
              {headlineText ? (
                <p
                  className={cn(
                    'mb-3 whitespace-pre-line font-bold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]',
                    width > 500
                      ? 'text-[clamp(1.25rem,2.2cqw,1.85rem)]'
                      : 'text-[clamp(1.25rem,4.8cqw,1.5rem)]',
                  )}
                >
                  {headlineText}
                </p>
              ) : null}
              {showButton ? (
                <span
                  className={cn(
                    'inline-flex items-center justify-center rounded-xl bg-white px-5 font-semibold text-primary shadow-md',
                    width > 500 ? 'min-h-11 text-[13px]' : 'min-h-12 text-[13px]',
                  )}
                >
                  {labelText}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] font-medium text-white/70">
              Image only — turn Text or Button on to place them
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { HERO_POS_MIN, HERO_POS_MAX };
