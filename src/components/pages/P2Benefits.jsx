import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// P2: 베네핏 심화 설명 (세로 3섹션, 사진 중심)
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
  onUpdateFreeImage = () => {},
  onDeleteFreeImage = () => {},
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

  // 메인 레이어 = 3개의 섹션 사진
  const mainLayers = sections.slice(0, 3).map((_, i) => ({
    id: `P2.images.${i}`,
    defaultName: `🖼 사진 ${i + 1}`,
    defaultZ: i + 1,
  }));

  const layer = useFreeImageLayer({
    pageKey: 'P2',
    mainLayers,
    image: images[0],
    allImages,
    baseHeight: 1700,
    editMode,
    freeImages,
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

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.white} onClearActive={layer.clearActiveLayer}>
      <div style={{
        padding: '50px 40px',
        position: 'relative',
        pointerEvents: editMode ? 'none' : 'auto',
      }}>
        {sections.slice(0, 3).map((s, i) => {
          const imgId = `P2.images.${i}`;
          const isImgActive = layer.isLayerActive('main', imgId);
          const z = imageOverrides[imgId]?.zIndex ?? (i + 1);
          return (
            <div
              key={i}
              style={{
                marginBottom: i === sections.length - 1 ? 0 : 60,
                paddingBottom: i === sections.length - 1 ? 0 : 40,
                borderBottom:
                  i === sections.length - 1 ? 'none' : `1px solid ${BRAND.colors.neutral}`,
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
          );
        })}
      </div>

      {layer.renderFreeImages()}
      {layer.renderOverlay()}
    </PageFrame>
  );
}
