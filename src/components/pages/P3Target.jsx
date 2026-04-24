import { BRAND } from '../../lib/theme.js';
import { PageFrame, SectionTitle, CheckIcon, PillBadge } from './Shared.jsx';
import EditableText from '../EditableText.jsx';

// P3: 이런 분들께 추천드려요 (체크리스트형)
// 레이아웃: 타이틀(상) → 이미지(중, 확대) → 체크리스트(하) — 모두 flex로 여백 없이 채움
export default function P3Target({
  copy = {},
  image,
  variant = 0,
  editMode = false,
  overrides = {},
  onOverrideChange = () => {},
}) {
  const editPropsFor = (id) => ({
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });
  const {
    badge = '',
    mainTitle = '이런 분들께 추천드려요!',
    badgePoint = '',
    checklist = [],
  } = copy;

  // 고정 높이 1200, flex로 3구역 배분하여 하단 빈 공간 제거
  return (
    <PageFrame height={1200} bg={BRAND.colors.sub}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 1200, width: '100%' }}>
        {/* 1) 상단 타이틀 박스 — 고정 높이 */}
        <div style={{ padding: '40px 40px 16px', textAlign: 'center', flexShrink: 0 }}>
          <div
            style={{
              border: `2px dashed ${BRAND.colors.main}`,
              borderRadius: 16,
              padding: '20px 20px',
              backgroundColor: 'rgba(255,255,255,0.7)',
            }}
          >
            {badge && (
              <div style={{ marginBottom: 12 }}>
                <PillBadge>{badge}</PillBadge>
              </div>
            )}
            <EditableText
              {...editPropsFor('P3.mainTitle')}
              as="h2"
              defaultStyle={{
                fontSize: 42,
                fontWeight: 800,
                color: BRAND.colors.text,
                margin: 0,
                textAlign: 'center',
                letterSpacing: '-0.03em',
                lineHeight: 1.3,
              }}
            >
              {mainTitle}
            </EditableText>
          </div>
        </div>

        {/* 2) 중앙 제품 이미지 — flex 1로 확장, 남은 공간 최대 활용 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 30px',
            minHeight: 540,
          }}
        >
          <div style={{ position: 'relative', width: 560, height: 560 }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                overflow: 'hidden',
                backgroundColor: '#fff',
                border: `5px solid ${BRAND.colors.main}`,
                boxShadow: '0 8px 24px rgba(47, 42, 38, 0.08)',
              }}
            >
              <img
                src={image}
                alt=""
                crossOrigin="anonymous"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
            {/* 포인트 배지 — 사진 바깥 우측 하단에 배치 (사진을 가리지 않도록) */}
            {badgePoint && (
              <div
                style={{
                  position: 'absolute',
                  // 원 바깥으로 이동 (원이 560px, 중심 좌표 기준으로 오른쪽 아래 바깥)
                  right: -40,
                  bottom: -20,
                  backgroundColor: BRAND.colors.accent,
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 22,
                  padding: '14px 20px',
                  borderRadius: 999,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                  letterSpacing: '-0.02em',
                  maxWidth: 210,
                  lineHeight: 1.2,
                  textAlign: 'center',
                  wordBreak: 'keep-all',
                  // 사진 위에 살짝 겹치는 게 아니라, 원 밖에서 떠있는 느낌
                  zIndex: 2,
                }}
              >
                <EditableText
                  {...editPropsFor('P3.badgePoint')}
                  as="span"
                  defaultStyle={{ color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: '-0.02em' }}
                >
                  {badgePoint}
                </EditableText>
              </div>
            )}
          </div>
        </div>

        {/* 3) 체크리스트 — 하단 고정, padding 없음 */}
        <div style={{ padding: '0 40px 40px', flexShrink: 0 }}>
          <div
            style={{
              border: `2px dashed ${BRAND.colors.main}`,
              borderRadius: 16,
              padding: '20px 24px',
              backgroundColor: '#fff',
            }}
          >
            {checklist.slice(0, 5).map((item, i, arr) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '11px 6px',
                  borderBottom:
                    i === arr.length - 1 ? 'none' : `1px solid ${BRAND.colors.neutral}`,
                }}
              >
                <CheckIcon size={24} variant={variant + i} />
                <EditableText
                  {...editPropsFor(`P3.checklist.${i}`)}
                  as="div"
                  defaultStyle={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: BRAND.colors.text,
                    lineHeight: 1.4,
                    letterSpacing: '-0.02em',
                    wordBreak: 'keep-all',
                    flex: 1,
                  }}
                >
                  {item}
                </EditableText>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
