import { useState } from 'react';
import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img, CheckIcon } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import FreeImage from '../FreeImage.jsx';

// P1: 메인 히어로 + 강점 카드 3개
// editMode / overrides / onOverrideChange: 인라인 편집 지원
export default function P1Hero({
  copy = {},
  image,
  allImages = [],
  variant = 0,
  editMode = false,
  overrides = {},
  onOverrideChange = () => {},
  imageOverrides = {},
  onImageOverrideChange = () => {},
  freeImages = [],
  onAddFreeImage = () => {},
  onUpdateFreeImage = () => {},
  onDeleteFreeImage = () => {},
  onChangeLayer = () => {},
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

  // 사진 추가 패널 (썸네일 그리드 + 파일 업로드)
  const [showPicker, setShowPicker] = useState(false);
  const validImages = (allImages || []).filter(Boolean);

  // 파일 업로드 → base64 DataURL → onAddFreeImage
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) onAddFreeImage(ev.target.result);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = ''; // 같은 파일 재선택 가능하게
    setShowPicker(false);
  };

  // 자유 이미지의 최하단 좌표 → 페이지 minHeight 자동 연장
  const baseHeight = 1200;
  const freeBottom = (freeImages || []).reduce(
    (max, it) => Math.max(max, (it.y || 0) + (it.h || 0)),
    0
  );
  const pageHeight = Math.max(baseHeight, freeBottom + 80); // 하단 80px 여유

  // 레이어 정책:
  //   페이지 배경: z=0
  //   자유 이미지 ▼▼ 맨뒤 가능 영역: z=1 ~ 499
  //   기존 콘텐츠 (제목/메인사진/카드): z=500 (고정)
  //   자유 이미지 ▲▲ 맨앞 가능 영역: z=501 ~ 999
  return (
    <PageFrame height={pageHeight} bg={BRAND.colors.white}>
      {/* 상단 70% — 기존 콘텐츠 (z-index 500 고정) */}
      <div style={{ position: 'relative', zIndex: 500, padding: '60px 50px 30px', textAlign: 'center' }}>
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
            override={imageOverrides['P1.heroImage'] || {}}
            onChange={(partial) => onImageOverrideChange('P1.heroImage', partial)}
            availableImages={allImages.filter(Boolean)}
          />
        </div>
      </div>

      {/* 하단 30% — 강점 카드 3개 (z-index 500 고정)
          사각형을 좀 작게 + 카드 사이 간격 넓게 + 서브글씨 150% 확대(3줄까지 허용) */}
      <div style={{ position: 'relative', zIndex: 500, backgroundColor: BRAND.colors.sub, padding: '40px 30px 50px', marginTop: 20 }}>
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

      {/* ─── 자유 배치 이미지 캠버스 (절대 위치) ─── */}
      {(freeImages || []).map((item) => (
        <FreeImage
          key={item.id}
          item={{ ...item, galleryImages: validImages }}
          editMode={editMode}
          canvasWidth={780}
          onUpdate={(partial) => onUpdateFreeImage(item.id, partial)}
          onDelete={() => onDeleteFreeImage(item.id)}
          onChangeLayer={(action) => onChangeLayer(item.id, action)}
        />
      ))}

      {/* ─── 사진 추가 플로팅 버튼 (편집모드에서만) ─── */}
      {editMode && (
        <>
          <button
            onClick={() => setShowPicker((s) => !s)}
            style={{
              position: 'absolute',
              right: 16,
              top: 16,
              zIndex: 9999,
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: '2px solid #fff',
              padding: '10px 14px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(59,130,246,0.45)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="페이지에 사진을 자유롭게 추가합니다"
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
            <span>사진 추가</span>
            {(freeImages || []).length > 0 && (
              <span
                style={{
                  backgroundColor: '#fff',
                  color: '#3b82f6',
                  borderRadius: 999,
                  padding: '1px 7px',
                  fontSize: 10,
                  fontWeight: 900,
                  marginLeft: 4,
                }}
              >
                {freeImages.length}
              </span>
            )}
          </button>

          {showPicker && (
            <div
              style={{
                position: 'absolute',
                right: 16,
                top: 60,
                zIndex: 9998,
                width: 320,
                maxHeight: 480,
                overflow: 'auto',
                backgroundColor: '#fff',
                border: '1px solid #e2ddd4',
                borderRadius: 12,
                boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
                padding: 14,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2F2A26' }}>📸 사진 추가</div>
                <button
                  onClick={() => setShowPicker(false)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#64748b',
                    fontSize: 16,
                    cursor: 'pointer',
                    padding: 2,
                  }}
                  title="닫기"
                >✕</button>
              </div>

              {/* 파일 업로드 */}
              <label
                style={{
                  display: 'block',
                  border: '2px dashed #93c5fd',
                  backgroundColor: '#eff6ff',
                  borderRadius: 8,
                  padding: '14px 12px',
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#1d4ed8',
                  cursor: 'pointer',
                  marginBottom: 10,
                }}
              >
                ⬆️ 내 컴퓨터에서 업로드 (여러 장 가능)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>

              {/* AI 생성된 23장 갤러리 */}
              {validImages.length > 0 ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                    또는 생성된 사진 {validImages.length}장에서 선택
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 6,
                    }}
                  >
                    {validImages.map((src, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          onAddFreeImage(src);
                          setShowPicker(false);
                        }}
                        style={{
                          border: '1px solid #e2ddd4',
                          borderRadius: 6,
                          padding: 0,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          aspectRatio: '1 / 1',
                          backgroundColor: '#f3f4f6',
                        }}
                        title={`사진 ${idx + 1} 추가`}
                      >
                        <img
                          src={src}
                          alt=""
                          crossOrigin="anonymous"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>
                  (생성된 사진이 없습니다 — 사진을 먼저 생성하면 여기 표시됩니다)
                </div>
              )}

              {/* 안내 */}
              <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                💡 추가 후 페이지 위에서 자유롭게 드래그·리사이즈, 더블클릭=크롭, 툴바=레이어/삭제
              </div>
            </div>
          )}
        </>
      )}
    </PageFrame>
  );
}
