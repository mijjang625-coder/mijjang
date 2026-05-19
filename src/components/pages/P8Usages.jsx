import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// P8: 다양한 활용법 — 4개 모듈
export default function P8Usages({
  copy = {},
  images = [],
  allImages = [],
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
  const { headline = '이렇게도 쓸 수 있어요', usages = [] } = copy;
  const editPropsFor = (id) => ({
    id, editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  const mainLayers = usages.slice(0, 4).map((_, i) => ({
    id: `P8.images.${i}`, defaultName: `🖼 활용법 ${i + 1} 사진`, defaultZ: 80,
  }));
  // 🟦 도형의 가장 아래 끝 → 페이지 baseHeight 자동 연장
  const shapesBottom = (shapes || []).reduce(
    (max, s) => Math.max(max, (s.y || 0) + (s.h || 0)),
    0
  );
  const layer = useFreeImageLayer({
    pageKey: 'P8', mainLayers, image: images[0], allImages, baseHeight: Math.max(1200, shapesBottom + 80),
    editMode, freeImages, imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage, onDuplicateFreeImage,
    onAddFreeText, onUpdateFreeText, onDeleteFreeText, onDuplicateFreeText,
    shapes,
    onDeleteShape, onDuplicateShape,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onToggleLayerVisibility, onSetLayerName,
    freeTexts, textOverrides: overrides,
    activeLayerId, onSetActiveLayer,
  });

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.sub} onClearActive={layer.clearActiveLayer}>
      <div style={{ position: 'relative', zIndex: 30, pointerEvents: 'none' }}>
        <div style={{ padding: '50px 40px 20px', textAlign: 'center', pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <EditableText
            {...editPropsFor('P8.headline')}
            as="h2"
            defaultStyle={{
              fontSize: 30, fontWeight: 800, color: BRAND.colors.text,
              margin: 0, textAlign: 'center', letterSpacing: '-0.03em', lineHeight: 1.3,
            }}
          >
            {headline}
          </EditableText>
        </div>

        <div
          style={{
            padding: '10px 30px 50px', display: 'grid',
            gridTemplateColumns: '1fr 1fr', gap: 18,
          }}
        >
          {usages.slice(0, 4).map((u, i) => {
            const imgId = `P8.images.${i}`;
            const isImgActive = layer.isLayerActive('main', imgId);
            const z = imageOverrides[imgId]?.zIndex ?? (i + 1);
            return (
              <div
                key={i}
                style={{
                  backgroundColor: '#fff', borderRadius: 16, overflow: editMode ? 'visible' : 'hidden',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                <div style={{
                  position: 'relative',
                  pointerEvents: editMode ? 'auto' : 'none',
                }}>
                  <EditableImage
                    id={imgId}
                    src={images[i]}
                    aspect="4 / 3"
                    radius={0}
                    editMode={editMode}
                    override={imageOverrides[imgId] || {}}
                    onChange={(partial) => onImageOverrideChange(imgId, partial)}
                    availableImages={(allImages || []).filter(Boolean)}
                    isActive={editMode ? isImgActive : null}
                    onActivate={() => layer.activateLayer('main', imgId)}
                    hasActiveOther={editMode && layer.hasActiveLayer && !isImgActive}
                    onLayerAction={(action) => layer.handleLayerAction({ kind: 'main', id: imgId }, action)}
                  />
                  {/* 🆕 01/02 번호 라벨 제거 (사용자 요청 2026-04-28)
                        — P9 STEP 동그라미와 동일한 정책: UI에서만 숨김,
                          데이터/로직은 그대로 유지. */}
                </div>
                <div style={{ padding: '18px 18px 22px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
                  <EditableText
                    {...editPropsFor(`P8.usages.${i}.title`)}
                    as="div"
                    defaultStyle={{
                      fontSize: 24, fontWeight: 800, color: BRAND.colors.main, marginBottom: 8,
                    }}
                  >
                    {u.title}
                  </EditableText>
                  <EditableText
                    {...editPropsFor(`P8.usages.${i}.desc1`)}
                    as="p"
                    defaultStyle={{
                      fontSize: 22, fontWeight: 500, color: BRAND.colors.text,
                      margin: 0, lineHeight: 1.6,
                    }}
                  >
                    {u.desc1}
                  </EditableText>
                  {(u.desc2 || editMode) && (
                    <div style={{ marginTop: 4 }}>
                      <EditableText
                        {...editPropsFor(`P8.usages.${i}.desc2`)}
                        as="p"
                        defaultStyle={{
                          fontSize: 22, fontWeight: 500, color: BRAND.colors.text,
                          margin: 0, lineHeight: 1.6,
                        }}
                        placeholder={editMode ? '(추가 설명)' : ''}
                      >
                        {u.desc2}
                      </EditableText>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
