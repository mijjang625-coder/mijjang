import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// P9: 사용법 — STEP 1~3 + 활용 TIP
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
    id: `P9.steps.${i}.image`, defaultName: `🖼 STEP ${i + 1} 사진`, defaultZ: i + 1,
  }));
  const layer = useFreeImageLayer({
    pageKey: 'P9', mainLayers, image: images[0], allImages, baseHeight: 1900,
    editMode, freeImages, imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onSetLayerName,
    activeLayerId, onSetActiveLayer,
  });

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.white} onClearActive={layer.clearActiveLayer}>
      <div style={{ position: 'relative', pointerEvents: editMode ? 'none' : 'auto' }}>
        <div style={{ padding: '50px 40px 20px', textAlign: 'center', pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <EditableText
            {...editPropsFor('P9.title')}
            as="h2"
            defaultStyle={{
              fontSize: 38, fontWeight: 800, color: BRAND.colors.text,
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

        <div style={{ padding: '20px 40px 20px' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, pointerEvents: editMode ? 'auto' : 'inherit' }}>
                    <div
                      style={{
                        width: 58, height: 58, borderRadius: '50%',
                        backgroundColor: BRAND.colors.main, color: '#fff',
                        fontWeight: 900, fontSize: 22, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      STEP<br />{s.stepNo || i + 1}
                    </div>
                    <EditableText
                      {...editPropsFor(`P9.steps.${i}.desc`)}
                      as="div"
                      defaultStyle={{ fontSize: 25, fontWeight: 700, color: BRAND.colors.text, lineHeight: 1.4 }}
                    >
                      {s.desc}
                    </EditableText>
                  </div>
                  <div style={{
                    position: 'relative',
                    pointerEvents: editMode ? 'none' : 'auto',
                    zIndex: z,
                  }}>
                    <EditableImage
                      id={imgId}
                      src={images[i]}
                      aspect="4 / 3"
                      radius={12}
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
              </div>
            );
          })}
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
      {layer.renderOverlay()}
    </PageFrame>
  );
}
