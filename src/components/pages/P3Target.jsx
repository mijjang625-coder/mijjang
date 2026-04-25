import { BRAND } from '../../lib/theme.js';
import { PageFrame, CheckIcon, PillBadge } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// P3: 이런 분들께 추천드려요 (체크리스트형)
export default function P3Target({
  copy = {},
  image,
  allImages = [],
  variant = 0,
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
  const editPropsFor = (id) => ({
    id, editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });
  const {
    badge = '',
    mainTitle = '이런 분들께 추천드려요!',
    badgePoint = '',
    checklist = [],
  } = copy;

  const mainImgId = 'P3.image';
  const mainLayers = [{ id: mainImgId, defaultName: '🖼 메인 사진', defaultZ: 1 }];
  const layer = useFreeImageLayer({
    pageKey: 'P3', mainLayers, image, allImages, baseHeight: 1200,
    editMode, freeImages, imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onSetLayerName,
    activeLayerId, onSetActiveLayer,
  });
  const mainActive = layer.isLayerActive('main', mainImgId);
  const mainZ = imageOverrides[mainImgId]?.zIndex ?? 1;

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.sub} onClearActive={layer.clearActiveLayer}>
      <div style={{
        display: 'flex', flexDirection: 'column', minHeight: 1200, width: '100%',
        position: 'relative', pointerEvents: editMode ? 'none' : 'auto',
      }}>
        {/* 1) 상단 타이틀 박스 */}
        <div style={{ padding: '40px 40px 16px', textAlign: 'center', flexShrink: 0, pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <div
            style={{
              border: `2px dashed ${BRAND.colors.main}`,
              borderRadius: 16,
              padding: '20px 20px',
              backgroundColor: 'rgba(255,255,255,0.7)',
            }}
          >
            {badge && (<div style={{ marginBottom: 12 }}><PillBadge>{badge}</PillBadge></div>)}
            <EditableText
              {...editPropsFor('P3.mainTitle')}
              as="h2"
              defaultStyle={{
                fontSize: 42, fontWeight: 800, color: BRAND.colors.text, margin: 0,
                textAlign: 'center', letterSpacing: '-0.03em', lineHeight: 1.3,
              }}
            >
              {mainTitle}
            </EditableText>
          </div>
        </div>

        {/* 2) 중앙 제품 이미지 (EditableImage + 원형 클립) */}
        <div
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '10px 30px', minHeight: 540,
          }}
        >
          <div style={{
            position: 'relative', width: 560, height: 560,
            pointerEvents: editMode ? 'none' : 'auto',
            zIndex: mainZ,
          }}>
            <div
              style={{
                width: '100%', height: '100%',
                borderRadius: '50%', overflow: 'hidden',
                backgroundColor: '#fff', border: `5px solid ${BRAND.colors.main}`,
                boxShadow: '0 8px 24px rgba(47, 42, 38, 0.08)',
              }}
            >
              <EditableImage
                id={mainImgId}
                src={image}
                aspect="1 / 1"
                radius={0}
                editMode={editMode}
                override={imageOverrides[mainImgId] || {}}
                onChange={(partial) => onImageOverrideChange(mainImgId, partial)}
                availableImages={(allImages || []).filter(Boolean)}
                isActive={editMode ? mainActive : null}
                onActivate={() => layer.activateLayer('main', mainImgId)}
                hasActiveOther={editMode && layer.hasActiveLayer && !mainActive}
                onLayerAction={(action) => layer.handleLayerAction({ kind: 'main', id: mainImgId }, action)}
              />
            </div>
            {/* 포인트 배지 */}
            {badgePoint && (
              <div
                style={{
                  position: 'absolute', right: -40, bottom: -20,
                  backgroundColor: BRAND.colors.accent, color: '#fff',
                  fontWeight: 900, fontSize: 22, padding: '14px 20px',
                  borderRadius: 999, boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                  letterSpacing: '-0.02em', maxWidth: 210, lineHeight: 1.2,
                  textAlign: 'center', wordBreak: 'keep-all', zIndex: 2,
                  pointerEvents: editMode ? 'auto' : 'inherit',
                }}
              >
                <EditableText
                  {...editPropsFor('P3.badgePoint')}
                  as="span"
                  defaultStyle={{ color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: '-0.02em' }}
                >
                  {badgePoint}
                </EditableText>
              </div>
            )}
          </div>
        </div>

        {/* 3) 체크리스트 */}
        <div style={{ padding: '0 40px 40px', flexShrink: 0, pointerEvents: editMode ? 'auto' : 'inherit' }}>
          <div
            style={{
              border: `2px dashed ${BRAND.colors.main}`,
              borderRadius: 16, padding: '20px 24px', backgroundColor: '#fff',
            }}
          >
            {checklist.slice(0, 5).map((item, i, arr) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '11px 6px',
                  borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${BRAND.colors.neutral}`,
                }}
              >
                <CheckIcon size={24} variant={variant + i} />
                <EditableText
                  {...editPropsFor(`P3.checklist.${i}`)}
                  as="div"
                  defaultStyle={{
                    fontSize: 22, fontWeight: 600, color: BRAND.colors.text,
                    lineHeight: 1.4, letterSpacing: '-0.02em',
                    wordBreak: 'keep-all', flex: 1,
                  }}
                >
                  {item}
                </EditableText>
              </div>
            ))}
          </div>
        </div>
      </div>

      {layer.renderFreeImages()}
      {layer.renderOverlay()}
    </PageFrame>
  );
}
