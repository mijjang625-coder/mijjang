import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img, CheckIcon } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';

// P1: 메인 히어로 + 강점 카드 3개
// editMode / overrides / onOverrideChange: 인라인 편집 지원
export default function P1Hero({
  copy = {},
  image,
  variant = 0,
  editMode = false,
  overrides = {},
  onOverrideChange = () => {},
}) {
  const {
    mainHeadline = '제품의 핵심을 한 줄로',
    subHeadline = '',
    strengthCards = [],
    trustLine = '',
  } = copy;

  // variant에 따라 체크 아이콘 모양 변경 (다시 생성할 때마다 다른 모양)
  const checkVariant = variant;

  // EditableText용 공통 props 헬퍼
  const editPropsFor = (id) => ({
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  return (
    <PageFrame height={1200} bg={BRAND.colors.white}>
      {/* 상단 70% — 메인 타이틀 120% 확대 */}
      <div style={{ padding: '60px 50px 30px', textAlign: 'center' }}>
        <EditableText
          {...editPropsFor('P1.mainHeadline')}
          as="h2"
          defaultStyle={{
            fontSize: 48,
            fontWeight: 900,
            color: BRAND.colors.text,
            textAlign: 'center',
            letterSpacing: '-0.04em',
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {mainHeadline}
        </EditableText>
        {(subHeadline || editMode) && (
          <div style={{ marginTop: 20 }}>
            <EditableText
              {...editPropsFor('P1.subHeadline')}
              as="p"
              defaultStyle={{
                fontSize: 24,
                fontWeight: 500,
                color: BRAND.colors.text,
                textAlign: 'center',
                margin: 0,
                lineHeight: 1.5,
              }}
              placeholder={editMode ? '(서브 헤드라인)' : ''}
            >
              {subHeadline}
            </EditableText>
          </div>
        )}
        <div style={{ marginTop: 36 }}>
          <EditableImage
            id="P1.heroImage"
            src={image}
            aspect="1 / 1"
            radius={20}
            editMode={editMode}
            override={overrides['P1.heroImage'] || {}}
            onChange={(partial) => onOverrideChange('P1.heroImage', partial)}
          />
        </div>
      </div>

      {/* 하단 30% — 강점 카드 3개
          사각형을 좀 작게 + 카드 사이 간격 넓게 + 서브글씨 150% 확대(3줄까지 허용) */}
      <div style={{ backgroundColor: BRAND.colors.sub, padding: '40px 30px 50px', marginTop: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 }}>
          {strengthCards.slice(0, 3).map((c, i) => (
            <div
              key={i}
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: '18px 10px 20px',
                // 카드 축소 — 기존 230 → 220 (체크+타이틀+서브3줄 여유 공간)
                minHeight: 220,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                textAlign: 'center',
                gap: 8,
                boxShadow: '0 2px 6px rgba(47, 42, 38, 0.04)',
                overflow: 'hidden',
                boxSizing: 'border-box',
                minWidth: 0, // grid 자식 overflow 제어
              }}
            >
              {/* 체크 아이콘 — 다시 생성할 때마다 모양이 바뀜 (variant 기반) */}
              <CheckIcon size={28} variant={checkVariant + i} />

              {/* 타이틀 — 1줄 고정 */}
              <EditableText
                {...editPropsFor(`P1.strengthCards.${i}.title`)}
                as="div"
                defaultStyle={{
                  width: '100%',
                  fontSize: 20,
                  fontWeight: 900,
                  color: BRAND.colors.main,
                  lineHeight: 1.2,
                  letterSpacing: '-0.04em',
                  wordBreak: 'keep-all',
                  whiteSpace: editMode ? 'normal' : 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minHeight: 26,
                  padding: '0 4px',
                  textAlign: 'center',
                }}
              >
                {c.title}
              </EditableText>

              {/* 설명 — 서브글씨 150% 확대 (15 → 22.5pt), 3줄까지 허용 */}
              <EditableText
                {...editPropsFor(`P1.strengthCards.${i}.desc`)}
                as="div"
                defaultStyle={{
                  width: '100%',
                  fontSize: 22,                 // 요청: 기존 15pt → 150% (≈22pt)
                  fontWeight: 500,
                  color: BRAND.colors.text,
                  lineHeight: 1.35,
                  letterSpacing: '-0.03em',
                  wordBreak: 'keep-all',
                  whiteSpace: 'pre-line',
                  display: editMode ? 'block' : '-webkit-box',
                  WebkitLineClamp: 3,           // 3줄 허용
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  // 22 × 1.35 × 3 ≈ 89px
                  minHeight: 90,
                  padding: '0 2px',
                  textAlign: 'center',
                }}
              >
                {c.desc}
              </EditableText>
            </div>
          ))}
        </div>
        {(trustLine || editMode) && (
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <EditableText
              {...editPropsFor('P1.trustLine')}
              as="span"
              defaultStyle={{
                display: 'inline-block',
                fontSize: 22,
                fontWeight: 700,
                color: BRAND.colors.text,
                letterSpacing: '-0.02em',
                textAlign: 'center',
              }}
              placeholder={editMode ? '(신뢰 한 줄)' : ''}
            >
              {trustLine}
            </EditableText>
          </div>
        )}
      </div>
    </PageFrame>
  );
}
