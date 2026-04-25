import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// P7: 감성 라이프스타일 (세로 3모듈)
export default function P7Lifestyle({
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
  const { title = '일상에 자연스럽게', subTitle = '', modules = [] } = copy;
  const editPropsFor = (id) => ({
    id, editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  const mainLayers = modules.slice(0, 3).map((_, i) => ({
    id: `P7.images.${i}`, defaultName: `🖼 라이프 사진 ${i + 1}`, defaultZ: i + 1,
  }));
  // 🟦 도형의 가장 아래 끝 → 페이지 baseHeight 자동 연장
  const shapesBottom = (shapes || []).reduce(
    (max, s) => Math.max(max, (s.y || 0) + (s.h || 0)),
    0
  );
  const layer = useFreeImageLayer({
    pageKey: 'P7', mainLayers, image: images[0], allImages, baseHeight: Math.max(2000, shapesBottom + 80),
    editMode, freeImages, imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage,
    shapes,
    onDeleteShape,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onSetLayerName,
    activeLayerId, onSetActiveLayer,
  });

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.white} onClearActive={layer.clearActiveLayer}>
      <div style={{ position: 'relative', pointerEvents: 'auto' }}>
        <div style={{ padding: '60px 40px 20px', textAlign: 'center', pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <EditableText
            {...editPropsFor('P7.title')}
            as="h2"
            defaultStyle={{
              fontSize: 38, fontWeight: 800, color: BRAND.colors.text,
              margin: 0, textAlign: 'center', letterSpacing: '-0.03em', lineHeight: 1.3,
            }}
          >
            {title}
          </EditableText>
          {(subTitle || editMode) && (
            <div style={{ marginTop: 14 }}>
              <EditableText
                {...editPropsFor('P7.subTitle')}
                as="p"
                defaultStyle={{
                  fontSize: 24, fontWeight: 500, color: BRAND.colors.text,
                  margin: 0, textAlign: 'center', lineHeight: 1.6,
                }}
                placeholder={editMode ? '(서브 카피)' : ''}
              >
                {subTitle}
              </EditableText>
            </div>
          )}
        </div>

        <div style={{ padding: '20px 30px 60px', display: 'flex', flexDirection: 'column', gap: 40 }}>
          {modules.slice(0, 3).map((m, i) => {
            const imgId = `P7.images.${i}`;
            const isImgActive = layer.isLayerActive('main', imgId);
            const z = imageOverrides[imgId]?.zIndex ?? (i + 1);
            return (
              <div key={i}>
                <div style={{
                  position: 'relative',
                  pointerEvents: 'auto',
                  zIndex: z,
                  borderRadius: 18,
                }}>
                  <EditableImage
                    id={imgId}
                    src={images[i]}
                    aspect="4 / 3"
                    radius={16}
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
                <div style={{ pointerEvents: editMode ? 'auto' : 'inherit' }}>
                  <EditableText
                    {...editPropsFor(`P7.modules.${i}.caption`)}
                    as="div"
                    defaultStyle={{
                      marginTop: 18, textAlign: 'center', fontSize: 26,
                      fontWeight: 700, color: BRAND.colors.text, letterSpacing: '-0.02em',
                    }}
                  >
                    {m.caption}
                  </EditableText>
                </div>
              </div>
            );
          })}
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
