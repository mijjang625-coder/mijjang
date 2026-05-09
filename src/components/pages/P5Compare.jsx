import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// 🆕 (2026-04-28) 일반 제품 이미지 = 우리 제품 이미지를 자동으로 무채색·블러 처리해 사용
//   사용자가 generalImage 를 직접 지정하지 않은 경우, 우리 제품 사진(ourImage)을
//   그대로 사용하면서 CSS filter 로 grayscale + blur + brightness 보정 → "비슷한 실루엣"
//   효과. 우리 제품 이미지가 바뀌면 자동으로 반영된다.
//
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
// 🎨 사용자 목업(2026-05-09) 기준 디자인 토큰 — 하드코딩 (BRAND 와 별개)
// ─────────────────────────────────────────────────────────────
const MOCKUP = {
  border: '#d4c4b0',
  borderWidth: '1.5px',
  // 컬럼 배경
  bgLeft: '#f1ebe4',     // 비교항목 컬럼
  bgCenter: '#c5b5a3',   // 우리 제품 (POP-OUT)
  bgRight: '#e5e1dd',    // 일반 제품
  // 콘텐츠 셀 배경
  cellWhite: '#ffffff',
  cellLeft: '#faf8f5',
  // 텍스트 색
  textLeft: '#5d4e3f',
  textCenter: '#ffffff',
  textRight: '#757575',
  textCellLeft: '#5d4e3f',
  textCellOurs: '#3d3329',
  textCellGeneral: '#9a9a9a',
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
  // 🆕 (2026-04-28) 일반 제품 이미지도 EditableImage 로 등록 → 사용자가 직접 교체/리사이즈 가능
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
  // 🆕 (2026-05-09 REWRITE) 사용자 HTML 목업 기반 완전 재작성
  // ─────────────────────────────────────────────────────────────
  // 구조: 가로 3컬럼 Flexbox (각 컬럼은 세로 Flex 스택)
  //   ┌──────────┬──────────┬──────────┐
  //   │ 비교항목 │우리 제품 │ 일반     │
  //   │ (좌)     │ POP-OUT  │ 제품     │
  //   │ #f1ebe4  │ #c5b5a3  │ #e5e1dd  │
  //   ├──────────┼──────────┼──────────┤
  //   │ 행1 셀  │ 행1 셀   │ 행1 셀   │
  //   │ 행2 셀  │ 행2 셀   │ 행2 셀   │
  //   │ ...      │ ...      │ ...      │
  //   └──────────┴──────────┴──────────┘
  // POP-OUT: 중앙 컬럼 marginTop/Bottom: -8 + zIndex + box-shadow (transform 미사용 → PNG 안전)
  // ─────────────────────────────────────────────────────────────

  // 컬럼 헤더 셀 (3컬럼 첫번째 행)
  const renderColumnHeader = (labelId, label, kind) => {
    const bg = kind === 'left' ? MOCKUP.bgLeft : kind === 'center' ? MOCKUP.bgCenter : MOCKUP.bgRight;
    const color = kind === 'left' ? MOCKUP.textLeft : kind === 'center' ? MOCKUP.textCenter : MOCKUP.textRight;
    return (
      <div
        style={{
          padding: '16px 12px',
          backgroundColor: bg,
          color,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 56,
          pointerEvents: editMode ? 'auto' : 'inherit',
        }}
      >
        {labelId ? (
          <EditableText
            {...editPropsFor(labelId)}
            as="div"
            defaultStyle={{
              fontWeight: 600,
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
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              letterSpacing: '-0.02em',
              color: 'inherit',
              width: '100%',
            }}
          >
            {label}
          </div>
        )}
      </div>
    );
  };

  // 데이터 콘텐츠 셀 — 좌(라벨) / 중(우리) / 우(일반)
  const renderDataCell = (id, text, kind, isFirstDataRow = false) => {
    const isLeft = kind === 'left';
    const isOurs = kind === 'center';
    const bg = isLeft ? MOCKUP.cellLeft : MOCKUP.cellWhite;
    const color = isLeft ? MOCKUP.textCellLeft : isOurs ? MOCKUP.textCellOurs : MOCKUP.textCellGeneral;
    const fontWeight = isLeft ? 600 : isOurs ? 600 : 400;
    return (
      <div
        style={{
          padding: '18px 14px',
          backgroundColor: bg,
          // 첫 데이터 행은 헤더와 자연스러운 분리선, 이후 행은 셀 사이 구분선
          borderTop: `${MOCKUP.borderWidth} solid ${MOCKUP.border}`,
          minHeight: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          pointerEvents: editMode ? 'auto' : 'inherit',
        }}
      >
        {id ? (
          <EditableText
            {...editPropsFor(id)}
            as="div"
            defaultStyle={{
              color,
              fontSize: 15,
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
          <div
            style={{
              color,
              fontSize: 15,
              fontWeight,
              textAlign: 'center',
              lineHeight: 1.4,
              wordBreak: 'keep-all',
              width: '100%',
            }}
          >
            {text}
          </div>
        )}
      </div>
    );
  };

  // 사진 행의 좌측 라벨 셀 ("제품")
  const renderPhotoLabelCell = () => (
    <div
      style={{
        padding: '18px 14px',
        backgroundColor: MOCKUP.cellLeft,
        borderTop: `${MOCKUP.borderWidth} solid ${MOCKUP.border}`,
        minHeight: 160,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: editMode ? 'auto' : 'inherit',
      }}
    >
      <EditableText
        {...editPropsFor('P5.photoRowLabel')}
        as="div"
        defaultStyle={{
          color: MOCKUP.textCellLeft,
          fontSize: 15,
          fontWeight: 600,
          textAlign: 'center',
          width: '100%',
        }}
      >
        제품
      </EditableText>
    </div>
  );

  // 우리 제품 사진 셀 (중앙 컬럼)
  const renderOurPhotoCell = () => (
    <div
      style={{
        padding: '20px 14px',
        backgroundColor: MOCKUP.cellWhite,
        borderTop: `${MOCKUP.borderWidth} solid ${MOCKUP.border}`,
        minHeight: 160,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 120,
          height: 140,
          borderRadius: 10,
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
          aspect="120 / 140"
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

  // 일반 제품 사진 셀 (우측 컬럼) — 더 작은 크기 + 흐림 처리
  const renderGeneralPhotoCell = () => (
    <div
      style={{
        padding: '20px 14px',
        backgroundColor: MOCKUP.cellWhite,
        borderTop: `${MOCKUP.borderWidth} solid ${MOCKUP.border}`,
        minHeight: 160,
        display: 'flex',
        // 우리 제품과 하단 라인 맞춤 (사진이 작으니 flex-end)
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 100,
          height: 90,
          borderRadius: 8,
          overflow: editMode ? 'visible' : 'hidden',
          backgroundColor: '#fff',
          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
          position: 'relative',
          pointerEvents: 'auto',
          zIndex: imageOverrides[generalImgId]?.zIndex ?? 1,
          marginBottom: 6, // 우리 제품 사진 하단과 시각적 라인 정렬
        }}
      >
        <EditableImage
          id={generalImgId}
          src={resolvedGeneralImage}
          aspect="100 / 90"
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

  // 컬럼 공통 래퍼 (세로 Flex 스택)
  const columnBase = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  };

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

        {/* 비교표 컨테이너 — 사용자 HTML 목업 기반 (3컬럼 Flexbox) */}
        <div style={{ padding: '20px 30px 50px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <div
            style={{
              display: 'flex',
              gap: 0,
              border: `${MOCKUP.borderWidth} solid ${MOCKUP.border}`,
              borderRadius: 12,
              // overflow: hidden 시 POP-OUT 컬럼이 잘리므로 visible 유지
              // 대신 각 컬럼이 자체 borderRadius 로 모서리 처리
              overflow: 'visible',
              position: 'relative',
              backgroundColor: MOCKUP.cellWhite,
            }}
          >
            {/* ── 컬럼 1: 비교 항목 (좌측) ── */}
            <div
              style={{
                ...columnBase,
                backgroundColor: MOCKUP.bgLeft,
                borderRadius: '12px 0 0 12px',
                overflow: 'hidden',
              }}
            >
              {renderColumnHeader('P5.compareLabel', '비교 항목', 'left')}
              {version === 'photo' && renderPhotoLabelCell()}
              {rows.map((row, i) => (
                <div key={`l-${i}`} style={{ display: 'contents' }}>
                  {renderDataCell(`P5.rows.${i}.label`, row.label, 'left', i === 0)}
                </div>
              ))}
            </div>

            {/* ── 컬럼 2: 우리 제품 (중앙, POP-OUT) ──
                marginTop/Bottom: -8 → 위/아래로 8px 튀어나옴
                position: relative + zIndex: 10 → 다른 컬럼 위에 떠 보이게
                box-shadow → 떠 있는 듯한 입체감
                transform 미사용 → html-to-image PNG 내보내기 안전 */}
            <div
              style={{
                ...columnBase,
                backgroundColor: MOCKUP.cellWhite,
                marginTop: -8,
                marginBottom: -8,
                position: 'relative',
                zIndex: 10,
                boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                borderRadius: 12,
                overflow: 'hidden',
                border: `${MOCKUP.borderWidth} solid ${MOCKUP.border}`,
              }}
            >
              {renderColumnHeader('P5.ourProductName', ourProductName, 'center')}
              {version === 'photo' && renderOurPhotoCell()}
              {rows.map((row, i) => (
                <div key={`c-${i}`} style={{ display: 'contents' }}>
                  {renderDataCell(`P5.rows.${i}.ours`, row.ours, 'center', i === 0)}
                </div>
              ))}
            </div>

            {/* ── 컬럼 3: 일반 제품 (우측) ── */}
            <div
              style={{
                ...columnBase,
                backgroundColor: MOCKUP.bgRight,
                borderRadius: '0 12px 12px 0',
                overflow: 'hidden',
              }}
            >
              {renderColumnHeader('P5.generalProductName', generalProductName, 'right')}
              {version === 'photo' && renderGeneralPhotoCell()}
              {rows.map((row, i) => (
                <div key={`r-${i}`} style={{ display: 'contents' }}>
                  {renderDataCell(`P5.rows.${i}.general`, row.general, 'right', i === 0)}
                </div>
              ))}
            </div>
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
