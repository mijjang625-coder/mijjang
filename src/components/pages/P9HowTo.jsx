import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import InlineFreeImage from '../InlineFreeImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';
import SlotInsertButton from './SlotInsertButton.jsx';

// P9: 사용법 — STEP 1~3 + 활용 TIP
//
// 인라인 끼워넣기 슬롯 (P2 와 동일 패턴):
//   slot='top'           → STEP 1 위
//   slot='between-0-1'   → STEP 1↔2 사이
//   slot='between-1-2'   → STEP 2↔3 사이
//   slot='bottom'        → STEP 3 아래 (TIP 위)
export default function P9HowTo({
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
  const {
    title = '사용법이 이렇게 간단합니다',
    subTitle = '',
    steps = [],
    tips = [],
  } = copy;
  const editPropsFor = (id) => ({
    id, editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  const mainLayers = steps.slice(0, 3).map((_, i) => ({
    id: `P9.steps.${i}.image`, defaultName: `🖼 STEP ${i + 1} 사진`, defaultZ: 80,
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
    pageKey: 'P9', mainLayers, image: images[0], allImages, baseHeight: Math.max(1900, shapesBottom + 80),
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
        <div style={{ padding: '50px 40px 20px', textAlign: 'center', pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <EditableText
            {...editPropsFor('P9.title')}
            as="h2"
            defaultStyle={{
              fontSize: 30, fontWeight: 800, color: BRAND.colors.text,
              margin: 0, textAlign: 'center', letterSpacing: '-0.03em', lineHeight: 1.3,
            }}
          >
            {title}
          </EditableText>
          {(subTitle || editMode) && (
            <div style={{ marginTop: 12 }}>
              <EditableText
                {...editPropsFor('P9.subTitle')}
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

        <div style={{ padding: '20px 40px 20px' }}>
          {/* 슬롯: STEP 1 위 */}
          {renderSlot('top')}

          {steps.slice(0, 3).map((s, i, arr) => {
            const imgId = `P9.steps.${i}.image`;
            const isImgActive = layer.isLayerActive('main', imgId);
            const z = imageOverrides[imgId]?.zIndex ?? (i + 1);
            return (
              <div key={i} style={{ marginBottom: i === arr.length - 1 ? 0 : 18 }}>
                <div
                  style={{
                    backgroundColor: BRAND.colors.sub,
                    borderRadius: 18,
                    padding: '24px 22px',
                  }}
                >
                  {/* 🆕 STEP 동그라미 배지 제거 (사용자 요청 2026-04-28)
                        — 데이터(s.stepNo)는 그대로 유지해 AI/저장 호환성 보장,
                          UI에서만 동그라미를 숨기고 설명 텍스트만 표시. */}
                  {/* 🆕 가운데 정렬 (사용자 요청 2026-04-28)
                        — flex 컨테이너 justifyContent:center + 텍스트 자체 textAlign:center
                          두 줄 이상이 되어도 박스 정중앙 + 줄별로도 가운데. */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 16, pointerEvents: editMode ? 'auto' : 'inherit' }}>
                    <EditableText
                      {...editPropsFor(`P9.steps.${i}.desc`)}
                      as="div"
                      defaultStyle={{ fontSize: 25, fontWeight: 700, color: BRAND.colors.text, lineHeight: 1.4, textAlign: 'center', width: '100%' }}
                    >
                      {s.desc}
                    </EditableText>
                  </div>
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
                  </div>
                </div>

                {i !== arr.length - 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 4v15m0 0l-6-6m6 6l6-6"
                        stroke={BRAND.colors.main}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
                {/* STEP 사이 슬롯 */}
                {i === 0 && renderSlot('between-0-1')}
                {i === 1 && renderSlot('between-1-2')}
              </div>
            );
          })}

          {/* 슬롯: STEP 3 아래 (TIP 위) */}
          {renderSlot('bottom')}
        </div>

        {tips.length > 0 && (
          <div style={{ padding: '20px 40px 50px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
            <div
              style={{
                border: `2px dashed ${BRAND.colors.main}`,
                borderRadius: 16, padding: '22px 20px',
                backgroundColor: BRAND.colors.sub,
              }}
            >
              <div
                style={{
                  fontSize: 22, fontWeight: 900, color: BRAND.colors.main,
                  marginBottom: 12, letterSpacing: '0.08em',
                }}
              >
                TIP
              </div>
              {tips.map((t, i) => (
                <EditableText
                  key={i}
                  {...editPropsFor(`P9.tips.${i}`)}
                  as="div"
                  defaultStyle={{
                    fontSize: 22, fontWeight: 500, color: BRAND.colors.text,
                    lineHeight: 1.55, marginBottom: 6,
                  }}
                >
                  · {t}
                </EditableText>
              ))}
            </div>
          </div>
        )}
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
