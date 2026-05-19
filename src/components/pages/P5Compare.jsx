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
  // 외곽 카드
  cardBg: '#eee8dd',
  cardRadius: 14,

  // 표 외곽 / 행 구분선
  outerBorder: '#d9d1c8',
  outerBorderWidth: '1.5px',
  rowDivider: '#e5ddd3',
  rowDividerWidth: '1px',

  // 좌/우 헤더 라벨
  headerLeftBg: '#efe6dc',
  headerRightBg: '#e8ebef',
  headerLeftText: '#4b3f34',
  headerRightText: '#4b3f34',

  // 중앙 POP-OUT
  popoutBg: '#a87749',
  popoutBorder: '#8b6038',
  popoutExtendTop: 18,
  popoutExtendBottom: 12,
  popoutShadow: '0 14px 28px rgba(0,0,0,0.22)',

  // 데이터 셀
  cellLeftBg: '#ffffff',
  cellRightBg: '#f3f5f7',
  cellLeftText: '#222222',
  cellCenterText: '#ffffff',
  cellRightText: '#222222',

  // 그리드 컬럼 비율
  // 사용자 요청: 좌측(비교 항목) 폭은 조금 줄이고, 우측(일반 셀카봉) 폭은 조금 확장
  gridLeft: 0.82,
  gridCenter: 1.3,
  gridRight: 1.18,
  gridColumns: '0.82fr 1.3fr 1.18fr',
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
  onDuplicateFreeImage = () => {},
  onAddFreeText = () => {},
  onUpdateFreeText = () => {},
  onDeleteFreeText = () => {},
  onDuplicateFreeText = () => {},
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
  onDuplicateShape = () => {},
  activeLayerId = null,
  onSetActiveLayer = () => {},
}) {
  const editPropsFor = (id) => ({
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
    onHide: () => onToggleLayerVisibility('text', id),
  });

  const mainImgId = 'P5.ourImage';
  const generalImgId = 'P5.generalImage';
  const mainLayers = version === 'photo'
    ? [
        { id: mainImgId, defaultName: '🖼 우리 제품 사진', defaultZ: 80 },
        { id: generalImgId, defaultName: '🖼 일반 제품 사진', defaultZ: 81 },
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
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage, onDuplicateFreeImage,
    onAddFreeText, onUpdateFreeText, onDeleteFreeText, onDuplicateFreeText,
    shapes,
    onDeleteShape, onDuplicateShape,
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
  //   - CSS Grid (gridTemplateColumns: '0.82fr 1.3fr 1.18fr')  ← Flexbox 컬럼 분리 금지
  //   - 행 높이 자동 정렬 (Grid 의 본질적 특성)
  //   - 중앙 POP-OUT = 별도 절대 배치 배경 레이어 + 셀들은 zIndex 2 로 그 위에
  //     · transform 미사용 → html-to-image PNG 내보내기 안전
  //     · 위/아래 각 14px 확장
  //   - 외곽: 1.5px #d4c4b0 / 행 구분선: 1px #e0d8cf
  // ─────────────────────────────────────────────────────────────

  // 셀 공통 베이스 — z-index 2 로 POP-OUT 배경 위에 배치
  const cellBase = {
    padding: '18px 12px',
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
    const isCenter = kind === 'center';
    const color = isCenter ? '#ffffff' : kind === 'left' ? M.headerLeftText : M.headerRightText;

    return (
      <div
        style={{
          ...cellBase,
          padding: isCenter ? '14px 8px 12px' : '14px 10px',
          backgroundColor: isCenter ? 'transparent' : kind === 'right' ? M.cellRightBg : '#ffffff',
          color,
          fontSize: isCenter ? 30 : 23,
          fontWeight: isCenter ? 800 : 700,
          borderBottom: `${M.rowDividerWidth} solid ${isCenter ? 'rgba(255,255,255,0.3)' : M.rowDivider}`,
        }}
      >
        {isCenter ? (
          <EditableText
            {...editPropsFor(labelId)}
            as="div"
            defaultStyle={{
              fontWeight: 800,
              fontSize: 30,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              wordBreak: 'keep-all',
              color: '#ffffff',
              textAlign: 'center',
              width: '100%',
              margin: 0,
            }}
          >
            {label}
          </EditableText>
        ) : (
          <div
            style={{
              width: '100%',
              borderRadius: 10,
              padding: '10px 10px',
              backgroundColor: kind === 'left' ? M.headerLeftBg : M.headerRightBg,
            }}
          >
            {labelId ? (
              <EditableText
                {...editPropsFor(labelId)}
                as="div"
                defaultStyle={{
                  fontWeight: 700,
                  fontSize: 23,
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
              <div style={{ fontWeight: 700, fontSize: 15, color: 'inherit', width: '100%' }}>{label}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  // 데이터 셀 (좌/중/우)
  const renderDataCell = (id, text, kind, isLastRow = false) => {
    const isLeft = kind === 'left';
    const isCenter = kind === 'center';
    const bg = isCenter ? 'transparent' : isLeft ? M.cellLeftBg : M.cellRightBg;
    const color = isLeft ? M.cellLeftText : isCenter ? M.cellCenterText : M.cellRightText;

    return (
      <div
        style={{
          ...cellBase,
          minHeight: 92,
          backgroundColor: bg,
          borderBottom: isLastRow ? 'none' : `${M.rowDividerWidth} solid ${isCenter ? 'rgba(255,255,255,0.28)' : M.rowDivider}`,
        }}
      >
        {id ? (
          <EditableText
            {...editPropsFor(id)}
            as="div"
            defaultStyle={{
              color,
              fontSize: 22,
              fontWeight: 700,
              textAlign: 'center',
              lineHeight: 1.28,
              wordBreak: 'keep-all',
              width: '100%',
            }}
          >
            {text}
          </EditableText>
        ) : (
          <div style={{ color, fontSize: 22, fontWeight: 700, lineHeight: 1.28, width: '100%' }}>{text}</div>
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
        minHeight: 176,
        borderBottom: `${M.rowDividerWidth} solid ${M.rowDivider}`,
      }}
    >
      <EditableText
        {...editPropsFor('P5.photoRowLabel')}
        as="div"
        defaultStyle={{
          color: M.cellLeftText,
          fontSize: 22,
          fontWeight: 700,
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
        backgroundColor: 'transparent',
        minHeight: 176,
        borderBottom: `${M.rowDividerWidth} solid rgba(255,255,255,0.3)`,
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 0,           // 외곽선/둥근 모서리 제거
          overflow: editMode ? 'visible' : 'hidden',
          backgroundColor: '#ffffff',
          // boxShadow 제거 — PNG 내보낼 때 외곽선 없애달라
          position: 'relative',
          pointerEvents: editMode ? 'auto' : 'none',
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
        minHeight: 176,
        borderBottom: `${M.rowDividerWidth} solid ${M.rowDivider}`,
      }}
    >
      <div
        style={{
          width: 100,
          height: 100,
          borderRadius: 0,           // 외곽선/둥근 모서리 제거
          overflow: editMode ? 'visible' : 'hidden',
          backgroundColor: '#ffffff',
          // boxShadow 제거
          position: 'relative',
          pointerEvents: editMode ? 'auto' : 'none',
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
          extraFilter={useOurAsGeneralBase ? 'grayscale(100%) brightness(0.92) contrast(0.78) blur(2px) opacity(0.75)' : 'grayscale(18%) brightness(0.95)'}
        />
      </div>
    </div>
  );

  // rows 의 마지막 행 인덱스 (사진 행 포함 시 전체 행 수 기준)
  const lastDataRowIdx = rows.length - 1;

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.white} onClearActive={layer.clearActiveLayer}>
      <div
        style={{
          position: 'relative',
          zIndex: 30,
          pointerEvents: 'none',
          margin: '28px 20px 20px',
          backgroundColor: M.cardBg,
          borderRadius: M.cardRadius,
          padding: '36px 28px 34px',
        }}
      >
        <div style={{ padding: '0 12px 10px', marginBottom: 20, textAlign: 'center', pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <EditableText
            {...editPropsFor('P5.headline')}
            as="h2"
            defaultStyle={{
              fontSize: 30,
              fontWeight: 900,
              color: '#1f1f1f',
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
                  fontSize: 22,
                  fontWeight: 500,
                  color: '#222222',
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

        {/* 비교표 컨테이너 — 헤더 카피와 표 사이 간격 추가 확장 */}
        <div style={{ padding: '48px 10px 8px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
          {/* Grid 표 + POP-OUT 배경 레이어 동시 보유하기 위해 position: relative */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: M.gridColumns,
              border: `${M.outerBorderWidth} solid ${M.outerBorder}`,
              borderRadius: 16,
              overflow: 'visible',
              position: 'relative',
              backgroundColor: '#ffffff',
            }}
          >
            {/* ── 중앙 컬럼 POP-OUT 배경 레이어 ──
                절대 배치로 그리드 안에 흰 박스를 띄워 시각적 POP-OUT 효과 구현
                · top/bottom: -14px → 위/아래로 14px 튀어나옴
                · left/width: 0.82fr 1.3fr 1.18fr 비율 기반
                · transform 미사용 → PNG 안전
                · zIndex 1 (셀들은 zIndex 2 로 이 위에 보임) */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: -M.popoutExtendTop,
                bottom: -M.popoutExtendBottom,
                left: `${(M.gridLeft / (M.gridLeft + M.gridCenter + M.gridRight)) * 100}%`,
                width: `${(M.gridCenter / (M.gridLeft + M.gridCenter + M.gridRight)) * 100}%`,
                backgroundColor: M.popoutBg,
                borderRadius: 14,
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
        onDuplicateShape={onDuplicateShape}
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
