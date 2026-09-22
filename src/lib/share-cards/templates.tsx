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
  // Strip "Rs. ", "₹", and spaces
  const cleaned = raw.replace(/^Rs\.?\s*/i, '').replace(/^₹\s*/, '').trim();
  return cleaned || null;
}

function parseOfferText(offer?: string | null): { price: string; suffix: string; isCurrency: boolean } | null {
  if (!offer) return null;
  const trimmed = offer.trim();
  if (trimmed.includes('%')) {
    return {
      price: trimmed,
      suffix: '',
      isCurrency: false,
    };
  }
  // Match patterns like "Rs. 380 at 10+" or "₹380 at 10+" or "380 at 10+"
  const match = trimmed.match(/^(?:Rs\.?|₹)?\s*([0-9,.]+)\s*(at\s+[0-9]+.*|\/.*)?$/i);
  if (match && match[1]) {
    return {
      price: match[1],
      suffix: match[2]?.trim() || '',
      isCurrency: true,
    };
  }
  return {
    price: trimmed,
    suffix: '',
    isCurrency: false,
  };
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

function QrBox(props: {
  qrDataUrl?: string | null;
  href: string;
  size?: number;
  isPortrait?: boolean;
}) {
  const boxSize = props.size || (props.isPortrait ? 154 : 138);
  const imgSize = boxSize - 20;

  return (
    <div
      style={{
        ...flexCol,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        border: '2px solid #E5E7EB',
        borderRadius: 22,
        padding: 10,
        width: boxSize,
        height: boxSize,
        flexShrink: 0,
      }}
    >
      {props.qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.qrDataUrl}
          width={imgSize}
          height={imgSize}
          alt=""
          style={{ width: imgSize, height: imgSize, objectFit: 'contain' }}
        />
      ) : (
        <div
          style={{
            ...flexCol,
            alignItems: 'center',
            justifyContent: 'center',
            width: imgSize,
            height: imgSize,
            backgroundColor: '#F9FAFB',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            color: INK_MUTED,
            textAlign: 'center',
            padding: 8,
          }}
        >
          {props.href.replace(/^https?:\/\//, '').slice(0, 24)}
        </div>
      )}
    </div>
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
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  position: 'relative',
  overflow: 'hidden',
  justifyContent: 'space-between',
};

export function VoiceShareCard(props: {
  format: 'portrait' | 'square';
  name: string;
  badge: string;
  quote: string;
  titleLine: string;
  photoUrl: string | null;
  articleUrl: string;
  qrDataUrl?: string | null;
}) {
  const isPortrait = props.format === 'portrait';
  const topPad = isPortrait ? 48 : 36;
  const sidePad = isPortrait ? 52 : 40;
  const bottomPad = isPortrait ? 44 : 36;
  const imageH = isPortrait ? 550 : 420;
  const initial = (props.name.trim()[0] || 'V').toUpperCase();
  const quote = `\u201C${props.quote}\u201D`;

  return (
    <div style={{ ...shell, padding: `${topPad}px ${sidePad}px ${bottomPad}px` }}>
      {/* TOP BRAND HEADER */}
      <div style={{ ...flexRow, width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ ...flexRow, alignItems: 'center' }}>
          <div
            style={{
              ...flexRow,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: PRIMARY,
              color: '#FFFFFF',
              fontWeight: 900,
              fontSize: isPortrait ? 22 : 19,
              width: isPortrait ? 48 : 42,
              height: isPortrait ? 48 : 42,
              borderRadius: 14,
              marginRight: 14,
            }}
          >
            H1
          </div>
          <div style={{ ...flexCol }}>
            <span style={{ fontSize: isPortrait ? 26 : 22, fontWeight: 900, color: INK_PRIMARY, letterSpacing: -0.3 }}>
              Horeca1
            </span>
            <span
              style={{
                fontSize: isPortrait ? 13 : 11,
                fontWeight: 700,
                color: INK_MUTED,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                marginTop: 1,
              }}
            >
              Voices & Stories
            </span>
          </div>
        </div>

        <div
          style={{
            ...flexRow,
            alignItems: 'center',
            backgroundColor: '#F9FAFB',
            border: '1.5px solid #E5E7EB',
            padding: isPortrait ? '10px 18px' : '8px 14px',
            borderRadius: 24,
          }}
        >
          <span
            style={{
              fontSize: isPortrait ? 16 : 14,
              fontWeight: 800,
              letterSpacing: 1.2,
              color: PRIMARY,
              marginRight: 6,
            }}
          >
            {props.badge || 'HORECA1 VOICES'}
          </span>
          <ArrowUpRight size={isPortrait ? 20 : 17} color={PRIMARY} />
        </div>
      </div>

      {/* EDITORIAL PHOTO STAGE */}
      <div
        style={{
          ...flexCol,
          width: '100%',
          height: imageH,
          marginTop: isPortrait ? 24 : 16,
          marginBottom: isPortrait ? 24 : 16,
          backgroundColor: STAGE_BG,
          borderRadius: 28,
          border: `2px solid ${STAGE_BORDER}`,
          alignItems: 'center',
          justifyContent: 'center',
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
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
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
              fontSize: 84,
              fontWeight: 900,
              color: PRIMARY,
            }}
          >
            {initial}
          </div>
        )}
      </div>

      {/* EDITORIAL HEADLINE & QUOTE SECTION */}
      <div style={{ ...flexCol, width: '100%', flex: 1, justifyContent: 'space-between' }}>
        <div style={{ ...flexCol }}>
          <div
            style={{
              fontSize: isPortrait ? 48 : 38,
              fontWeight: 900,
              lineHeight: 1.15,
              color: INK_PRIMARY,
              letterSpacing: -0.6,
              maxHeight: isPortrait ? 116 : 90,
              overflow: 'hidden',
            }}
          >
            {clampTitle(props.name, isPortrait ? 52 : 44)}
          </div>

          {props.titleLine ? (
            <div
              style={{
                fontSize: isPortrait ? 26 : 21,
                fontWeight: 700,
                color: INK_SECONDARY,
                marginTop: 8,
              }}
            >
              {clampTitle(props.titleLine, 48)}
            </div>
          ) : null}

          <div
            style={{
              fontSize: isPortrait ? 28 : 22,
              fontWeight: 500,
              lineHeight: 1.35,
              color: INK_SECONDARY,
              marginTop: isPortrait ? 18 : 12,
              fontStyle: 'italic',
              maxHeight: isPortrait ? 120 : 90,
              overflow: 'hidden',
            }}
          >
            {quote}
          </div>
        </div>

        {/* TRUST LINE */}
        <div style={{ ...flexRow, alignItems: 'center', marginBottom: isPortrait ? 14 : 10 }}>
          <span style={{ fontSize: isPortrait ? 18 : 15, fontWeight: 700, color: PRIMARY, letterSpacing: 0.5 }}>
            Horeca1 Voices
          </span>
          <span style={{ fontSize: 16, color: INK_SUBTLE, marginLeft: 10, marginRight: 10 }}>•</span>
          <span style={{ fontSize: isPortrait ? 17 : 14, fontWeight: 600, color: INK_MUTED }}>
            Real stories from leaders shaping the food industry
          </span>
        </div>
      </div>

      {/* BOTTOM FOOTER / CTA & QR CODE */}
      <div
        style={{
          ...flexRow,
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          paddingTop: isPortrait ? 22 : 16,
          borderTop: `2px solid ${DIVIDER}`,
        }}
      >
        <div style={{ ...flexCol }}>
          <div
            style={{
              ...flexRow,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: PRIMARY,
              color: '#FFFFFF',
              fontSize: isPortrait ? 24 : 20,
              fontWeight: 800,
              padding: isPortrait ? '16px 36px' : '12px 28px',
              borderRadius: 18,
              letterSpacing: 0.3,
            }}
          >
            Read Full Story
          </div>
          <span style={{ fontSize: isPortrait ? 15 : 13, fontWeight: 600, color: INK_SUBTLE, marginTop: 8 }}>
            Scan QR code to read the complete interview
          </span>
        </div>

        <QrBox qrDataUrl={props.qrDataUrl} href={props.articleUrl} isPortrait={isPortrait} />
      </div>
    </div>
  );
}

