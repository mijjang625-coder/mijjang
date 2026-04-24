import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img, SectionTitle, Body, Divider, CheckIcon } from './Shared.jsx';

// 배송/A.S. 카드 패널 — 중복 제거용 헬퍼
function InfoPanel({ sectionTitle, items, bg }) {
  return (
    <div
      style={{
        backgroundColor: bg,
        border: `2px solid ${BRAND.colors.main}`,
        borderRadius: 16,
        padding: '22px 20px',
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 900,
          color: BRAND.colors.main,
          marginBottom: 14,
          letterSpacing: '-0.03em',
        }}
      >
        {sectionTitle}
      </div>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 12,
            paddingBottom: i === items.length - 1 ? 0 : 10,
            borderBottom: i === items.length - 1 ? 'none' : `1px dashed ${BRAND.colors.neutral}`,
          }}
        >
          {it.title && (
            <div
              style={{
                fontSize: 19,
                fontWeight: 800,
                color: BRAND.colors.text,
                letterSpacing: '-0.02em',
                marginBottom: 2,
              }}
            >
              {it.title}
            </div>
          )}
          <div
            style={{
              fontSize: 17,
              fontWeight: 500,
              color: BRAND.colors.neutralText,
              lineHeight: 1.45,
              letterSpacing: '-0.02em',
              wordBreak: 'keep-all',
            }}
          >
            {it.body}
          </div>
        </div>
      ))}
    </div>
  );
}

// P10: 구성품 안내 + 배송/A.S. + FAQ 5개
// 분량 확장 — 구성품 강조 + 배송/A.S. 안내 + FAQ
export default function P10Faq({ copy = {}, componentImage, variant = 0 }) {
  const {
    components = { title: '구성품 안내', bullets: [] },
    faq = [],
    // shippingInfo / csInfo: 시스템 프롬프트에 정의됨 — [{title, body}, ...]
    // 하위호환: careInfo라는 이름이나 단순 문자열 배열로도 들어올 수 있음
    shippingInfo = [],
    csInfo = [],
    careInfo = [],
  } = copy;

  // 기본값 — AI가 주지 않았을 때 쓰이는 안전한 범용 문구
  const defaultShipping = [
    { title: '🚚 당일 출고', body: '평일 오후 2시 이전 주문 시' },
    { title: '📦 안전 포장', body: '파손 방지 에어캡/박스 포장' },
    { title: '💳 간편 결제', body: '카드·간편결제 모두 지원' },
  ];
  const defaultCs = [
    { title: '🔄 교환·반품', body: '수령일로부터 7일 이내' },
    { title: '🛠 A/S 지원', body: '제품 불량 시 즉시 교환' },
    { title: '📞 고객센터', body: '평일 10:00-17:00 상담 가능' },
  ];

  // 문자열이면 {title: '', body: '문자열'}로 정규화
  const normalize = (arr) =>
    (arr || []).map((it) =>
      typeof it === 'string' ? { title: '', body: it } : it,
    );

  const shipRaw = normalize(shippingInfo.length > 0 ? shippingInfo : careInfo);
  const csRaw = normalize(csInfo);

  const ship = shipRaw.length > 0 ? shipRaw : defaultShipping;
  const cs = csRaw.length > 0 ? csRaw : defaultCs;

  return (
    <PageFrame height={2100} bg={BRAND.colors.white}>
      {/* ─────────── 1. 구성품 안내 (강조) ─────────── */}
      <div style={{ padding: '50px 40px 30px' }}>
        <div style={{ textAlign: 'center' }}>
          <SectionTitle size={40}>{components.title || '구성품 안내'}</SectionTitle>
          <div style={{ marginTop: 12, color: BRAND.colors.neutralText, fontSize: 20, fontWeight: 600 }}>
            박스 안에 이렇게 들어있어요
          </div>
        </div>

        <div style={{ marginTop: 26 }}>
          <Img src={componentImage} aspect="16 / 10" radius={16} />
        </div>

        {/* 구성품 체크리스트 — 아이콘 variant로 다양성 */}
        <div
          style={{
            marginTop: 24,
            backgroundColor: BRAND.colors.sub,
            borderRadius: 16,
            padding: '22px 24px',
          }}
        >
          {(components.bullets || []).slice(0, 4).map((b, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '10px 4px',
                borderBottom:
                  i === Math.min((components.bullets || []).length, 4) - 1
                    ? 'none'
                    : `1px solid ${BRAND.colors.neutral}`,
              }}
            >
              <CheckIcon size={26} variant={variant + i} />
              <span
                style={{
                  fontSize: 23,
                  fontWeight: 700,
                  color: BRAND.colors.text,
                  letterSpacing: '-0.02em',
                  wordBreak: 'keep-all',
                }}
              >
                {b}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 40px' }}>
        <Divider color={BRAND.colors.main} />
      </div>

      {/* ─────────── 2. 배송 & A/S 안내 (신규 섹션) ─────────── */}
      <div style={{ padding: '30px 40px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <SectionTitle size={36}>배송 &amp; A/S 안내</SectionTitle>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* 배송 안내 */}
          <InfoPanel
            sectionTitle="🚚 배송 안내"
            items={ship.slice(0, 3)}
            bg="#fff"
          />
          {/* A/S 안내 */}
          <InfoPanel
            sectionTitle="🛠 A/S · 교환 안내"
            items={cs.slice(0, 3)}
            bg={BRAND.colors.sub}
          />
        </div>
      </div>

      <div style={{ padding: '10px 40px' }}>
        <Divider color={BRAND.colors.main} dashed />
      </div>

      {/* ─────────── 3. FAQ 5개 ─────────── */}
      <div style={{ padding: '30px 30px 60px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <SectionTitle size={36}>자주 묻는 질문</SectionTitle>
          <div style={{ marginTop: 10, color: BRAND.colors.neutralText, fontSize: 20, fontWeight: 600 }}>
            구매 전 궁금증을 모았어요
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {faq.slice(0, 5).map((f, i) => (
            <div
              key={i}
              style={{
                backgroundColor: BRAND.colors.sub,
                borderRadius: 16,
                padding: '22px 22px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: BRAND.colors.main,
                    lineHeight: 1,
                  }}
                >
                  Q.
                </span>
                <span
                  style={{
                    fontSize: 25,
                    fontWeight: 800,
                    color: BRAND.colors.text,
                    lineHeight: 1.4,
                  }}
                >
                  {f.q}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 900,
                    color: BRAND.colors.text,
                    lineHeight: 1,
                  }}
                >
                  A.
                </span>
                <Body size={23}>{f.a}</Body>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────── 4. 마감 CTA 영역 ─────────── */}
      <div
        style={{
          margin: '0 40px 50px',
          backgroundColor: BRAND.colors.main,
          borderRadius: 18,
          padding: '30px 28px',
          textAlign: 'center',
          color: '#fff',
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: '-0.03em',
            marginBottom: 8,
          }}
        >
          지금 장바구니에 담아보세요
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            opacity: 0.95,
            letterSpacing: '-0.02em',
            lineHeight: 1.5,
            wordBreak: 'keep-all',
          }}
        >
          문의 사항이 있으시면 구매 페이지의 문의하기로 편하게 남겨주세요.
        </div>
      </div>
    </PageFrame>
  );
}
