import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// P4: 리뷰 4개 — 왼쪽 텍스트 / 오른쪽 사진
export default function P4Reviews({
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
  const { reviews = [] } = copy;
  const editPropsFor = (id) => ({
    id, editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  const mainLayers = reviews.slice(0, 4).map((_, i) => ({
    id: `P4.reviews.${i}.image`, defaultName: `🖼 리뷰 ${i + 1} 사진`, defaultZ: i + 1,
  }));
  // 🟦 도형의 가장 아래 끝 → 페이지 baseHeight 자동 연장
  const shapesBottom = (shapes || []).reduce(
    (max, s) => Math.max(max, (s.y || 0) + (s.h || 0)),
    0
  );
  const layer = useFreeImageLayer({
    pageKey: 'P4', mainLayers, image: images[0], allImages, baseHeight: Math.max(1700, shapesBottom + 80),
    editMode, freeImages, imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage,
    onAddFreeText, onUpdateFreeText, onDeleteFreeText,
    shapes,
    onDeleteShape,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onToggleLayerVisibility, onSetLayerName,
    freeTexts, textOverrides: overrides,
    activeLayerId, onSetActiveLayer,
  });

  const Star = () => (
    <span style={{ color: BRAND.colors.accent, fontSize: 33, letterSpacing: 3, lineHeight: 1, display: 'inline-block' }}>★★★★★</span>
  );

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.sub} onClearActive={layer.clearActiveLayer}>
      <div style={{ position: 'relative', pointerEvents: 'auto' }}>
        {/* 섹션 타이틀 — "고객님들의 생생한 후기" */}
        <div style={{ padding: '40px 40px 20px', textAlign: 'center', pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <EditableText
            {...editPropsFor('P4.sectionTitle')}
            as="h2"
            defaultStyle={{
              fontSize: 38, fontWeight: 800, color: BRAND.colors.text, margin: 0,
              textAlign: 'center', letterSpacing: '-0.03em', lineHeight: 1.3,
            }}
          >
            고객님들의 생생한 후기
          </EditableText>
        </div>

        <div style={{ padding: '0 30px 50px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {reviews.slice(0, 4).map((r, i) => {
            const imgId = `P4.reviews.${i}.image`;
            const isImgActive = layer.isLayerActive('main', imgId);
            const z = imageOverrides[imgId]?.zIndex ?? (i + 1);
            return (
              <div
                key={i}
                style={{
                  backgroundColor: '#fff', borderRadius: 18, overflow: editMode ? 'visible' : 'hidden',
                  display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 310,
                  position: 'relative',
                }}
              >
                <div style={{ padding: '26px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, pointerEvents: editMode ? 'auto' : 'inherit' }}>
                  <div>
                    <Star />
                    <EditableText
                      {...editPropsFor(`P4.reviews.${i}.body`)}
                      as="div"
                      defaultStyle={{
                        marginTop: 14, fontSize: 26, fontWeight: 500,
                        color: BRAND.colors.text, lineHeight: 1.55,
                        letterSpacing: '-0.02em', wordBreak: 'keep-all',
                      }}
                    >
                      {r.body}
                    </EditableText>
                  </div>
                  <EditableText
                    {...editPropsFor(`P4.reviews.${i}.meta`)}
                    as="div"
                    defaultStyle={{ fontSize: 20, color: BRAND.colors.neutralText, fontWeight: 600 }}
                  >
                    {r.nickname} · {r.date}
                  </EditableText>
                </div>
                <div style={{
                  backgroundColor: BRAND.colors.sub, position: 'relative',
                  pointerEvents: 'auto',
                  zIndex: z,
                }}>
                  <EditableImage
                    id={imgId}
                    src={images[i]}
                    radius={0}
                    frame={{ x: 0, y: 0, width: 390, height: 310 }}
                    editMode={editMode}
                    override={imageOverrides[imgId] || {}}
                    onChange={(partial) => onImageOverrideChange(imgId, partial)}
                    availableImages={(allImages || []).filter(Boolean)}
                    isActive={editMode ? isImgActive : null}
                    onActivate={() => layer.activateLayer('main', imgId)}
                    hasActiveOther={editMode && layer.hasActiveLayer && !isImgActive}
                    onLayerAction={(action) => layer.handleLayerAction({ kind: 'main', id: imgId }, action)}
                  />
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
