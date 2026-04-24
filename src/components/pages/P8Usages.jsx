import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img, SectionTitle, Body } from './Shared.jsx';

// P8: 다양한 활용법 — 4개 모듈
export default function P8Usages({ copy = {}, images = [] }) {
  const { headline = '이렇게도 쓸 수 있어요', usages = [] } = copy;

  return (
    <PageFrame height={1200} bg={BRAND.colors.sub}>
      <div style={{ padding: '50px 40px 20px', textAlign: 'center' }}>
        <SectionTitle size={38}>{headline}</SectionTitle>
      </div>

      <div
        style={{
          padding: '10px 30px 50px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 18,
        }}
      >
        {usages.slice(0, 4).map((u, i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ position: 'relative' }}>
              <Img src={images[i]} aspect="4 / 3" radius={0} />
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: BRAND.colors.main,
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
            </div>
            <div style={{ padding: '18px 18px 22px' }}>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: BRAND.colors.main,
                  marginBottom: 8,
                }}
              >
                {u.title}
              </div>
              <Body size={22}>{u.desc1}</Body>
              {u.desc2 && (
                <div style={{ marginTop: 4 }}>
                  <Body size={22}>{u.desc2}</Body>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </PageFrame>
  );
}
