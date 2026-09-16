import type { CSSProperties } from 'react';

const PRIMARY = '#6B1D2E';
const IVORY = '#FAF5EC';
const INK = '#1C1C1C';

function QrOrUrl(props: { qrDataUrl?: string | null; href: string }) {
  if (props.qrDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={props.qrDataUrl} width={120} height={120} alt="" />
    );
  }
  return (
    <div style={{ ...flexCol, fontSize: 18, maxWidth: 420, opacity: 0.9 }}>
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
  background: PRIMARY,
  color: 'white',
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
    <div style={{ ...shell, padding: `${topPad}px 56px ${bottomPad}px` }}>
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
  const topPad = isPortrait ? 60 : 44;
  const bottomPad = isPortrait ? 70 : 44;
  const kicker = props.kicker.toUpperCase();
  const isProduct = kicker === 'PRODUCT';
  const isDeal = kicker === 'DEAL';
  const isCollection = kicker === 'COLLECTION';

  // Product — premium social-commerce card
  if (isProduct) {
    const boxHeight = isPortrait ? 780 : 440;
    return (
      <div style={{ ...shell, padding: `${topPad}px 50px ${bottomPad}px`, background: '#141316' }}>
        <div style={{ ...flexRow, alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div
            style={{
              background: PRIMARY,
              color: 'white',
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: 1.2,
              padding: '8px 18px',
              borderRadius: 8,
            }}
          >
            H1 HoReCa Hub
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2, color: IVORY }}>
            HORECA1
          </div>
        </div>

        <div
          style={{
            ...flexCol,
            width: '100%',
            height: boxHeight,
            marginTop: 24,
            background: '#FFFFFF',
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          }}
        >
          {props.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.imageUrl}
              alt=""
              width={boxHeight}
              height={boxHeight}
              style={{
                maxWidth: '92%',
                maxHeight: '92%',
                objectFit: 'contain',
              }}
            />
          ) : (
            <div style={{ ...flexCol, alignItems: 'center', justifyContent: 'center', color: PRIMARY, padding: 30 }}>
              <div style={{ fontSize: 40, fontWeight: 800, textAlign: 'center' }}>
                {clampTitle(props.title, 48)}
              </div>
            </div>
          )}
        </div>

        <div style={{ ...flexCol, marginTop: 'auto', paddingTop: 20 }}>
          <div
            style={{
              fontSize: isPortrait ? 48 : 38,
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#FFFFFF',
              maxHeight: isPortrait ? 140 : 100,
              overflow: 'hidden',
            }}
          >
            {clampTitle(props.title, isPortrait ? 64 : 52)}
          </div>

          <div style={{ ...flexRow, alignItems: 'center', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            {props.subtitle ? (
              <div style={{ fontSize: isPortrait ? 26 : 22, fontWeight: 700, color: '#F3F4F6' }}>
                {clampTitle(props.subtitle, 36)}
              </div>
            ) : null}
            {props.statLine ? (
              <div style={{ fontSize: isPortrait ? 22 : 18, color: '#9CA3AF' }}>{props.statLine}</div>
            ) : null}
          </div>

          <div style={{ ...flexRow, marginTop: 18, alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
            {props.price ? (
              <div
                style={{
                  fontSize: isPortrait ? 52 : 44,
                  fontWeight: 800,
                  color: IVORY,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {props.price}
              </div>
            ) : null}
            {props.originalPrice ? (
              <div
                style={{
                  fontSize: isPortrait ? 28 : 24,
                  color: '#9CA3AF',
                  textDecoration: 'line-through',
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
                  background: '#16A34A',
                  color: 'white',
                  fontSize: 20,
                  fontWeight: 800,
                  padding: '6px 14px',
                  borderRadius: 10,
                  marginBottom: 8,
                }}
              >
                {props.discount}
              </div>
            ) : null}
          </div>

          <div style={{ ...flexRow, marginTop: 20, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ ...flexCol, gap: 10 }}>
              {props.offer ? (
                <div
                  style={{
                    background: '#FFFFFF',
                    color: PRIMARY,
                    fontSize: 20,
                    fontWeight: 800,
                    padding: '8px 16px',
                    borderRadius: 10,
                    alignSelf: 'flex-start',
                  }}
                >
                  {props.offer}
                </div>
              ) : null}
              <div style={{ fontSize: 22, color: '#9CA3AF' }}>{props.cta}</div>
            </div>
            <QrOrUrl qrDataUrl={props.qrDataUrl} href={props.pageUrl} />
          </div>
        </div>
      </div>
    );
  }

  // Deal / Collection / Store / Brand
  const bg = isDeal || isCollection ? PRIMARY : '#1C1C1C';
  return (
    <div style={{ ...shell, padding: `${topPad}px 56px ${bottomPad}px`, background: bg }}>
      {props.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.imageUrl}
          alt=""
          width={1080}
          height={isPortrait ? 1920 : 1080}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.4,
          }}
        />
      ) : null}
      <div
        style={{
          ...flexCol,
          position: 'absolute',
          inset: 0,
          background: isDeal
            ? 'linear-gradient(180deg, rgba(107,29,46,0.35) 0%, rgba(74,20,31,0.94) 75%)'
            : 'linear-gradient(180deg, rgba(28,28,28,0.25) 0%, rgba(107,29,46,0.92) 78%)',
        }}
      />
      <div style={{ ...flexCol, position: 'relative', height: '100%' }}>
        <div style={{ ...flexRow, alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div
            style={{
              ...flexRow,
              background: isDeal ? 'white' : PRIMARY,
              color: isDeal ? PRIMARY : 'white',
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: 1.2,
              padding: '8px 16px',
              borderRadius: 8,
            }}
          >
            {props.kicker}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: IVORY }}>HORECA1</div>
        </div>
        <div style={{ ...flexCol, marginTop: 'auto' }}>
          <div
            style={{
              ...flexCol,
              fontSize: isDeal ? (isPortrait ? 72 : 56) : isPortrait ? 56 : 44,
              fontWeight: 800,
              lineHeight: 1.1,
              color: 'white',
            }}
          >
            {clampTitle(props.title, isDeal ? 40 : 56)}
          </div>
          {props.subtitle ? (
            <div style={{ ...flexCol, marginTop: 14, fontSize: 26, opacity: 0.95, color: IVORY }}>
              {clampTitle(props.subtitle, 48)}
            </div>
          ) : null}
          {props.statLine ? (
            <div style={{ ...flexCol, marginTop: 16, fontSize: 24, fontWeight: 600 }}>{props.statLine}</div>
          ) : null}
          {props.offer ? (
            <div
              style={{
                ...flexRow,
                marginTop: 20,
                alignSelf: 'flex-start',
                background: 'white',
                color: PRIMARY,
                fontSize: 24,
                fontWeight: 800,
                padding: '10px 16px',
                borderRadius: 10,
              }}
            >
              {props.offer}
            </div>
          ) : null}
          {props.price ? (
            <div
              style={{
                ...flexRow,
                marginTop: 16,
                fontSize: 40,
                fontWeight: 800,
                color: IVORY,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {props.price}
            </div>
          ) : null}
          <div style={{ ...flexCol, marginTop: 28, fontSize: 26 }}>{props.cta}</div>
          <div style={{ ...flexRow, marginTop: 36, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ ...flexCol, fontSize: 22, fontWeight: 700, letterSpacing: 2, color: IVORY }}>
              HORECA1
            </div>
            <QrOrUrl qrDataUrl={props.qrDataUrl} href={props.pageUrl} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Keep unused INK referenced for type/lint stability if theme expands
void INK;
