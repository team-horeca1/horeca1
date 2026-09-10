import type { CSSProperties } from 'react';

const PRIMARY = '#6B1D2E';
const IVORY = '#FAF5EC';

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
            {props.name}
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
  cta: string;
  imageUrl?: string | null;
  pageUrl: string;
  qrDataUrl?: string | null;
}) {
  const isPortrait = props.format === 'portrait';
  const topPad = isPortrait ? 60 : 44;
  const bottomPad = isPortrait ? 70 : 44;
  const isProduct = props.kicker.toUpperCase() === 'PRODUCT';

  // Product specific dedicated layout with prominent white product display box
  if (isProduct) {
    const boxHeight = isPortrait ? 880 : 500;
    return (
      <div style={{ ...shell, padding: `${topPad}px 50px ${bottomPad}px`, background: '#141316' }}>
        {/* Top Header Row */}
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
            {props.kicker}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2, color: IVORY }}>
            HORECA1
          </div>
        </div>

        {/* Hero Product Photo Card (Centered Clean White Container) */}
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
              <div style={{ fontSize: 44, fontWeight: 800, textAlign: 'center' }}>{props.title}</div>
            </div>
          )}
        </div>

        {/* Product Details Section */}
        <div style={{ ...flexCol, marginTop: 'auto', paddingTop: 20 }}>
          <div style={{ fontSize: isPortrait ? 52 : 42, fontWeight: 800, lineHeight: 1.15, color: '#FFFFFF' }}>
            {props.title}
          </div>

          <div style={{ ...flexRow, alignItems: 'center', gap: 16, marginTop: 10 }}>
            {props.subtitle ? (
              <div style={{ fontSize: isPortrait ? 28 : 24, fontWeight: 700, color: '#F3F4F6' }}>
                {props.subtitle}
              </div>
            ) : null}
            {props.statLine ? (
              <div style={{ fontSize: isPortrait ? 24 : 20, color: '#9CA3AF' }}>
                {props.statLine}
              </div>
            ) : null}
          </div>

          {/* Offer Badge & CTA Bar */}
          <div style={{ ...flexRow, marginTop: 24, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ ...flexCol, gap: 10 }}>
              {props.offer ? (
                <div
                  style={{
                    background: '#FFFFFF',
                    color: PRIMARY,
                    fontSize: 22,
                    fontWeight: 800,
                    padding: '8px 18px',
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

  // General Store / Brand Share Card
  return (
    <div style={{ ...shell, padding: `${topPad}px 56px ${bottomPad}px`, background: '#1C1C1C' }}>
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
            opacity: 0.45,
          }}
        />
      ) : null}
      <div
        style={{
          ...flexCol,
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(28,28,28,0.25) 0%, rgba(107,29,46,0.92) 78%)',
        }}
      />
      <div style={{ ...flexCol, position: 'relative', height: '100%' }}>
        <div
          style={{
            ...flexRow,
            alignSelf: 'flex-start',
            background: PRIMARY,
            color: 'white',
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: 1.2,
            padding: '8px 16px',
            borderRadius: 8,
          }}
        >
          {props.kicker}
        </div>
        <div style={{ ...flexCol, marginTop: 'auto' }}>
          <div style={{ ...flexCol, fontSize: isPortrait ? 56 : 44, fontWeight: 800, lineHeight: 1.1 }}>
            {props.title}
          </div>
          {props.subtitle ? (
            <div style={{ ...flexCol, marginTop: 12, fontSize: 26, opacity: 0.9 }}>{props.subtitle}</div>
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
          <div style={{ ...flexCol, marginTop: 28, fontSize: 26 }}>{props.cta}</div>
          <div style={{ ...flexRow, marginTop: 36, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ ...flexCol, fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>HORECA1</div>
            <QrOrUrl qrDataUrl={props.qrDataUrl} href={props.pageUrl} />
          </div>
        </div>
      </div>
    </div>
  );
}
