import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img, SectionTitle, Body } from './Shared.jsx';

// P9: 사용법 — STEP 1~3 + 활용 TIP
export default function P9HowTo({ copy = {}, images = [] }) {
  const {
    title = '사용법이 이렇게 간단합니다',
    subTitle = '',
    steps = [],
    tips = [],
  } = copy;

  return (
    <PageFrame height={1900} bg={BRAND.colors.white}>
      <div style={{ padding: '50px 40px 20px', textAlign: 'center' }}>
        <SectionTitle size={38}>{title}</SectionTitle>
        {subTitle && (
          <div style={{ marginTop: 12 }}>
            <Body size={24} align="center">
              {subTitle}
            </Body>
          </div>
        )}
      </div>

      <div style={{ padding: '20px 40px 20px' }}>
        {steps.slice(0, 3).map((s, i, arr) => (
          <div key={i} style={{ marginBottom: i === arr.length - 1 ? 0 : 18 }}>
            <div
              style={{
                backgroundColor: BRAND.colors.sub,
                borderRadius: 18,
                padding: '24px 22px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: '50%',
                    backgroundColor: BRAND.colors.main,
                    color: '#fff',
                    fontWeight: 900,
                    fontSize: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  STEP<br />{s.stepNo || i + 1}
                </div>
                <div style={{ fontSize: 25, fontWeight: 700, color: BRAND.colors.text, lineHeight: 1.4 }}>
                  {s.desc}
                </div>
              </div>
              <Img src={images[i]} aspect="4 / 3" radius={12} />
            </div>

            {i !== arr.length - 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 4v15m0 0l-6-6m6 6l6-6"
                    stroke={BRAND.colors.main}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {tips.length > 0 && (
        <div style={{ padding: '20px 40px 50px' }}>
          <div
            style={{
              border: `2px dashed ${BRAND.colors.main}`,
              borderRadius: 16,
              padding: '22px 20px',
              backgroundColor: BRAND.colors.sub,
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: BRAND.colors.main,
                marginBottom: 12,
                letterSpacing: '0.08em',
              }}
            >
              TIP
            </div>
            {tips.map((t, i) => (
              <div
                key={i}
                style={{
                  fontSize: 22,
                  fontWeight: 500,
                  color: BRAND.colors.text,
                  lineHeight: 1.55,
                  marginBottom: 6,
                }}
              >
                · {t}
              </div>
            ))}
          </div>
        </div>
      )}
    </PageFrame>
  );
}
