import type { CSSProperties, ReactNode } from 'react';

const PRIMARY = '#6B1D2E';
const CARD_BG = '#FFFFFF';
const STAGE_BG = '#F8FAFC';
const STAGE_BORDER = '#E2E8F0';
const DIVIDER = '#F1F5F9';
const INK_PRIMARY = '#111827';
const INK_SECONDARY = '#374151';
const INK_MUTED = '#6B7280';
const INK_SUBTLE = '#9CA3AF';
const SUCCESS = '#16A34A';
const TINT_BG = '#FDF2F4';
const TINT_BORDER = '#FCE7EB';
const TINT_TEXT = '#6B1D2E';
const FONT = 'Inter';

export function RupeeGlyph(props: {
  size?: number;
  strokeWidth?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const { size = 36, strokeWidth = 2.8, color = 'currentColor', style } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'flex', ...style }}
    >
      <path d="M6 3h12" />
      <path d="M6 8h12" />
      <path d="m6 13 8.5 8" />
      <path d="M6 13h3" />
      <path d="M9 13c6.667 0 6.667-10 0-10" />
    </svg>
  );
}

export function ArrowUpRight(props: { size?: number; color?: string }) {
  const { size = 20, color = PRIMARY } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'flex' }}
    >
      <path d="M7 17L17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

function BadgeCheckGlyph(props: { size?: number }) {
  const size = props.size ?? 28;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: 'flex' }}
    >
      <circle cx="12" cy="12" r="10" fill="#3B82F6" />
      <path
        d="M8.5 12.5l2.2 2.2 4.8-5"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShoppingBagGlyph(props: { size?: number; color?: string }) {
  const size = props.size ?? 18;
  const color = props.color ?? '#FFFFFF';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'flex' }}
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

export function StarGlyph(props: { size?: number; color?: string; style?: CSSProperties }) {
  const { size = 18, color = '#EAB308', style } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'flex', ...style }}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function parsePriceNumber(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^Rs\.?\s*/i, '').replace(/^₹\s*/, '').trim();
  return cleaned || null;
}

function parseOfferText(offer?: string | null): { price: string; suffix: string; isCurrency: boolean } | null {
  if (!offer) return null;
  const trimmed = offer.trim();
  if (trimmed.includes('%')) {
    return { price: trimmed, suffix: '', isCurrency: false };
  }
  const match = trimmed.match(/^(?:Rs\.?|₹)?\s*([0-9,.]+)\s*(at\s+[0-9]+.*|\/.*)?$/i);
  if (match && match[1]) {
    return {
      price: match[1],
      suffix: match[2]?.trim() || '',
      isCurrency: true,
    };
  }
  return { price: trimmed, suffix: '', isCurrency: false };
}

