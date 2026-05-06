import { BRAND } from '../../lib/theme.js';
import { PageFrame, CheckIcon, PillBadge } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// P3: 이런 분들께 추천드려요 (체크리스트형)
export default function P3Target({
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
    id, editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });
  const {
    badge = '',
    mainTitle = '이런 분들께 추천드려요!',
    badgePoint = '',
    checklist = [],
  } = copy;

  const mainImgId = 'P3.image';
  const mainLayers = [{ id: mainImgId, defaultName: '🖼 메인 사진', defaultZ: 1 }];
  // 🟦 도형의 가장 아래 끝 → 페이지 baseHeight 자동 연장
  const shapesBottom = (shapes || []).reduce(
    (max, s) => Math.max(max, (s.y || 0) + (s.h || 0)),
    0
  );
  const layer = useFreeImageLayer({
    pageKey: 'P3', mainLayers, image, allImages, baseHeight: Math.max(1200, shapesBottom + 80),
    editMode, freeImages, imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage,
    shapes,
    onDeleteShape,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onToggleLayerVisibility, onSetLayerName,
    freeTexts, textOverrides: overrides,
    activeLayerId, onSetActiveLayer,
  });
  const mainActive = layer.isLayerActive('main', mainImgId);
  const mainZ = imageOverrides[mainImgId]?.zIndex ?? 1;

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.sub} onClearActive={layer.clearActiveLayer}>
      <div style={{
        display: 'flex', flexDirection: 'column', minHeight: 1200, width: '100%',
        position: 'relative', pointerEvents: 'auto',
      }}>
        {/* 1) 상단 타이틀 박스 */}
        <div style={{ padding: '40px 40px 16px', textAlign: 'center', flexShrink: 0, pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <div
            style={{
              border: `2px dashed ${BRAND.colors.main}`,
              borderRadius: 16,
              padding: '40px 20px',
              backgroundColor: 'rgba(255,255,255,0.7)',
              minHeight: 220,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 18,
            }}
          >
            {badge && (<div><PillBadge>{badge}</PillBadge></div>)}
            <EditableText
              {...editPropsFor('P3.mainTitle')}
              as="h2"
              defaultStyle={{
                fontSize: 42, fontWeight: 800, color: BRAND.colors.text, margin: 0,
                textAlign: 'center', letterSpacing: '-0.03em', lineHeight: 1.4,
              }}
            >
              {mainTitle}
            </EditableText>
          </div>
        </div>

        {/* 2) 중앙 제품 이미지 (EditableImage + 원형 클립) */}
        <div
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '10px 30px', minHeight: 540,
          }}
        >
          <div style={{
            position: 'relative', width: 560, height: 560,
            pointerEvents: 'auto',
            zIndex: mainZ,
            // 편집모드일 때 툴바가 잘리지 않도록 visible
            overflow: editMode ? 'visible' : 'hidden',
          }}>
            {/* 원형 테두리 + 그림자만 담당하는 데코 레이어 — 사진 위에 겹침 */}
            <div
              style={{
                position: 'absolute', inset: 0,
                borderRadius: '50%',
                border: `5px solid ${BRAND.colors.main}`,
                boxShadow: '0 8px 24px rgba(47, 42, 38, 0.08)',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            />
            {/* 사진 자체는 EditableImage가 radius 50%로 원형 클립 */}
            <EditableImage
              id={mainImgId}
              src={image}
              aspect="1 / 1"
              radius="50%"
              editMode={editMode}
              override={imageOverrides[mainImgId] || {}}
              onChange={(partial) => onImageOverrideChange(mainImgId, partial)}
              availableImages={(allImages || []).filter(Boolean)}
              isActive={editMode ? mainActive : null}
              onActivate={() => layer.activateLayer('main', mainImgId)}
              hasActiveOther={editMode && layer.hasActiveLayer && !mainActive}
              onLayerAction={(action) => layer.handleLayerAction({ kind: 'main', id: mainImgId }, action)}
            />
            {/* 🗑️ 포인트 배지(주황 라벨)는 모바일에서 우측이 잘리는 문제로 완전 삭제 */}
          </div>
        </div>

        {/* 3) 체크리스트 */}
        <div style={{ padding: '0 40px 40px', flexShrink: 0, pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <div
            style={{
              border: `2px dashed ${BRAND.colors.main}`,
              borderRadius: 16, padding: '20px 24px', backgroundColor: '#fff',
            }}
          >
            {checklist.slice(0, 5).map((item, i, arr) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  height: 60, padding: '0 6px',
                  borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${BRAND.colors.neutral}`,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                  <CheckIcon size={24} variant={1} color="#E8590C" />
                </span>
                <div style={{ flex: 1 }}>
                  <EditableText
                    {...editPropsFor(`P3.checklist.${i}`)}
                    as="div"
                    defaultStyle={{
                      fontSize: 22, fontWeight: 600, color: BRAND.colors.text,
                      lineHeight: 1.4, letterSpacing: '-0.02em',
                      wordBreak: 'keep-all',
                    }}
                  >
                    {item}
                  </EditableText>
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
