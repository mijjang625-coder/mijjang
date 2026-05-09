import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// 🛟 ourImage 도 없는 경우의 fallback: 무채색 그라디언트 빈 박스 (제품 윤곽 없음)
const GENERIC_FALLBACK_BG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e0e0e0"/>
      <stop offset="1" stop-color="#b8b8b8"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#bg)"/>
</svg>
  `.trim());

// ─────────────────────────────────────────────────────────────
// 🎨 (2026-05-09 v2) 사용자 HTML 목업 사양 — 하드코딩 디자인 토큰
// ─────────────────────────────────────────────────────────────
const M = {
  // 외곽선 / 행 구분선
  outerBorder: '#d4c4b0',
  outerBorderWidth: '1.5px',
  rowDivider: '#e0d8cf',
  rowDividerWidth: '1px',
  // 컬럼 헤더 배경
  headerLeftBg: '#f1ebe4',
  headerCenterBg: '#8b7355',   // 진한 모카 브라운
  headerRightBg: '#e5e1dd',
  // 헤더 텍스트
  headerLeftText: '#5d4e3f',
  headerCenterText: '#ffffff',
  headerRightText: '#757575',
  // 데이터 셀 배경
  cellLeftBg: '#faf8f5',
  cellCenterBg: '#ffffff',
  cellRightBg: '#ffffff',
  // 데이터 셀 텍스트
  cellLeftText: '#5d4e3f',
  cellCenterText: '#333333',
  cellRightText: '#888888',
  // POP-OUT
  popoutExtend: 14,            // 위/아래 각 14px 확장
  popoutBorder: '#8b7355',     // 중앙 컬럼 외곽선 (헤더 색과 동일)
  popoutShadow: '0 10px 28px rgba(0,0,0,0.15)',
  // 그리드 컬럼 비율
  gridColumns: '1fr 1.3fr 1fr',
};

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
  onAddFreeText = () => {},
  onUpdateFreeText = () => {},
  onDeleteFreeText = () => {},
  onChangeLayer = () => {},
  onChangeLayerKind = null,
  onReorderLayers = () => {},
  onToggleLayerVisibility = () => {},
  freeTexts = [],
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
  const generalImgId = 'P5.generalImage';
  const mainLayers = version === 'photo'
    ? [
        { id: mainImgId, defaultName: '🖼 우리 제품 사진', defaultZ: 1 },
        { id: generalImgId, defaultName: '🖼 일반 제품 사진', defaultZ: 2 },
      ]
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
    onAddFreeText, onUpdateFreeText, onDeleteFreeText,
    shapes,
    onDeleteShape,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onToggleLayerVisibility, onSetLayerName,
    freeTexts, textOverrides: overrides,
    activeLayerId, onSetActiveLayer,
  });
  const mainActive = layer.isLayerActive('main', mainImgId);
  const generalActive = layer.isLayerActive('main', generalImgId);
  const {
    headline = '왜 이 제품을 선택해야 할까요?',
    sub = '',
    rows = [],
    ourProductName = '우리 제품',
    generalProductName = '일반 제품',
  } = copy;

  // 🆕 일반 제품 이미지 결정 우선순위:
  //   1) 사용자가 EditableImage 로 일반 제품 사진을 업로드/교체 → 그대로 사용 (무필터)
  //   2) 미지정 → 우리 제품 사진(ourImage)을 가져와 CSS filter로 강하게 흐리게 처리
  //   3) 둘 다 없음 → fallback 무채색 그라디언트 박스
  const useOurAsGeneralBase = !generalImage && !!ourImage;
  const resolvedGeneralImage = generalImage || ourImage || GENERIC_FALLBACK_BG;

  // ─────────────────────────────────────────────────────────────
  // 🆕 (2026-05-09 v2) 사용자 HTML 목업 정확한 사양 기반 재작성
  // ─────────────────────────────────────────────────────────────
  // 핵심 구조:
  //   - CSS Grid (gridTemplateColumns: '1fr 1.3fr 1fr')  ← Flexbox 컬럼 분리 금지
  //   - 행 높이 자동 정렬 (Grid 의 본질적 특성)
  //   - 중앙 POP-OUT = 별도 절대 배치 배경 레이어 + 셀들은 zIndex 2 로 그 위에
  //     · transform 미사용 → html-to-image PNG 내보내기 안전
  //     · 위/아래 각 14px 확장
  //   - 외곽: 1.5px #d4c4b0 / 행 구분선: 1px #e0d8cf
  // ─────────────────────────────────────────────────────────────

  // 셀 공통 베이스 — z-index 2 로 POP-OUT 배경 위에 배치
  const cellBase = {
    padding: '16px 12px',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
    fontSize: 14,
    pointerEvents: editMode ? 'auto' : 'inherit',
  };

  // 헤더 셀 (3컬럼)
  const renderHeaderCell = (labelId, label, kind) => {
    const bg = kind === 'left' ? M.headerLeftBg : kind === 'center' ? M.headerCenterBg : M.headerRightBg;
    const color = kind === 'left' ? M.headerLeftText : kind === 'center' ? M.headerCenterText : M.headerRightText;
    const fontWeight = kind === 'center' ? 700 : 600;
    return (
      <div
        style={{
          ...cellBase,
          padding: '18px 12px',
          backgroundColor: bg,
          color,
          fontSize: 15,
          fontWeight,
          borderBottom: `${M.rowDividerWidth} solid ${M.rowDivider}`,
        }}
      >
        {labelId ? (
          <EditableText
            {...editPropsFor(labelId)}
            as="div"
            defaultStyle={{
              fontWeight,
              fontSize: 15,
              letterSpacing: '-0.02em',
              lineHeight: 1.3,
              wordBreak: 'keep-all',
              color: 'inherit',
              textAlign: 'center',
              width: '100%',
              margin: 0,
            }}
          >
            {label}
          </EditableText>
        ) : (
          <div style={{ fontWeight, fontSize: 15, color: 'inherit', width: '100%' }}>{label}</div>
        )}
      </div>
    );
  };

  // 데이터 셀 (좌/중/우)
  const renderDataCell = (id, text, kind, isLastRow = false) => {
    const isLeft = kind === 'left';
    const isCenter = kind === 'center';
    const bg = isLeft ? M.cellLeftBg : isCenter ? M.cellCenterBg : M.cellRightBg;
    const color = isLeft ? M.cellLeftText : isCenter ? M.cellCenterText : M.cellRightText;
    const fontWeight = isLeft ? 600 : isCenter ? 500 : 400;
    return (
      <div
        style={{
          ...cellBase,
          backgroundColor: bg,
          borderBottom: isLastRow ? 'none' : `${M.rowDividerWidth} solid ${M.rowDivider}`,
        }}
      >
        {id ? (
          <EditableText
            {...editPropsFor(id)}
            as="div"
            defaultStyle={{
              color,
              fontSize: 14,
              fontWeight,
              textAlign: 'center',
              lineHeight: 1.4,
              wordBreak: 'keep-all',
              width: '100%',
            }}
          >
            {text}
          </EditableText>
        ) : (
          <div style={{ color, fontSize: 14, fontWeight, lineHeight: 1.4, width: '100%' }}>{text}</div>
        )}
      </div>
    );
  };

  // 사진 행: 좌측 "제품" 라벨
  const renderPhotoLabelCell = () => (
    <div
      style={{
        ...cellBase,
        backgroundColor: M.cellLeftBg,
        minHeight: 140,
        borderBottom: `${M.rowDividerWidth} solid ${M.rowDivider}`,
      }}
    >
      <EditableText
        {...editPropsFor('P5.photoRowLabel')}
        as="div"
        defaultStyle={{
          color: M.cellLeftText,
          fontSize: 14,
          fontWeight: 600,
          textAlign: 'center',
          width: '100%',
        }}
      >
        제품
      </EditableText>
    </div>
  );

  // 사진 행: 중앙 (우리 제품)
  const renderOurPhotoCell = () => (
    <div
      style={{
        ...cellBase,
        backgroundColor: M.cellCenterBg,
        minHeight: 140,
        borderBottom: `${M.rowDividerWidth} solid ${M.rowDivider}`,
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 8,
          overflow: editMode ? 'visible' : 'hidden',
          backgroundColor: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
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
  );

  // 사진 행: 우측 (일반 제품 — 흐림)
  const renderGeneralPhotoCell = () => (
    <div
      style={{
        ...cellBase,
        backgroundColor: M.cellRightBg,
        minHeight: 140,
        borderBottom: `${M.rowDividerWidth} solid ${M.rowDivider}`,
      }}
    >
      <div
        style={{
          width: 100,
          height: 100,
          borderRadius: 8,
          overflow: editMode ? 'visible' : 'hidden',
          backgroundColor: '#fff',
          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
          position: 'relative',
          pointerEvents: 'auto',
          zIndex: imageOverrides[generalImgId]?.zIndex ?? 1,
        }}
      >
        <EditableImage
          id={generalImgId}
          src={resolvedGeneralImage}
          aspect="1 / 1"
          radius={0}
          editMode={editMode}
          override={imageOverrides[generalImgId] || {}}
          onChange={(partial) => onImageOverrideChange(generalImgId, partial)}
          availableImages={(allImages || []).filter(Boolean)}
          isActive={editMode ? generalActive : null}
          onActivate={() => layer.activateLayer('main', generalImgId)}
          hasActiveOther={editMode && layer.hasActiveLayer && !generalActive}
          onLayerAction={(action) => layer.handleLayerAction({ kind: 'main', id: generalImgId }, action)}
          extraFilter={useOurAsGeneralBase ? 'grayscale(100%) brightness(0.95) contrast(0.7) blur(8px)' : ''}
        />
      </div>
    </div>
  );

  // rows 의 마지막 행 인덱스 (사진 행 포함 시 전체 행 수 기준)
  const lastDataRowIdx = rows.length - 1;

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

        {/* 비교표 컨테이너 — POP-OUT 이 위/아래로 14px 튀어나오므로
            바깥 padding 충분히 확보 (상하 30px) */}
        <div style={{ padding: '30px 30px 50px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
          {/* Grid 표 + POP-OUT 배경 레이어 동시 보유하기 위해 position: relative */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: M.gridColumns,
              border: `${M.outerBorderWidth} solid ${M.outerBorder}`,
              borderRadius: 12,
              overflow: 'visible', // POP-OUT 배경이 위/아래로 튀어나가야 하므로 visible
              position: 'relative',
              backgroundColor: '#ffffff',
            }}
          >
            {/* ── 중앙 컬럼 POP-OUT 배경 레이어 ──
                절대 배치로 그리드 안에 흰 박스를 띄워 시각적 POP-OUT 효과 구현
                · top/bottom: -14px → 위/아래로 14px 튀어나옴
                · left/width: 1fr 1.3fr 1fr 비율 기반 → 1/3.3 ~ 2.3/3.3 영역
                · transform 미사용 → PNG 안전
                · zIndex 1 (셀들은 zIndex 2 로 이 위에 보임) */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: -M.popoutExtend,
                bottom: -M.popoutExtend,
                left: `${(1 / 3.3) * 100}%`,
                width: `${(1.3 / 3.3) * 100}%`,
                backgroundColor: '#ffffff',
                borderRadius: 12,
                boxShadow: M.popoutShadow,
                border: `2px solid ${M.popoutBorder}`,
                zIndex: 1,
                pointerEvents: 'none',
              }}
            />

            {/* ── 헤더 행 ── */}
            {renderHeaderCell('P5.compareLabel', '비교 항목', 'left')}
            {renderHeaderCell('P5.ourProductName', ourProductName, 'center')}
            {renderHeaderCell('P5.generalProductName', generalProductName, 'right')}

            {/* ── 사진 행 (사진 버전에서만) ── */}
            {version === 'photo' && (
              <>
                {renderPhotoLabelCell()}
                {renderOurPhotoCell()}
                {renderGeneralPhotoCell()}
              </>
            )}

            {/* ── 데이터 행들 ── */}
            {rows.map((row, i) => {
              const isLastRow = i === lastDataRowIdx;
              return (
                <div key={i} style={{ display: 'contents' }}>
                  {renderDataCell(`P5.rows.${i}.label`, row.label, 'left', isLastRow)}
                  {renderDataCell(`P5.rows.${i}.ours`, row.ours, 'center', isLastRow)}
                  {renderDataCell(`P5.rows.${i}.general`, row.general, 'right', isLastRow)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {layer.renderFreeImages()}
      {layer.renderFreeTexts()}
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
