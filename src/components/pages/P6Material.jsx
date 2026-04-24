import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img, SectionTitle, SubTitle, Body, CheckIcon, Divider } from './Shared.jsx';

// P6: 소재 & 사이즈 실증
export default function P6Material({ copy = {}, materialImage, sizeImage }) {
  const {
    material = { title: '', desc: '', safetyPoints: [], certifications: [] },
    size = { title: '', provingMessage: '', specs: [] },
  } = copy;

  return (
    <PageFrame height={1150} bg={BRAND.colors.white}>
      {/* 상단 — 소재 */}
      <div style={{ padding: '50px 40px 30px' }}>
        <SectionTitle size={38}>{material.title || '믿을 수 있는 소재'}</SectionTitle>
        <div style={{ marginTop: 24 }}>
          <Img src={materialImage} aspect="16 / 10" radius={14} />
        </div>
        {/* 소재 상세설명 — 정확히 2줄 고정, 폰트 80% 축소 (24 → 19pt) */}
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              fontSize: 19,
              fontWeight: 500,
              color: BRAND.colors.text,
              lineHeight: 1.55,
              letterSpacing: '-0.015em',
              wordBreak: 'keep-all',
              whiteSpace: 'pre-line',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxHeight: 60,
            }}
          >
            {material.desc}
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(material.safetyPoints || []).slice(0, 3).map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CheckIcon size={22} />
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: BRAND.colors.text,
                  letterSpacing: '-0.02em',
                  wordBreak: 'keep-all',
                }}
              >
                {p}
              </div>
            </div>
          ))}
        </div>

        {material.certifications?.length > 0 && (
          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {material.certifications.map((c, i) => (
              <span
                key={i}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  backgroundColor: BRAND.colors.sub,
                  color: BRAND.colors.main,
                  fontSize: 20,
                  fontWeight: 800,
                  border: `1.5px solid ${BRAND.colors.main}`,
                }}
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '0 40px' }}>
        <Divider color={BRAND.colors.main} />
      </div>

      {/* 하단 — 사이즈 */}
      <div style={{ padding: '30px 40px 50px' }}>
        <SectionTitle size={36}>{size.title || '실제 크기 확인'}</SectionTitle>
        <div style={{ marginTop: 22 }}>
          <Img src={sizeImage} aspect="16 / 10" radius={14} />
        </div>
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '10px 22px',
              backgroundColor: BRAND.colors.main,
              color: '#fff',
              fontSize: 24,
              fontWeight: 800,
              borderRadius: 999,
            }}
          >
            {size.provingMessage}
          </span>
        </div>

        <div
          style={{
            marginTop: 22,
            backgroundColor: BRAND.colors.sub,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {(size.specs || []).map((s, i, arr) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.6fr',
                borderBottom:
                  i === arr.length - 1 ? 'none' : `1px solid ${BRAND.colors.neutral}`,
              }}
            >
              <div
                style={{
                  padding: '16px 18px',
                  fontSize: 22,
                  fontWeight: 800,
                  color: BRAND.colors.main,
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  padding: '16px 18px',
                  fontSize: 22,
                  fontWeight: 500,
                  color: BRAND.colors.text,
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
