import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import InlineFreeImage from '../InlineFreeImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';
import SlotInsertButton from './SlotInsertButton.jsx';

// P2: 베네핏 심화 설명 (세로 3섹션, 사진 중심)
//
// 인라인 끼워넣기 슬롯:
//   slot='top'           → 첫 섹션 위
//   slot='between-0-1'   → 1↔2 섹션 사이
//   slot='between-1-2'   → 2↔3 섹션 사이
//   slot='bottom'        → 마지막 섹션 아래
// 각 슬롯에 들어간 사진은 본문 흐름 안에 inline 으로 렌더되어
// 본문 텍스트/메인사진을 자연스럽게 아래로 밀어냄.
export default function P2Benefits({
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
  shapes = [],
  onAddShape = () => {},
  onUpdateShape = () => {},
  onDeleteShape = () => {},
  onChangeLayer = () => {},
  onChangeLayerKind = null,
  onReorderLayers = () => {},
  layerNames = {},
  onSetLayerName = () => {},
  activeLayerId = null,
  onSetActiveLayer = () => {},
}) {
  const { sections = [] } = copy;
  const editPropsFor = (id) => ({
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  // 메인 레이어 = 3개의 섹션 사진 (자유 위치 freeImages 와 충돌 방지를 위해 main 만 등록)
  const mainLayers = sections.slice(0, 3).map((_, i) => ({
    id: `P2.images.${i}`,
    defaultName: `🖼 사진 ${i + 1}`,
    defaultZ: i + 1,
  }));

  // 자유 위치 사진(slot=null)만 freeImageLayer 에 넘겨 absolute 로 그리기
  const freePositioned = freeImages.filter((it) => !it.slot);
  // 인라인(slot != null) 사진은 레이어 패널에만 별도로 등록
  const inlineImagesAll = freeImages.filter((it) => !!it.slot);

  // 도형들의 가장 아래 끝 → 페이지 baseHeight 자동 연장
  const shapesBottom = (shapes || []).reduce(
    (max, s) => Math.max(max, (s.y || 0) + (s.h || 0)),
    0
  );

  const layer = useFreeImageLayer({
    pageKey: 'P2',
    mainLayers,
    image: images[0],
    allImages,
    baseHeight: Math.max(1700, shapesBottom + 80),
    editMode,
    freeImages: freePositioned,
    inlineImages: inlineImagesAll,
    shapes,
    onDeleteShape,
    imageOverrides,
    layerNames,
    onAddFreeImage,
    onUpdateFreeImage,
    onDeleteFreeImage,
    onChangeLayer,
    onChangeLayerKind,
    onReorderLayers,
    onSetLayerName,
    activeLayerId,
    onSetActiveLayer,
  });

  // 슬롯별 사진 그룹핑 (slot != null)
  const slotImages = {
    top: freeImages.filter((it) => it.slot === 'top'),
    'between-0-1': freeImages.filter((it) => it.slot === 'between-0-1'),
    'between-1-2': freeImages.filter((it) => it.slot === 'between-1-2'),
    bottom: freeImages.filter((it) => it.slot === 'bottom'),
  };

  // 인라인 사진을 위/아래로 이동(슬롯 안에서 순서 바꾸기 또는 다른 슬롯으로)
  const SLOT_ORDER = ['top', 'between-0-1', 'between-1-2', 'bottom'];
  const moveInline = (item, dir) => {
    // dir: -1 (위로) | +1 (아래로)
    const list = slotImages[item.slot] || [];
    const idx = list.findIndex((x) => x.id === item.id);
    // 같은 슬롯 안에서 이동 가능?
    if (dir === -1 && idx > 0) {
      // 같은 슬롯 안에서 위로
      const swap = list[idx - 1];
      // zIndex/order 를 바꾸지 않고 그냥 freeImages 배열 자체를 재배치
      onReorderInline(item.id, swap.id);
      return;
    }
    if (dir === 1 && idx < list.length - 1) {
      const swap = list[idx + 1];
      onReorderInline(item.id, swap.id);
      return;
    }
    // 슬롯 경계 → 다음/이전 슬롯으로
    const slotIdx = SLOT_ORDER.indexOf(item.slot);
    const newSlotIdx = slotIdx + dir;
    if (newSlotIdx < 0 || newSlotIdx >= SLOT_ORDER.length) return;
    onUpdateFreeImage(item.id, { slot: SLOT_ORDER[newSlotIdx] });
  };

  // 같은 슬롯 안의 두 인라인 사진 순서 교환 (freeImages 배열 자체 재배치는 App 단에서 처리)
  // 단순화를 위해 부모에 reorder API 가 없으므로 임시로 zIndex 토글로 충분
  // (인라인은 시각적으로 흐름 순서가 더 중요하므로, zIndex 보다 배열 순서가 핵심)
  // → 나중에 P2 외 페이지로 확장하면서 App 에 reorderInlineFreeImage 추가 예정
  const onReorderInline = (idA, idB) => {
    // 두 항목의 createdAt(=id)을 사용해 sort 안정성 유지하기 위해 임시 trick:
    // 각 사진에 sortKey 라는 숫자를 부여하고 swap.
    // 현재 데이터에 sortKey 가 없을 수 있으므로 즉석 부여.
    const a = freeImages.find((x) => x.id === idA);
    const b = freeImages.find((x) => x.id === idB);
    if (!a || !b) return;
    const ak = a.sortKey ?? Date.parse(a.id?.split('_')[1] ? '' : '') ?? 0;
    const bk = b.sortKey ?? 0;
    // 더 단순하게: a 의 sortKey 를 b 보다 살짝 큰 값으로 설정
    // (a 가 위로 가야하는 경우 b.sortKey - 0.5)
    onUpdateFreeImage(idA, { sortKey: (b.sortKey ?? 0) - 0.5 });
    onUpdateFreeImage(idB, { sortKey: (a.sortKey ?? 0) + 0.5 });
  };

  // 슬롯 안 사진들을 sortKey(있으면) 또는 id 순으로 정렬
  const sortSlot = (arr) =>
    arr.slice().sort((x, y) => {
      const xk = x.sortKey ?? 0;
      const yk = y.sortKey ?? 0;
      if (xk !== yk) return xk - yk;
      return (x.id || '').localeCompare(y.id || '');
    });

  // 인라인 슬롯 렌더 — 사진 + 슬롯 사이 + 버튼
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
      <div style={{
        padding: '50px 40px',
        position: 'relative',
        pointerEvents: editMode ? 'none' : 'auto',
      }}>
        {/* 슬롯: 첫 섹션 위 */}
        {renderSlot('top')}

        {sections.slice(0, 3).map((s, i) => {
          const imgId = `P2.images.${i}`;
          const isImgActive = layer.isLayerActive('main', imgId);
          const z = imageOverrides[imgId]?.zIndex ?? (i + 1);
          const isLast = i === sections.length - 1 || i === 2;
          return (
            <div key={i}>
              <div
                style={{
                  marginBottom: isLast ? 0 : 60,
                  paddingBottom: isLast ? 0 : 40,
                  borderBottom: isLast ? 'none' : `1px solid ${BRAND.colors.neutral}`,
                }}
              >
                <div style={{ marginBottom: 22, pointerEvents: editMode ? 'auto' : 'inherit' }}>
                  <div
                    style={{
                      display: 'inline-block',
                      backgroundColor: BRAND.colors.main,
                      color: '#fff',
                      fontSize: 22,
                      fontWeight: 800,
                      padding: '6px 16px',
                      borderRadius: 999,
                      marginBottom: 14,
                    }}
                  >
                    POINT {String(i + 1).padStart(2, '0')}
                  </div>
                  <EditableText
                    {...editPropsFor(`P2.sections.${i}.title`)}
                    as="h3"
                    defaultStyle={{
                      fontSize: 32,
                      fontWeight: 800,
                      color: BRAND.colors.text,
                      margin: 0,
                      lineHeight: 1.3,
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {s.title}
                  </EditableText>
                  <div style={{ marginTop: 10 }}>
                    <EditableText
                      {...editPropsFor(`P2.sections.${i}.desc`)}
                      as="p"
                      defaultStyle={{
                        fontSize: 24,
                        fontWeight: 500,
                        color: BRAND.colors.text,
                        margin: 0,
                        lineHeight: 1.6,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {s.desc}
                    </EditableText>
                  </div>
                </div>
                <div
                  style={{
                    pointerEvents: editMode ? 'none' : 'auto',
                    position: 'relative',
                    zIndex: z,
                    borderRadius: 18,
                  }}
                >
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
              </div>

              {/* 섹션 사이 슬롯 */}
              {i === 0 && renderSlot('between-0-1')}
              {i === 1 && renderSlot('between-1-2')}
            </div>
          );
        })}

        {/* 슬롯: 마지막 섹션 아래 */}
        {renderSlot('bottom')}
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
