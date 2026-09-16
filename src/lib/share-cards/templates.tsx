import type { CSSProperties } from 'react';

const PRIMARY = '#6B1D2E';
const PAGE = '#FAF7F2';
const IVORY = '#FAF5EC';
const CARD = '#FFFFFF';
const DIVIDER = '#E9E3DD';
const INK = '#1C1C1C';
const SECONDARY = '#667085';
const MUTED = '#6B7280';
const SUCCESS = '#16A34A';
const TINT = '#F8E8EC';

function QrOrUrl(props: { qrDataUrl?: string | null; href: string }) {
  if (props.qrDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={props.qrDataUrl} width={108} height={108} alt="" />
    );
  }
  return (
    <div style={{ ...flexCol, fontSize: 16, maxWidth: 360, color: MUTED }}>
      {props.href.replace(/^https?:\/\//, '')}
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
  background: PAGE,
  color: INK,
  fontFamily: 'Inter, system-ui, sans-serif',
  position: 'relative',
  overflow: 'hidden',
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
  const topPad = isPortrait ? 70 : 48;
  const bottomPad = isPortrait ? 90 : 48;
  const quote = `\u201C${props.quote}\u201D`;

  return (
    <div style={{ ...shell, background: PRIMARY, color: 'white', padding: `${topPad}px 56px ${bottomPad}px` }}>
      {props.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.photoUrl}
          alt=""
          width={1080}
          height={isPortrait ? 1920 : 1080}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.35,
          }}
        />
      ) : null}
      <div
        style={{
          ...flexCol,
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(74,20,31,0.25) 0%, rgba(74,20,31,0.92) 72%)',
        }}
      />
      <div style={{ ...flexCol, position: 'relative', height: '100%' }}>
        <div
          style={{
            ...flexRow,
            alignSelf: 'flex-start',
            background: 'white',
            color: PRIMARY,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 1.4,
            padding: '8px 16px',
            borderRadius: 8,
          }}
        >
          {props.badge}
        </div>
        <div style={{ ...flexCol, marginTop: 'auto' }}>
          <div style={{ ...flexCol, fontSize: isPortrait ? 64 : 48, fontWeight: 800, lineHeight: 1.1 }}>
            {clampTitle(props.name, isPortrait ? 48 : 40)}
          </div>
          {props.titleLine ? (
            <div style={{ ...flexCol, marginTop: 12, fontSize: 28, opacity: 0.9 }}>{props.titleLine}</div>
          ) : null}
          <div style={{ ...flexCol, marginTop: 28, fontSize: isPortrait ? 36 : 30, lineHeight: 1.35, maxWidth: 900 }}>
            {quote}
          </div>
          <div style={{ ...flexRow, marginTop: 40, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ ...flexCol, fontSize: 22, fontWeight: 700, letterSpacing: 2, color: IVORY }}>
              HORECA1 VOICES
            </div>
            <QrOrUrl qrDataUrl={props.qrDataUrl} href={props.articleUrl} />
          </div>
        </div>
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
  /** GST-inclusive unit price (products). */
  price?: string;
  /** Strike-through MRP / prior price. */
  originalPrice?: string;
  /** e.g. "8% OFF" */
  discount?: string;
  cta: string;
  imageUrl?: string | null;
  pageUrl: string;
  qrDataUrl?: string | null;
}) {
  const isPortrait = props.format === 'portrait';
  const topPad = isPortrait ? 56 : 40;
  const bottomPad = isPortrait ? 56 : 40;
  const kicker = props.kicker.toUpperCase();
  const imageH = isPortrait ? 780 : 430;
  const initial = (props.title.trim()[0] || 'H').toUpperCase();

  return (
    <div style={{ ...shell, padding: `${topPad}px 48px ${bottomPad}px` }}>
      <div style={{ ...flexRow, width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            ...flexRow,
            background: PRIMARY,
            color: 'white',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 1.1,
            padding: '8px 16px',
            borderRadius: 8,
          }}
        >
          {kicker}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: PRIMARY }}>HORECA1</div>
      </div>

      <div
        style={{
          ...flexCol,
          width: '100%',
          height: imageH,
          marginTop: 24,
          background: CARD,
          borderRadius: 20,
          border: `1px solid ${DIVIDER}`,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
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
              width: '88%',
              height: '88%',
              objectFit: 'contain',
            }}
          />
        ) : (
          <div
            style={{
              ...flexCol,
              width: 168,
              height: 168,
              borderRadius: 20,
              background: TINT,
              color: PRIMARY,
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 72,
              fontWeight: 800,
            }}
          >
            {initial}
          </div>
        )}
      </div>

      <div style={{ ...flexCol, marginTop: 'auto', paddingTop: 22 }}>
        <div
          style={{
            fontSize: isPortrait ? 46 : 36,
            fontWeight: 800,
            lineHeight: 1.15,
            color: INK,
            maxHeight: isPortrait ? 130 : 96,
            overflow: 'hidden',
          }}
        >
          {clampTitle(props.title, isPortrait ? 64 : 52)}
        </div>

        {(props.subtitle || props.statLine) ? (
          <div style={{ ...flexRow, marginTop: 10, alignItems: 'center' }}>
            {props.subtitle ? (
              <div style={{ fontSize: isPortrait ? 24 : 20, fontWeight: 600, color: SECONDARY }}>
                {clampTitle(props.subtitle, 40)}
              </div>
            ) : null}
            {props.subtitle && props.statLine ? (
              <div style={{ fontSize: 20, color: MUTED, marginLeft: 12, marginRight: 12 }}>·</div>
            ) : null}
            {props.statLine ? (
              <div style={{ fontSize: isPortrait ? 22 : 18, color: MUTED }}>{props.statLine}</div>
            ) : null}
          </div>
        ) : null}

        {(props.price || props.discount) ? (
          <div style={{ ...flexRow, marginTop: 16, alignItems: 'flex-end' }}>
            {props.price ? (
              <div
                style={{
                  fontSize: isPortrait ? 52 : 44,
                  fontWeight: 800,
                  color: PRIMARY,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {props.price}
              </div>
            ) : null}
            {props.originalPrice ? (
              <div
                style={{
                  fontSize: isPortrait ? 26 : 22,
                  color: MUTED,
                  textDecoration: 'line-through',
                  marginLeft: 12,
                  marginBottom: 6,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {props.originalPrice}
              </div>
            ) : null}
            {props.discount ? (
              <div
                style={{
                  ...flexRow,
                  background: SUCCESS,
                  color: 'white',
                  fontSize: 18,
                  fontWeight: 800,
                  padding: '6px 12px',
                  borderRadius: 8,
                  marginLeft: 12,
                  marginBottom: 8,
                }}
              >
                {props.discount}
              </div>
            ) : null}
          </div>
        ) : null}

        {props.offer ? (
          <div
            style={{
              ...flexRow,
              marginTop: 14,
              alignSelf: 'flex-start',
              background: TINT,
              color: PRIMARY,
              fontSize: 20,
              fontWeight: 700,
              padding: '8px 14px',
              borderRadius: 10,
            }}
          >
            {props.offer}
          </div>
        ) : null}

        <div style={{ ...flexRow, marginTop: 22, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div
            style={{
              ...flexRow,
              background: PRIMARY,
              color: 'white',
              fontSize: 20,
              fontWeight: 700,
              padding: '12px 20px',
              borderRadius: 12,
            }}
          >
            {props.cta}
          </div>
          <QrOrUrl qrDataUrl={props.qrDataUrl} href={props.pageUrl} />
        </div>
      </div>
    </div>
  );
}