function renderStatSegment(seg: string, isPortrait: boolean): ReactNode {
  if (seg.includes('★')) {
    const [num, ...rest] = seg.split('★');
    return (
      <div key={seg} style={{ ...flexRow, alignItems: 'center' }}>
        <span style={{ fontSize: isPortrait ? 26 : 21, fontWeight: 700, color: INK_MUTED, marginRight: 3 }}>
          {num.trim()}
        </span>
        <StarGlyph size={isPortrait ? 20 : 16} style={{ marginRight: 4 }} />
        {rest.length > 0 && rest.join('★').trim() ? (
          <span style={{ fontSize: isPortrait ? 26 : 21, fontWeight: 600, color: INK_MUTED }}>
            {rest.join('★').trim()}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <span key={seg} style={{ fontSize: isPortrait ? 26 : 21, fontWeight: 600, color: INK_MUTED }}>
      {seg}
    </span>
  );
}

function clampTitle(title: string, max = 72): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

const flexCol: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const flexRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
};

const shell: CSSProperties = {
  ...flexCol,
  width: '100%',
  height: '100%',
  backgroundColor: CARD_BG,
  color: INK_PRIMARY,
  fontFamily: FONT,
  position: 'relative',
  overflow: 'hidden',
  justifyContent: 'space-between',
};

function BrandLockup(props: { logoUrl?: string | null; isPortrait: boolean }) {
  const height = props.isPortrait ? 86 : 70;
  const width = props.isPortrait ? 320 : 260;
  if (props.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={props.logoUrl}
        alt="Horeca1"
        width={width}
        height={height}
        style={{ width, height, objectFit: 'contain', objectPosition: 'left center' }}
      />
    );
  }
  return (
    <div style={{ ...flexRow, alignItems: 'center' }}>
      <div
        style={{
          ...flexRow,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: PRIMARY,
          color: '#FFFFFF',
          fontWeight: 700,
          fontSize: props.isPortrait ? 28 : 24,
          width: props.isPortrait ? 64 : 56,
          height: props.isPortrait ? 64 : 56,
          borderRadius: 16,
          marginRight: 14,
        }}
      >
        H1
      </div>
      <span style={{ fontSize: props.isPortrait ? 36 : 30, fontWeight: 700, color: INK_PRIMARY }}>
        Horeca1
      </span>
    </div>
  );
}

function HeaderChip(props: { label: string; isPortrait: boolean }) {
  return (
    <div
      style={{
        ...flexRow,
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        border: '1.5px solid #E5E7EB',
        padding: props.isPortrait ? '10px 18px' : '8px 14px',
        borderRadius: 24,
      }}
    >
      <span
        style={{
          fontSize: props.isPortrait ? 16 : 14,
          fontWeight: 700,
          letterSpacing: 1.2,
          color: PRIMARY,
          marginRight: 6,
        }}
      >
        {props.label}
      </span>
      <ArrowUpRight size={props.isPortrait ? 20 : 17} color={PRIMARY} />
    </div>
  );
}

/**
 * Brand share card — full-bleed like BrandStoreCard.
 * No white chrome, no Horeca1 logo header — only the cover + overlay.
 */
export function BrandShareCard(props: {
  format: 'portrait' | 'square';
  name: string;
  categoryLine?: string;
  productCount?: number;
  imageUrl?: string | null;
  bgColor?: string | null;
}) {
  const isPortrait = props.format === 'portrait';
  const bg = props.bgColor?.trim() || PRIMARY;
  const count = props.productCount ?? 0;
  const initial = (props.name.trim()[0] || 'B').toUpperCase();

  return (
    <div
      style={{
        ...shell,
        padding: 0,
        backgroundColor: bg,
        justifyContent: 'flex-end',
      }}
    >
      {props.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.imageUrl}
          alt=""
          width={1080}
          height={isPortrait ? 1350 : 1080}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            ...flexCol,
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 120,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          {initial}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '58%',
          backgroundImage:
            'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)',
        }}
      />

      <div
        style={{
          ...flexCol,
          position: 'relative',
          padding: isPortrait ? '48px 52px 56px' : '36px 40px 44px',
          color: '#FFFFFF',
        }}
      >
        <div style={{ ...flexRow, alignItems: 'center' }}>
          <span
            style={{
              fontSize: isPortrait ? 56 : 44,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: -0.6,
              color: '#FFFFFF',
              maxWidth: isPortrait ? 900 : 780,
              overflow: 'hidden',
            }}
          >
            {clampTitle(props.name, isPortrait ? 48 : 40)}
          </span>
          <div style={{ marginLeft: 12, display: 'flex' }}>
            <BadgeCheckGlyph size={isPortrait ? 36 : 30} />
          </div>
        </div>

        {props.categoryLine ? (
          <span
            style={{
              fontSize: isPortrait ? 28 : 22,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.82)',
              marginTop: 12,
            }}
          >
            {clampTitle(props.categoryLine, 56)}
          </span>
        ) : null}

        {count > 0 ? (
          <div
            style={{
              ...flexRow,
              alignItems: 'center',
              alignSelf: 'flex-start',
              marginTop: isPortrait ? 24 : 18,
              backgroundColor: 'rgba(255,255,255,0.20)',
              border: '1.5px solid rgba(255,255,255,0.30)',
              borderRadius: 999,
              padding: isPortrait ? '10px 18px' : '8px 14px',
            }}
          >
            <ShoppingBagGlyph size={isPortrait ? 18 : 15} />
            <span
              style={{
                marginLeft: 8,
                fontSize: isPortrait ? 22 : 17,
                fontWeight: 600,
                color: '#FFFFFF',
                letterSpacing: 0.2,
              }}
            >
              {count} {count === 1 ? 'item' : 'items'}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Voices share card — mirrors VoiceStoryCard layout (no QR). */
export function VoiceShareCard(props: {
  format: 'portrait' | 'square';
  name: string;
  badge: string;
  quote: string;
  titleLine: string;
  photoUrl: string | null;
  logoUrl?: string | null;
}) {
  const isPortrait = props.format === 'portrait';
  const topPad = isPortrait ? 48 : 36;
  const sidePad = isPortrait ? 52 : 40;
  const bottomPad = isPortrait ? 44 : 36;
  const imageH = isPortrait ? 620 : 460;
  const initial = (props.name.trim()[0] || 'V').toUpperCase();
  const quote = `\u201C${props.quote}\u201D`;
  const badge = (props.badge || 'HORECA1 VOICES').toUpperCase();

  return (
    <div style={{ ...shell, padding: `${topPad}px ${sidePad}px ${bottomPad}px` }}>
      <div style={{ ...flexRow, width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
        <BrandLockup logoUrl={props.logoUrl} isPortrait={isPortrait} />
        <HeaderChip label="HORECA1 VOICES" isPortrait={isPortrait} />
      </div>

      <div
        style={{
          ...flexCol,
          width: '100%',
          height: imageH,
          marginTop: isPortrait ? 24 : 16,
          marginBottom: isPortrait ? 28 : 18,
          backgroundColor: STAGE_BG,
          borderRadius: 28,
          border: `2px solid ${STAGE_BORDER}`,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {props.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.photoUrl}
            alt=""
            width={1080}
            height={imageH}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              ...flexCol,
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#EDE9FE',
              fontSize: 84,
              fontWeight: 700,
              color: PRIMARY,
            }}
          >
            {initial}
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 45%)',
          }}
        />

        {badge ? (
          <div
            style={{
              ...flexRow,
              position: 'absolute',
              top: isPortrait ? 28 : 22,
              left: isPortrait ? 28 : 22,
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.95)',
              border: '1.5px solid rgba(255,255,255,0.6)',
              borderRadius: 999,
              padding: isPortrait ? '10px 18px' : '8px 14px',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: PRIMARY,
                marginRight: 10,
              }}
            />
            <span
              style={{
                fontSize: isPortrait ? 16 : 13,
                fontWeight: 700,
                letterSpacing: 1.1,
                color: PRIMARY,
              }}
            >
              {badge}
            </span>
          </div>
        ) : null}
      </div>

      <div style={{ ...flexCol, width: '100%', flex: 1, justifyContent: 'space-between' }}>
        <div style={{ ...flexCol }}>
          <div
            style={{
              fontSize: isPortrait ? 44 : 34,
              fontWeight: 700,
              lineHeight: 1.15,
              color: INK_PRIMARY,
              letterSpacing: -0.5,
              maxHeight: isPortrait ? 110 : 84,
              overflow: 'hidden',
            }}
          >
            {clampTitle(props.name, isPortrait ? 52 : 44)}
          </div>

          {props.titleLine ? (
            <div
              style={{
                fontSize: isPortrait ? 24 : 19,
                fontWeight: 500,
                color: INK_MUTED,
                marginTop: 8,
              }}
            >
              {clampTitle(props.titleLine, 56)}
            </div>
          ) : null}

          <div
            style={{
              fontSize: isPortrait ? 26 : 20,
              fontWeight: 400,
              lineHeight: 1.4,
              color: INK_SECONDARY,
              marginTop: isPortrait ? 18 : 12,
              fontStyle: 'italic',
              maxHeight: isPortrait ? 130 : 100,
              overflow: 'hidden',
            }}
          >
            {quote}
          </div>
        </div>

        <div
          style={{
            ...flexRow,
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            marginTop: isPortrait ? 28 : 18,
            paddingTop: isPortrait ? 22 : 16,
            borderTop: `2px solid ${DIVIDER}`,
          }}
        >
          <div style={{ ...flexRow, alignItems: 'center' }}>
            <span
              style={{
                fontSize: isPortrait ? 24 : 19,
                fontWeight: 700,
                color: PRIMARY,
              }}
            >
              Read story
            </span>
            <span style={{ marginLeft: 8, display: 'flex' }}>
              <svg
                width={isPortrait ? 22 : 18}
                height={isPortrait ? 22 : 18}
                viewBox="0 0 24 24"
                fill="none"
                stroke={PRIMARY}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Product / vendor / collection / deal share card (no QR). */
export function CommerceShareCard(props: {
  format: 'portrait' | 'square';
  kicker: string;
  title: string;
  subtitle?: string;
  statLine?: string;
  offer?: string;
  price?: string;
  originalPrice?: string;
  discount?: string;
  cta: string;
  imageUrl?: string | null;
  imageFit?: 'cover' | 'contain';
  logoUrl?: string | null;
}) {
  const isPortrait = props.format === 'portrait';
  const topPad = isPortrait ? 48 : 36;
  const sidePad = isPortrait ? 52 : 40;
  const bottomPad = isPortrait ? 44 : 36;
  const kicker = props.kicker.toUpperCase();
  const imageFit = props.imageFit ?? 'contain';
  const imageH = imageFit === 'cover'
    ? (isPortrait ? 620 : 480)
    : (isPortrait ? 680 : 520);
  const initial = (props.title.trim()[0] || 'H').toUpperCase();

  const priceNum = parsePriceNumber(props.price);
  const mrpNum = parsePriceNumber(props.originalPrice);
  const offerParsed = parseOfferText(props.offer);

  return (
    <div style={{ ...shell, padding: `${topPad}px ${sidePad}px ${bottomPad}px` }}>
      <div style={{ ...flexRow, width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
        <BrandLockup logoUrl={props.logoUrl} isPortrait={isPortrait} />
        <HeaderChip label={kicker === 'PRODUCT' ? 'HORECA1' : kicker} isPortrait={isPortrait} />
      </div>

      <div
        style={{
          ...flexCol,
          width: '100%',
          height: imageH,
          marginTop: isPortrait ? 24 : 16,
          marginBottom: isPortrait ? 26 : 16,
          backgroundColor: STAGE_BG,
          borderRadius: 28,
          border: `2px solid ${STAGE_BORDER}`,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {props.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.imageUrl}
            alt=""
            width={imageH}
            height={imageH}
            style={{
              width: '100%',
              height: '100%',
              objectFit: imageFit,
              objectPosition: 'center',
            }}
          />
        ) : (
          <div
            style={{
              ...flexCol,
              width: 180,
              height: 180,
              borderRadius: 28,
              backgroundColor: '#EDE9FE',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 88,
              fontWeight: 700,
              color: PRIMARY,
            }}
          >
            {initial}
          </div>
        )}
      </div>

      <div style={{ ...flexCol, width: '100%', flex: 1, justifyContent: 'space-between' }}>
        <div style={{ ...flexCol }}>
          <div
            style={{
              fontSize: isPortrait ? 50 : 38,
              fontWeight: 700,
              lineHeight: 1.16,
              color: INK_PRIMARY,
              letterSpacing: -0.8,
              maxHeight: isPortrait ? 120 : 92,
              overflow: 'hidden',
            }}
          >
            {clampTitle(props.title, isPortrait ? 58 : 46)}
          </div>

          {(props.subtitle || props.statLine) ? (
            <div style={{ ...flexRow, marginTop: isPortrait ? 12 : 8, alignItems: 'center' }}>
              {props.subtitle ? (
                <span style={{ fontSize: isPortrait ? 26 : 21, fontWeight: 700, color: INK_SECONDARY }}>
                  {clampTitle(props.subtitle, 42)}
                </span>
              ) : null}
              {props.subtitle && props.statLine ? (
                <span style={{ fontSize: isPortrait ? 22 : 18, color: INK_SUBTLE, marginLeft: 12, marginRight: 12 }}>
                  •
                </span>
              ) : null}
              {props.statLine ? (
                <div style={{ ...flexRow, alignItems: 'center' }}>
                  {props.statLine.split('·').map((part, idx) => (
                    <div key={idx} style={{ ...flexRow, alignItems: 'center' }}>
                      {idx > 0 ? (
                        <span style={{ fontSize: isPortrait ? 22 : 18, color: INK_SUBTLE, marginLeft: 10, marginRight: 10 }}>
                          •
                        </span>
                      ) : null}
                      {renderStatSegment(part.trim(), isPortrait)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {(priceNum || props.discount || offerParsed) ? (
          <div
            style={{
              ...flexRow,
              alignItems: 'center',
              marginTop: isPortrait ? 16 : 10,
              marginBottom: isPortrait ? 16 : 10,
              flexWrap: 'wrap',
            }}
          >
            {priceNum ? (
              <div style={{ ...flexRow, alignItems: 'center', color: INK_PRIMARY }}>
                <RupeeGlyph
                  size={isPortrait ? 48 : 38}
                  strokeWidth={3.2}
                  color={INK_PRIMARY}
                  style={{ marginRight: 2 }}
                />
                <span
                  style={{
                    fontSize: isPortrait ? 60 : 46,
                    fontWeight: 700,
                    letterSpacing: -1.2,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {priceNum}
                </span>
              </div>
            ) : null}

            {mrpNum ? (
              <div
                style={{
                  ...flexRow,
                  alignItems: 'center',
                  marginLeft: 14,
                  color: INK_SUBTLE,
                  textDecoration: 'line-through',
                }}
              >
                <RupeeGlyph
                  size={isPortrait ? 28 : 22}
                  strokeWidth={2.4}
                  color={INK_SUBTLE}
                  style={{ marginRight: 1 }}
                />
                <span
                  style={{
                    fontSize: isPortrait ? 32 : 24,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {mrpNum}
                </span>
              </div>
            ) : null}

            {props.discount ? (
              <div
                style={{
                  ...flexRow,
                  alignItems: 'center',
                  backgroundColor: SUCCESS,
                  color: '#FFFFFF',
                  fontSize: isPortrait ? 22 : 17,
                  fontWeight: 700,
                  padding: isPortrait ? '6px 16px' : '4px 12px',
                  borderRadius: 12,
                  marginLeft: 14,
                  letterSpacing: 0.5,
                }}
              >
                {props.discount}
              </div>
            ) : null}

            {offerParsed ? (
              <div
                style={{
                  ...flexRow,
                  alignItems: 'center',
                  backgroundColor: TINT_BG,
                  border: `1.5px solid ${TINT_BORDER}`,
                  color: TINT_TEXT,
                  fontSize: isPortrait ? 24 : 18,
                  fontWeight: 700,
                  padding: isPortrait ? '8px 18px' : '6px 14px',
                  borderRadius: 14,
                  marginLeft: 16,
                }}
              >
                {offerParsed.isCurrency ? (
                  <RupeeGlyph
                    size={isPortrait ? 22 : 18}
                    strokeWidth={2.8}
                    color={TINT_TEXT}
                    style={{ marginRight: 2 }}
                  />
                ) : null}
                <span style={{ marginRight: offerParsed.suffix ? 6 : 0 }}>{offerParsed.price}</span>
                {offerParsed.suffix ? (
                  <span style={{ fontWeight: 700, color: '#832338', fontSize: isPortrait ? 21 : 16 }}>
                    {offerParsed.suffix}
                  </span>
                ) : null}
              </div>
            ) : props.offer ? (
              <div
                style={{
                  ...flexRow,
                  alignItems: 'center',
                  backgroundColor: TINT_BG,
                  border: `1.5px solid ${TINT_BORDER}`,
                  color: TINT_TEXT,
                  fontSize: isPortrait ? 22 : 17,
                  fontWeight: 700,
                  padding: isPortrait ? '8px 18px' : '6px 14px',
                  borderRadius: 14,
                  marginLeft: 16,
                }}
              >
                {props.offer}
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ ...flexRow, alignItems: 'center', marginBottom: isPortrait ? 16 : 10 }}>
          <span style={{ fontSize: isPortrait ? 18 : 15, fontWeight: 700, color: PRIMARY, letterSpacing: 0.5 }}>
            Available on Horeca1
          </span>
          <span style={{ fontSize: 16, color: INK_SUBTLE, marginLeft: 10, marginRight: 10 }}>•</span>
          <span style={{ fontSize: isPortrait ? 18 : 15, fontWeight: 600, color: INK_MUTED }}>
            Direct Supplier Wholesale Pricing
          </span>
        </div>
      </div>

      <div
        style={{
          ...flexRow,
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '100%',
          paddingTop: isPortrait ? 22 : 16,
          borderTop: `2px solid ${DIVIDER}`,
        }}
      >
        <div
          style={{
            ...flexRow,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: PRIMARY,
            color: '#FFFFFF',
            fontSize: isPortrait ? 24 : 20,
            fontWeight: 700,
            padding: isPortrait ? '16px 36px' : '12px 28px',
            borderRadius: 18,
            letterSpacing: 0.3,
          }}
        >
          {props.cta || 'Open in Horeca1'}
        </div>
      </div>
    </div>
  );
}
