import { BRAND } from '../../lib/theme.js';
import { PageFrame, CheckIcon, Divider } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// P6: 소재 & 사이즈 실증
export default function P6Material({
  copy = {},
  materialImage,
  sizeImage,
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
  const editPropsFor = (id) => ({
    id, editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
    onHide: () => onToggleLayerVisibility('text', id),
  });
  const {
    material = { title: '', desc: '', safetyPoints: [], certifications: [] },
    size = { title: '', provingMessage: '', specs: [] },
  } = copy;

  const stripHtml = (html = '') => String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();

  const resolvedSpecs = (size.specs || [])
    .map((s, i) => {
      const labelId = `P6.size.specs.${i}.label`;
      const valueId = `P6.size.specs.${i}.value`;
      const labelOverride = overrides[labelId] || {};
      const valueOverride = overrides[valueId] || {};

      const labelText = labelOverride.text !== undefined
        ? String(labelOverride.text)
        : (labelOverride.html ? stripHtml(labelOverride.html) : String(s?.label || ''));
      const valueText = valueOverride.text !== undefined
        ? String(valueOverride.text)
        : (valueOverride.html ? stripHtml(valueOverride.html) : String(s?.value || ''));

      return { i, labelId, valueId, labelText, valueText };
    })
    .filter((row) => editMode || row.labelText || row.valueText);

  const matId = 'P6.materialImage';
  const sizeId = 'P6.sizeImage';
  const mainLayers = [
    { id: matId, defaultName: '🖼 소재 사진', defaultZ: 80 },
    { id: sizeId, defaultName: '🖼 사이즈 사진', defaultZ: 81 },
  ];
  // 🟦 도형의 가장 아래 끝 → 페이지 baseHeight 자동 연장
  const shapesBottom = (shapes || []).reduce(
    (max, s) => Math.max(max, (s.y || 0) + (s.h || 0)),
    0
  );
  const layer = useFreeImageLayer({
    pageKey: 'P6', mainLayers, image: materialImage, allImages, baseHeight: Math.max(1150, shapesBottom + 80),
    editMode, freeImages, imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage, onDuplicateFreeImage,
    onAddFreeText, onUpdateFreeText, onDeleteFreeText, onDuplicateFreeText,
    shapes,
    onDeleteShape, onDuplicateShape,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onToggleLayerVisibility, onSetLayerName,
    freeTexts, textOverrides: overrides,
    activeLayerId, onSetActiveLayer,
  });
  const matActive = layer.isLayerActive('main', matId);
  const sizeActive = layer.isLayerActive('main', sizeId);

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.white} onClearActive={layer.clearActiveLayer}>
    <div style={{ position: 'relative', zIndex: 30, pointerEvents: 'none' }}>
      {/* 상단 — 소재 */}
      <div style={{ padding: '50px 40px 30px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <EditableText
          {...editPropsFor('P6.material.title')}
          as="h2"
          defaultStyle={{
            fontSize: 30,
            fontWeight: 800,
            color: BRAND.colors.text,
            margin: 0,
            textAlign: 'center',
            letterSpacing: '-0.03em',
            lineHeight: 1.3,
          }}
        >
          {material.title || '믿을 수 있는 소재'}
        </EditableText>
        <div style={{
          marginTop: 24, position: 'relative',
          pointerEvents: editMode ? 'auto' : 'none',
        }}>
          <EditableImage
            id={matId}
            src={materialImage}
            aspect="16 / 10"
            radius={0}
            editMode={editMode}
            override={imageOverrides[matId] || {}}
            onChange={(partial) => onImageOverrideChange(matId, partial)}
            availableImages={(allImages || []).filter(Boolean)}
            isActive={editMode ? matActive : null}
            onActivate={() => layer.activateLayer('main', matId)}
            hasActiveOther={editMode && layer.hasActiveLayer && !matActive}
            onLayerAction={(action) => layer.handleLayerAction({ kind: 'main', id: matId }, action)}
          />
        </div>
        {/* 소재 상세설명 — 정확히 2줄 고정, 폰트 80% 축소 (24 → 19pt) */}
        <div style={{ marginTop: 20 }}>
          <EditableText
            {...editPropsFor('P6.material.desc')}
            as="div"
            defaultStyle={{
              fontSize: 22,
              fontWeight: 500,
              color: BRAND.colors.text,
              lineHeight: 1.55,
              letterSpacing: '-0.015em',
              wordBreak: 'keep-all',
              whiteSpace: 'pre-line',
              display: editMode ? 'block' : '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: editMode ? 'visible' : 'hidden',
              textOverflow: 'ellipsis',
              // 2줄 클램프 높이를 line-height(1.55)와 맞춰 잘림 방지
              // 22px * 1.55 * 2 ≈ 68.2px → 여유 포함 70px
              maxHeight: editMode ? 'none' : 70,
            }}
          >
            {material.desc}
          </EditableText>
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(material.safetyPoints || []).slice(0, 3).map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CheckIcon size={22} />
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: BRAND.colors.text,
                  letterSpacing: '-0.02em',
                  wordBreak: 'keep-all',
                }}
              >
                {p}
              </div>
            </div>
          ))}
        </div>

        {material.certifications?.length > 0 && (
          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {material.certifications.map((c, i) => (
              <span
                key={i}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  backgroundColor: BRAND.colors.sub,
                  color: BRAND.colors.main,
                  fontSize: 20,
                  fontWeight: 800,
                  border: `1.5px solid ${BRAND.colors.main}`,
                }}
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '0 40px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <Divider color={BRAND.colors.main} />
      </div>

      {/* 하단 — 사이즈 */}
      <div style={{ padding: '30px 40px 50px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <EditableText
          {...editPropsFor('P6.size.title')}
          as="h2"
          defaultStyle={{
            fontSize: 30,
            fontWeight: 800,
            color: BRAND.colors.text,
            margin: 0,
            textAlign: 'center',
            letterSpacing: '-0.03em',
            lineHeight: 1.3,
          }}
        >
          {size.title || '실제 크기 확인'}
        </EditableText>
        <div style={{
          marginTop: 22, position: 'relative',
          pointerEvents: editMode ? 'auto' : 'none',
        }}>
          <EditableImage
            id={sizeId}
            src={sizeImage}
            aspect="16 / 10"
            radius={0}
            editMode={editMode}
            override={imageOverrides[sizeId] || {}}
            onChange={(partial) => onImageOverrideChange(sizeId, partial)}
            availableImages={(allImages || []).filter(Boolean)}
            isActive={editMode ? sizeActive : null}
            onActivate={() => layer.activateLayer('main', sizeId)}
            hasActiveOther={editMode && layer.hasActiveLayer && !sizeActive}
            onLayerAction={(action) => layer.handleLayerAction({ kind: 'main', id: sizeId }, action)}
          />
        </div>
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '10px 22px',
              backgroundColor: BRAND.colors.main,
              color: '#fff',
              fontSize: 24,
              fontWeight: 800,
              borderRadius: 999,
            }}
          >
            <EditableText
              {...editPropsFor('P6.size.provingMessage')}
              as="span"
              defaultStyle={{ color: '#fff', fontSize: 24, fontWeight: 800 }}
            >
              {size.provingMessage}
            </EditableText>
          </span>
        </div>

        <div
          style={{
            marginTop: 22,
            backgroundColor: BRAND.colors.sub,
            borderRadius: 16,
            overflow: editMode ? 'visible' : 'hidden',
          }}
        >
          {resolvedSpecs.map((row, visibleIdx) => (
            <div
              key={row.i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.6fr',
                borderBottom:
                  visibleIdx === resolvedSpecs.length - 1 ? 'none' : `1px solid ${BRAND.colors.neutral}`,
              }}
            >
              <div style={{ padding: '16px 18px' }}>
                <EditableText
                  {...editPropsFor(row.labelId)}
                  as="div"
                  defaultStyle={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: BRAND.colors.main,
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                  placeholder={editMode ? '(항목명)' : ''}
                >
                  {row.labelText}
                </EditableText>
              </div>
              <div style={{ padding: '16px 18px' }}>
                <EditableText
                  {...editPropsFor(row.valueId)}
                  as="div"
                  defaultStyle={{
                    fontSize: 22,
                    fontWeight: 500,
                    color: BRAND.colors.text,
                    lineHeight: 1.45,
                    margin: 0,
                  }}
                  placeholder={editMode ? '(설명)' : ''}
                >
                  {row.valueText}
                </EditableText>
              </div>
            </div>
          ))}
        </div>
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
