import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import InlineFreeImage from '../InlineFreeImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';
import SlotInsertButton from './SlotInsertButton.jsx';

// P7: 감성 라이프스타일 (세로 3모듈)
//
// 인라인 끼워넣기 슬롯 (P2 와 동일 패턴):
//   slot='top'           → 제목 위
//   slot='between-0-1'   → 모듈 1↔2 사이
//   slot='between-1-2'   → 모듈 2↔3 사이
//   slot='bottom'        → 마지막 모듈 아래
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
  onAddFreeImageToSlot = () => {},
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
  const { title = '일상에 자연스럽게', subTitle = '', modules = [] } = copy;
  const editPropsFor = (id) => ({
    id, editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  const mainLayers = modules.slice(0, 3).map((_, i) => ({
    id: `P7.images.${i}`, defaultName: `🖼 라이프 사진 ${i + 1}`, defaultZ: i + 1,
  }));

  // 자유 위치 사진(slot=null) vs 인라인(slot != null)
  const freePositioned = freeImages.filter((it) => !it.slot);
  const inlineImagesAll = freeImages.filter((it) => !!it.slot);

  // 🟦 도형의 가장 아래 끝 → 페이지 baseHeight 자동 연장
  const shapesBottom = (shapes || []).reduce(
    (max, s) => Math.max(max, (s.y || 0) + (s.h || 0)),
    0
  );
  const layer = useFreeImageLayer({
    pageKey: 'P7', mainLayers, image: images[0], allImages, baseHeight: Math.max(2000, shapesBottom + 80),
    editMode,
    freeImages: freePositioned,
    inlineImages: inlineImagesAll,
    imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage,
    onAddFreeText, onUpdateFreeText, onDeleteFreeText,
    shapes,
    onDeleteShape,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onToggleLayerVisibility, onSetLayerName,
    freeTexts, textOverrides: overrides,
    activeLayerId, onSetActiveLayer,
  });

  // 슬롯별 사진 그룹핑
  const SLOT_ORDER = ['top', 'between-0-1', 'between-1-2', 'bottom'];
  const slotImages = {
    top: freeImages.filter((it) => it.slot === 'top'),
    'between-0-1': freeImages.filter((it) => it.slot === 'between-0-1'),
    'between-1-2': freeImages.filter((it) => it.slot === 'between-1-2'),
    bottom: freeImages.filter((it) => it.slot === 'bottom'),
  };

  const onReorderInline = (idA, idB) => {
    const a = freeImages.find((x) => x.id === idA);
    const b = freeImages.find((x) => x.id === idB);
    if (!a || !b) return;
    onUpdateFreeImage(idA, { sortKey: (b.sortKey ?? 0) - 0.5 });
    onUpdateFreeImage(idB, { sortKey: (a.sortKey ?? 0) + 0.5 });
  };

  const moveInline = (item, dir) => {
    const list = slotImages[item.slot] || [];
    const idx = list.findIndex((x) => x.id === item.id);
    if (dir === -1 && idx > 0) { onReorderInline(item.id, list[idx - 1].id); return; }
    if (dir === 1 && idx < list.length - 1) { onReorderInline(item.id, list[idx + 1].id); return; }
    const slotIdx = SLOT_ORDER.indexOf(item.slot);
    const newSlotIdx = slotIdx + dir;
    if (newSlotIdx < 0 || newSlotIdx >= SLOT_ORDER.length) return;
    onUpdateFreeImage(item.id, { slot: SLOT_ORDER[newSlotIdx] });
  };

  const sortSlot = (arr) =>
    arr.slice().sort((x, y) => {
      const xk = x.sortKey ?? 0;
      const yk = y.sortKey ?? 0;
      if (xk !== yk) return xk - yk;
      return (x.id || '').localeCompare(y.id || '');
    });

  const renderSlot = (slotKey) => {
    const list = sortSlot(slotImages[slotKey] || []);
    return (
      <>
        {list.map((item, idx) => {
          const isActive = activeLayerId === `inline:${item.id}`;
          return (
            <InlineFreeImage
              key={item.id}
              item={item}
              editMode={editMode}
              isActive={isActive}
              onActivate={() => onSetActiveLayer(`inline:${item.id}`)}
              onUpdate={(partial) => onUpdateFreeImage(item.id, partial)}
              onDelete={() => onDeleteFreeImage(item.id)}
              onMoveUp={() => moveInline(item, -1)}
              onMoveDown={() => moveInline(item, +1)}
              canMoveUp={!(slotKey === 'top' && idx === 0)}
              canMoveDown={!(slotKey === 'bottom' && idx === list.length - 1)}
              replaceImages={(allImages || []).filter(Boolean)}
              onChangeLayer={(action) =>
                layer.handleLayerAction({ kind: 'inline', id: item.id }, action)
              }
              zIndexLabel={item.zIndex ?? null}
            />
          );
        })}
        {editMode && <SlotInsertButton slot={slotKey} onInsert={onAddFreeImageToSlot} allImages={allImages} />}
      </>
    );
  };

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.white} onClearActive={layer.clearActiveLayer}>
      <div style={{ position: 'relative', pointerEvents: 'auto' }}>
        <div style={{ padding: '60px 40px 20px', textAlign: 'center', pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <EditableText
            {...editPropsFor('P7.title')}
            as="h2"
            defaultStyle={{
              fontSize: 30, fontWeight: 800, color: BRAND.colors.text,
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
                  fontSize: 22, fontWeight: 500, color: BRAND.colors.text,
                  margin: 0, textAlign: 'center', lineHeight: 1.6,
                }}
                placeholder={editMode ? '(서브 카피)' : ''}
              >
                {subTitle}
              </EditableText>
            </div>
          )}
        </div>

        <div style={{ padding: '20px 30px 60px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* 슬롯: 첫 모듈 위 */}
          {renderSlot('top')}

          {modules.slice(0, 3).map((m, i) => {
            const imgId = `P7.images.${i}`;
            const isImgActive = layer.isLayerActive('main', imgId);
            const z = imageOverrides[imgId]?.zIndex ?? (i + 1);
            const captionId = `P7.modules.${i}.caption`;
            const rawCaptionOverride = overrides[captionId] || {};
            const captionOverride = { ...rawCaptionOverride, offset: { x: 0, y: 0 } };
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
                <div
                  style={{
                    pointerEvents: editMode ? 'auto' : 'inherit',
                    position: 'relative',
                    height: i < 2 ? 124 : 84,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: 0,
                      right: 0,
                      transform: 'translateY(-50%)',
                    }}
                  >
                    <EditableText
                      id={captionId}
                      editMode={editMode}
                      override={captionOverride}
                      onChange={(partial) => onOverrideChange(captionId, partial)}
                      draggable={false}
                      as="div"
                      defaultStyle={{
                        textAlign: 'center',
                        fontSize: 26,
                        lineHeight: 1.2,
                        fontWeight: 700,
                        color: BRAND.colors.text,
                        letterSpacing: '-0.02em',
                        width: '100%',
                        margin: 0,
                      }}
                    >
                      {m.caption}
                    </EditableText>
                  </div>
                </div>
                {/* 모듈 사이 슬롯 */}
                {i === 0 && renderSlot('between-0-1')}
                {i === 1 && renderSlot('between-1-2')}
              </div>
            );
          })}

          {/* 슬롯: 마지막 모듈 아래 */}
          {renderSlot('bottom')}
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
