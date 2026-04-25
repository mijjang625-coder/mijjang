import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// 일반 제품용 자동 생성 실루엣 이미지 (무채색 + 블러 효과, 텍스트 없음)
// SVG data URL — 외부 네트워크 없이 항상 렌더링됨
const GENERIC_PRODUCT_SILHOUETTE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d9d9d9"/>
      <stop offset="1" stop-color="#a8a8a8"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <rect width="400" height="400" fill="url(#bg)"/>
  <g filter="url(#blur)" fill="#5a5a5a" opacity="0.65">
    <ellipse cx="200" cy="330" rx="150" ry="26"/>
    <path d="M 125 310 L 140 155 Q 140 120 175 115 L 225 115 Q 260 120 260 155 L 275 310 Z"/>
    <circle cx="200" cy="105" r="32"/>
  </g>
</svg>
  `.trim());

// P5: 2지선다 비교표 — 글 버전 + 사진 버전
// version: 'text' | 'photo'
export default function P5Compare({
  copy = {},
  ourImage,
  generalImage,
  allImages = [],
  version = 'text',
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
  onChangeLayerKind = null,
  onReorderLayers = () => {},
  layerNames = {},
  onSetLayerName = () => {},
  // 🟦 도형 레이어 props (ShapeLayer)
  shapes = [],
  onAddShape = () => {},
  onUpdateShape = () => {},
  onDeleteShape = () => {},
  activeLayerId = null,
  onSetActiveLayer = () => {},
}) {
  const editPropsFor = (id) => ({
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  const mainImgId = 'P5.ourImage';
  const mainLayers = version === 'photo'
    ? [{ id: mainImgId, defaultName: '🖼 우리 제품 사진', defaultZ: 1 }]
    : [];
  // 🟦 도형의 가장 아래 끝 → 페이지 baseHeight 자동 연장
  const shapesBottom = (shapes || []).reduce(
    (max, s) => Math.max(max, (s.y || 0) + (s.h || 0)),
    0
  );
  const layer = useFreeImageLayer({
    pageKey: 'P5', mainLayers, image: ourImage, allImages, baseHeight: Math.max(900, shapesBottom + 80),
    editMode, freeImages, imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage,
    shapes,
    onDeleteShape,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onSetLayerName,
    activeLayerId, onSetActiveLayer,
  });
  const mainActive = layer.isLayerActive('main', mainImgId);
  const {
    headline = '왜 이 제품을 선택해야 할까요?',
    sub = '',
    rows = [],
    ourProductName = '우리 제품',
    generalProductName = '일반 제품',
    ourSubLabel = '',       // 예: "PREMIUM", "OUR BRAND"
    generalSubLabel = '',   // 예: "GENERAL", "기존 방식"
  } = copy;

  // 일반 제품 이미지: 사용자가 따로 제공하지 않았으면 자동 생성 실루엣 사용
  const resolvedGeneralImage = generalImage || GENERIC_PRODUCT_SILHOUETTE;

  // ── 모든 텍스트 셀의 공통 스타일 (비교항목 라벨 + 우리/일반 콘텐츠) ──
  // 요청사항: 좌측 '비교 항목'부터 '병 입구'까지 글씨 크기 동일 + 가운데 정렬
  const UNIFORM_FONT_SIZE = 20;
  const UNIFORM_PADDING = '18px 10px';

  const colHeader = (label, subLabel, isOurs) => (
    <div
      style={{
        padding: '14px 10px',
        backgroundColor: isOurs ? BRAND.colors.main : '#c8c8c8',
        color: isOurs ? '#fff' : '#6b6b6b',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: 72,
        opacity: isOurs ? 1 : 0.85,
      }}
    >
      {subLabel && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.15em',
            opacity: isOurs ? 0.9 : 0.7,
            marginBottom: 3,
          }}
        >
          {subLabel}
        </div>
      )}
      <div
        style={{
          fontWeight: isOurs ? 900 : 700,
          fontSize: isOurs ? 22 : 19,
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
          wordBreak: 'keep-all',
        }}
      >
        {label}
      </div>
    </div>
  );

  // 좌측 '비교 항목' 라벨 셀 (통일된 스타일)
  const renderLabelCell = (text, isFirstRow = false) => (
    <div
      style={{
        padding: UNIFORM_PADDING,
        backgroundColor: BRAND.colors.sub,
        color: BRAND.colors.text,
        fontWeight: 700,
        fontSize: UNIFORM_FONT_SIZE,
        borderTop: isFirstRow ? 'none' : `1px solid ${BRAND.colors.neutral}`,
        wordBreak: 'keep-all',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {text}
    </div>
  );

  // 우리 제품 / 일반 제품 콘텐츠 셀 — 둘 다 같은 폰트 크기, 가운데 정렬
  // 일반 제품은 무채색 + opacity로만 약화 (크기는 통일)
  const renderCell = (text, isOurs) => (
    <div
      style={{
        padding: UNIFORM_PADDING,
        backgroundColor: isOurs ? 'rgba(200,182,166,0.12)' : '#f5f5f5',
        color: isOurs ? BRAND.colors.text : '#9a9a9a',
        fontSize: UNIFORM_FONT_SIZE,          // 동일 크기
        fontWeight: isOurs ? 700 : 400,       // 굵기로만 차등
        borderBottom: `1px solid ${BRAND.colors.neutral}`,
        textAlign: 'center',                  // 가운데 정렬
        lineHeight: 1.4,
        wordBreak: 'keep-all',
        opacity: isOurs ? 1 : 0.8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {text}
    </div>
  );

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.white} onClearActive={layer.clearActiveLayer}>
      <div style={{ position: 'relative', pointerEvents: 'auto' }}>
      <div style={{ padding: '50px 40px 24px', textAlign: 'center', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <EditableText
          {...editPropsFor('P5.headline')}
          as="h2"
          defaultStyle={{
            fontSize: 38,
            fontWeight: 800,
            color: BRAND.colors.text,
            margin: 0,
            textAlign: 'center',
            letterSpacing: '-0.03em',
            lineHeight: 1.3,
          }}
        >
          {headline}
        </EditableText>
        {(sub || editMode) && (
          <div style={{ marginTop: 14 }}>
            <EditableText
              {...editPropsFor('P5.sub')}
              as="p"
              defaultStyle={{
                fontSize: 24,
                fontWeight: 500,
                color: BRAND.colors.text,
                margin: 0,
                textAlign: 'center',
                lineHeight: 1.6,
              }}
              placeholder={editMode ? '(서브 카피)' : ''}
            >
              {sub}
            </EditableText>
          </div>
        )}
      </div>

      <div style={{ padding: '10px 30px 50px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <div
          style={{
            border: `1px solid ${BRAND.colors.neutral}`,
            borderRadius: 16,
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: '0.7fr 1fr 1fr',
          }}
        >
          {/* 헤더 행 */}
          <div
            style={{
              backgroundColor: '#fff',
              padding: UNIFORM_PADDING,
              fontWeight: 800,
              fontSize: UNIFORM_FONT_SIZE,     // 좌측 '비교 항목'도 동일 크기
              color: BRAND.colors.text,
              textAlign: 'center',             // 가운데 정렬
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            비교 항목
          </div>
          {colHeader(ourProductName, ourSubLabel, true)}
          {colHeader(generalProductName, generalSubLabel, false)}

          {/* 사진 행 (사진 버전에서만) — 일반 제품은 전체적으로 90% 축소 */}
          {version === 'photo' && (
            <>
              {renderLabelCell('제품')}

              {/* 우리 제품: 정상 크기 (100%) */}
              <div
                style={{
                  padding: 10,
                  borderTop: `1px solid ${BRAND.colors.neutral}`,
                  backgroundColor: 'rgba(200,182,166,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    boxShadow: '0 2px 8px rgba(200,182,166,0.25)',
                    position: 'relative',
                    pointerEvents: 'auto',
                    zIndex: imageOverrides[mainImgId]?.zIndex ?? 1,
                  }}
                >
                  <EditableImage
                    id={mainImgId}
                    src={ourImage}
                    aspect="1 / 1"
                    radius={0}
                    editMode={editMode}
                    override={imageOverrides[mainImgId] || {}}
                    onChange={(partial) => onImageOverrideChange(mainImgId, partial)}
                    availableImages={(allImages || []).filter(Boolean)}
                    isActive={editMode ? mainActive : null}
                    onActivate={() => layer.activateLayer('main', mainImgId)}
                    hasActiveOther={editMode && layer.hasActiveLayer && !mainActive}
                    onLayerAction={(action) => layer.handleLayerAction({ kind: 'main', id: mainImgId }, action)}
                  />
                </div>
              </div>

              {/* 일반 제품: 전체 사각형 90% 축소 (가운데 정렬) */}
              <div
                style={{
                  padding: 10,
                  borderTop: `1px solid ${BRAND.colors.neutral}`,
                  backgroundColor: '#f5f5f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '90%',              // 사각형 자체 90% 축소 요청사항
                    aspectRatio: '1 / 1',
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: '#e0e0e0',
                    opacity: 0.8,
                  }}
                >
                  <img
                    src={resolvedGeneralImage}
                    alt=""
                    crossOrigin="anonymous"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      filter: generalImage ? 'grayscale(100%) brightness(0.85) blur(1px)' : 'none',
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {/* 비교 데이터 행들 */}
          {rows.map((row, i) => (
            <div key={i} style={{ display: 'contents' }}>
              {renderLabelCell(row.label)}

              {/* 우리 제품 셀 — 정상 크기 */}
              {renderCell(row.ours, true)}

              {/* 일반 제품 셀 — 90% 크기로 축소 (내용이 돋보이지 않게) */}
              <div
                style={{
                  padding: '10px 8px',        // 컨테이너 padding 축소
                  backgroundColor: '#f5f5f5',
                  borderBottom: `1px solid ${BRAND.colors.neutral}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '90%',             // 내부 박스 90% 축소
                    padding: '10px 6px',
                    backgroundColor: '#ededed',
                    borderRadius: 8,
                    color: '#9a9a9a',
                    fontSize: UNIFORM_FONT_SIZE,
                    fontWeight: 400,
                    textAlign: 'center',
                    lineHeight: 1.4,
                    wordBreak: 'keep-all',
                    opacity: 0.8,
                  }}
                >
                  {row.general}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>

      {layer.renderFreeImages()}
      {layer.renderOverlay()}
      {/* 🟦 도형 레이어 — 페이지 위에 자유 도형 그리기 */}
      <ShapeLayer
        shapes={shapes}
        editMode={editMode}
        onAddShape={onAddShape}
        onUpdateShape={onUpdateShape}
        onDeleteShape={onDeleteShape}
        activeLayerId={activeLayerId}
        onSetActiveLayer={onSetActiveLayer}
        onChangeShapeLayer={(shapeId, action) => {
          if (onChangeLayerKind) {
            onChangeLayerKind('shape', shapeId, action, mainLayers);
          }
        }}
      />
    </PageFrame>
  );
}