export function CommerceShareCard(props: {
  format: 'portrait' | 'square';
  kicker: string;
  title: string;
  subtitle?: string;
  statLine?: string;
  offer?: string;
  /** Selling price */
  price?: string;
  /** Strike-through MRP / prior price */
  originalPrice?: string;
  /** e.g. "5% OFF" */
  discount?: string;
  cta: string;
  imageUrl?: string | null;
  pageUrl: string;
  qrDataUrl?: string | null;
}) {
  const isPortrait = props.format === 'portrait';
  const topPad = isPortrait ? 48 : 36;
  const sidePad = isPortrait ? 52 : 40;
  const bottomPad = isPortrait ? 44 : 36;
  const kicker = props.kicker.toUpperCase();
  const imageH = isPortrait ? 560 : 440;
  const initial = (props.title.trim()[0] || 'H').toUpperCase();

  const priceNum = parsePriceNumber(props.price);
  const mrpNum = parsePriceNumber(props.originalPrice);
  const offerParsed = parseOfferText(props.offer);

  return (
    <div style={{ ...shell, padding: `${topPad}px ${sidePad}px ${bottomPad}px` }}>
      {/* TOP BRAND HEADER */}
      <div style={{ ...flexRow, width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ ...flexRow, alignItems: 'center' }}>
          <div
            style={{
              ...flexRow,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: PRIMARY,
              color: '#FFFFFF',
              fontWeight: 900,
              fontSize: isPortrait ? 22 : 19,
              width: isPortrait ? 48 : 42,
              height: isPortrait ? 48 : 42,
              borderRadius: 14,
              marginRight: 14,
            }}
          >
            H1
          </div>
          <div style={{ ...flexCol }}>
            <span style={{ fontSize: isPortrait ? 26 : 22, fontWeight: 900, color: INK_PRIMARY, letterSpacing: -0.3 }}>
              Horeca1
            </span>
            <span
              style={{
                fontSize: isPortrait ? 13 : 11,
                fontWeight: 700,
                color: INK_MUTED,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginTop: 1,
              }}
            >
              B2B Wholesale Marketplace
            </span>
          </div>
        </div>

        <div
          style={{
            ...flexRow,
            alignItems: 'center',
            backgroundColor: '#F9FAFB',
            border: '1.5px solid #E5E7EB',
            padding: isPortrait ? '10px 18px' : '8px 14px',
            borderRadius: 24,
          }}
        >
          <span
            style={{
              fontSize: isPortrait ? 16 : 14,
              fontWeight: 800,
              letterSpacing: 1.2,
              color: PRIMARY,
              marginRight: 6,
            }}
          >
            {kicker === 'PRODUCT' ? 'HORECA1' : kicker}
          </span>
          <ArrowUpRight size={isPortrait ? 20 : 17} color={PRIMARY} />
        </div>
      </div>

      {/* PRODUCT / STORE IMAGE STAGE (38-42% card height) */}
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
              width: '90%',
              height: '90%',
              objectFit: 'contain',
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
              fontWeight: 900,
              color: PRIMARY,
            }}
          >
            {initial}
          </div>
        )}
      </div>

      {/* PRODUCT INFORMATION CONTAINER */}
      <div style={{ ...flexCol, width: '100%', flex: 1, justifyContent: 'space-between' }}>
        {/* Title and Vendor/Pack metadata */}
        <div style={{ ...flexCol }}>
          <div
            style={{
              fontSize: isPortrait ? 50 : 38,
              fontWeight: 900,
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

        {/* PRICING & DEALS ROW */}
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
            {/* HERO SELLING PRICE */}
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
                    fontWeight: 900,
                    letterSpacing: -1.2,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {priceNum}
                </span>
              </div>
            ) : null}

            {/* STRIKETHROUGH ORIGINAL MRP */}
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

            {/* DISCOUNT PILL */}
            {props.discount ? (
              <div
                style={{
                  ...flexRow,
                  alignItems: 'center',
                  backgroundColor: SUCCESS,
                  color: '#FFFFFF',
                  fontSize: isPortrait ? 22 : 17,
                  fontWeight: 800,
                  padding: isPortrait ? '6px 16px' : '4px 12px',
                  borderRadius: 12,
                  marginLeft: 14,
                  letterSpacing: 0.5,
                }}
              >
                {props.discount}
              </div>
            ) : null}

            {/* TIER / SLAB PRICING OFFER */}
            {offerParsed ? (
              <div
                style={{
                  ...flexRow,
                  alignItems: 'center',
                  backgroundColor: TINT_BG,
                  border: `1.5px solid ${TINT_BORDER}`,
                  color: TINT_TEXT,
                  fontSize: isPortrait ? 24 : 18,
                  fontWeight: 800,
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
                  fontWeight: 800,
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

        {/* TRUST / COMMERCE LINE */}
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

      {/* BOTTOM FOOTER / CTA & QR CODE */}
      <div
        style={{
          ...flexRow,
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          paddingTop: isPortrait ? 22 : 16,
          borderTop: `2px solid ${DIVIDER}`,
        }}
      >
        <div style={{ ...flexCol }}>
          <div
            style={{
              ...flexRow,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: PRIMARY,
              color: '#FFFFFF',
              fontSize: isPortrait ? 24 : 20,
              fontWeight: 800,
              padding: isPortrait ? '16px 36px' : '12px 28px',
              borderRadius: 18,
              letterSpacing: 0.3,
            }}
          >
            {props.cta || 'Open in Horeca1'}
          </div>
          <span style={{ fontSize: isPortrait ? 15 : 13, fontWeight: 600, color: INK_SUBTLE, marginTop: 8 }}>
            Scan QR code to view live stock & details
          </span>
        </div>

        <QrBox qrDataUrl={props.qrDataUrl} href={props.pageUrl} isPortrait={isPortrait} />
      </div>
    </div>
  );
}
