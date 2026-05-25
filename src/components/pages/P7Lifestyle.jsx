import { useEffect } from 'react';
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
  const { title = '일상에 자연스럽게', subTitle = '', modules = [] } = copy;
  const CAPTION_LAYOUT_STYLE_KEYS = [
    'position', 'top', 'left', 'right', 'bottom', 'transform',
    'height', 'minHeight', 'maxHeight', 'overflow', 'zIndex',
  ];

  const sanitizeCaptionStyle = (style = {}) => {
    if (!style || typeof style !== 'object') return {};
    const next = { ...style };
    CAPTION_LAYOUT_STYLE_KEYS.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(next, k)) delete next[k];
    });
    return next;
  };

  const normalizeCaptionOverride = (raw = {}) => {
    const { offset: _legacyOffset, frame: _legacyFrame, style, ...rest } = raw || {};
    const cleanedStyle = sanitizeCaptionStyle(style);
    return {
      ...rest,
      ...(Object.keys(cleanedStyle).length ? { style: cleanedStyle } : { style: {} }),
      offset: { x: 0, y: 0 },
      frame: null,
    };
  };

  const sanitizeCaptionPartial = (partial = {}) => {
    const next = { ...partial };
    if (Object.prototype.hasOwnProperty.call(next, 'offset')) {
      next.offset = { x: 0, y: 0 };
    }
    if (Object.prototype.hasOwnProperty.call(next, 'frame')) {
      next.frame = null;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'style')) {
      next.style = sanitizeCaptionStyle(next.style || {});
    }
    return next;
  };

  const editPropsFor = (id) => ({
    id, editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
    onHide: () => onToggleLayerVisibility('text', id),
  });

  const mainLayers = modules.slice(0, 3).map((_, i) => ({
    id: `P7.images.${i}`, defaultName: `🖼 라이프 사진 ${i + 1}`, defaultZ: 80,
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
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage, onDuplicateFreeImage,
    onAddFreeText, onUpdateFreeText, onDeleteFreeText, onDuplicateFreeText,
    shapes,
    onDeleteShape, onDuplicateShape,
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

  // 기존 로컬 저장 상태에 남아 있는 legacy 캡션 값(offset/frame/absolute style)을
  // 실제 저장값에서도 정규화해서 이후 편집에서도 자동 흐름이 깨지지 않게 고정한다.
  useEffect(() => {
    modules.slice(0, 3).forEach((_, i) => {
      const captionId = `P7.modules.${i}.caption`;
      const raw = overrides[captionId] || {};
      const normalized = normalizeCaptionOverride(raw);
      const rawStyle = raw?.style || {};
      const cleanedRawStyle = sanitizeCaptionStyle(rawStyle);
      const hasLegacyStyle = Object.keys(rawStyle).length !== Object.keys(cleanedRawStyle).length;
      const hasLegacyOffset = !!raw?.offset && ((raw.offset.x || 0) !== 0 || (raw.offset.y || 0) !== 0);
      const hasLegacyFrame = raw?.frame != null;

      if (hasLegacyStyle || hasLegacyOffset || hasLegacyFrame) {
        onOverrideChange(captionId, normalized);
      }
    });
  }, [modules, overrides, onOverrideChange]);

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
      <div style={{ position: 'relative', zIndex: 30, pointerEvents: 'none' }}>
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
            const captionOverride = normalizeCaptionOverride(overrides[captionId] || {});
            return (
              <div key={i}>
                <div style={{
                  position: 'relative',
                  pointerEvents: editMode ? 'auto' : 'none',
                  borderRadius: 0,  // 모서리 제거
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
                </div>
                <div
                  style={{
                    pointerEvents: editMode ? 'auto' : 'inherit',
                    position: 'relative',
                    zIndex: 1200, // 캡션은 항상 이미지 위에 표시
                    padding: i < 2 ? '26px 0 24px' : '18px 0 14px',
                  }}
                >
                  <EditableText
                    id={captionId}
                    editMode={editMode}
                    override={captionOverride}
                    onChange={(partial) => onOverrideChange(captionId, sanitizeCaptionPartial(partial))}
                    as="div"
                    draggable={false}
                    style={{
                      position: 'static',
                      transform: 'none',
                      width: '100%',
                      height: 'auto',
                      minHeight: 0,
                      maxHeight: 'none',
                      overflow: 'visible',
                      display: 'block',
                    }}
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

      {layer.renderFlowImages?.()}
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
