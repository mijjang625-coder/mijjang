import { BRAND } from '../../lib/theme.js';
import { PageFrame, SectionTitle } from './Shared.jsx';

// P4: 리뷰 4개 — 왼쪽 텍스트 / 오른쪽 사진 정확히 절반
export default function P4Reviews({ copy = {}, images = [] }) {
  const { reviews = [] } = copy;

  // 별 150% 확대 + 주황색 (BRAND.colors.accent)
  const Star = () => (
    <span
      style={{
        color: BRAND.colors.accent, // 주황색 포인트
        fontSize: 33,                // 기존 22 × 150%
        letterSpacing: 3,
        lineHeight: 1,
        display: 'inline-block',
      }}
    >
      ★★★★★
    </span>
  );

  return (
    <PageFrame height={1700} bg={BRAND.colors.sub}>
      <div style={{ padding: '50px 40px 20px', textAlign: 'center' }}>
        <SectionTitle size={38}>고객님들의 생생한 후기</SectionTitle>
      </div>

      <div style={{ padding: '0 30px 50px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {reviews.slice(0, 4).map((r, i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#fff',
              borderRadius: 18,
              overflow: 'hidden',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              // 60자 리뷰가 가독성 있게 들어갈 수 있도록 높이 확대
              minHeight: 310,
            }}
          >
            {/* 왼쪽 텍스트 */}
            <div style={{ padding: '26px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <Star />
                <div
                  style={{
                    marginTop: 14,
                    // 리뷰 본문 글씨 확대 — 23 → 26 (60자 가독성 확보)
                    fontSize: 26,
                    fontWeight: 500,
                    color: BRAND.colors.text,
                    lineHeight: 1.55,
                    letterSpacing: '-0.02em',
                    wordBreak: 'keep-all',
                  }}
                >
                  {r.body}
                </div>
              </div>
              <div
                style={{
                  fontSize: 20,
                  color: BRAND.colors.neutralText,
                  fontWeight: 600,
                }}
              >
                {r.nickname} · {r.date}
              </div>
            </div>

            {/* 오른쪽 사진 — 정확히 절반 */}
            <div style={{ backgroundColor: BRAND.colors.sub }}>
              <img
                src={images[i]}
                alt=""
                crossOrigin="anonymous"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 310 }}
              />
            </div>
          </div>
        ))}
      </div>
    </PageFrame>
  );
}
