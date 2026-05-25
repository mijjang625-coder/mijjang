import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img, SectionTitle, Divider, CheckIcon } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// P10: 구성품 안내 + FAQ 5개 + 필수표기사항
// 배송/A.S. 안내 섹션은 필수표기사항과 중복되어 2025-04 사용자 요청으로 제거됨
export default function P10Faq({
  copy = {},
  componentImage,
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
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
    onHide: () => onToggleLayerVisibility('text', id),
  });
  const {
    components = { title: '구성품 안내', bullets: [] },
    faq = [],
    // 필수표기사항 — 전자상거래법 기준 7개 항목
    compliance = {},
    // shippingInfo / csInfo / careInfo는 더이상 P10에 표시하지 않음
    // (필수표기사항과 중복 — 2025-04 사용자 요청으로 제거)
  } = copy;

  // A/S 연락처는 항상 포함되어야 하는 고정 문구
  const REQUIRED_AS_CONTACT_TEXT = '쿠팡고객센터 1577-7011';
  const REQUIRED_AS_CONTACT_REGEX = /쿠팡\s*고객센터\s*1577\s*[-]?\s*7011/;
  const ensureAsContactText = (value) => {
    const text = String(value || '').trim();
    if (!text) return REQUIRED_AS_CONTACT_TEXT;
    if (REQUIRED_AS_CONTACT_REGEX.test(text)) return text;
    return `${REQUIRED_AS_CONTACT_TEXT} / ${text}`;
  };

  const normalizeAsContactOverride = (override) => {
    if (!override || typeof override !== 'object') return override || {};
    const next = { ...override };

    if (typeof next.text === 'string') {
      next.text = ensureAsContactText(next.text);
    }

    if (typeof next.html === 'string') {
      const plain = next.html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .trim();
      if (!REQUIRED_AS_CONTACT_REGEX.test(plain)) {
        next.html = `${REQUIRED_AS_CONTACT_TEXT} / ${next.html}`;
      }
    }

    return next;
  };

  const editValuePropsFor = (key) => {
    const id = `P10.compliance.value.${key}`;
    const base = editPropsFor(id);
    if (key !== 'asContact') return base;
    return {
      ...base,
      override: normalizeAsContactOverride(base.override),
    };
  };

  // 필수표기사항 항목 정의 (표시 순서 + 라벨 + override 식별 key)
  // key 는 EditableText id 에 사용 — 'P10.compliance.label.{key}' / 'P10.compliance.value.{key}'
  const complianceRows = [
    { key: 'modelName',     label: '품명 및 모델명',      value: compliance.modelName },
    { key: 'sizeWeight',    label: '크기 / 무게',          value: compliance.sizeWeight },
    { key: 'color',         label: '색상',                  value: compliance.color },
    { key: 'material',      label: '재질',                  value: compliance.material },
    { key: 'manufacturer',  label: '제조자 / 수입자',      value: compliance.manufacturer },
    { key: 'origin',        label: '제조국',                value: compliance.origin },
    { key: 'asContact',     label: 'A/S 책임자 및 연락처', value: compliance.asContact },
  ].map((r) => ({
    ...r,
    // A/S 연락처는 항상 고정 문구 포함, 나머지는 빈 값일 때 '상세페이지 참조'
    value: r.key === 'asContact'
      ? ensureAsContactText(r.value)
      : (r.value?.trim() ? r.value : '상세페이지 참조'),
  }));

  const mainImgId = 'P10.componentImage';
  const mainLayers = [{ id: mainImgId, defaultName: '🖼 구성품 사진', defaultZ: 80 }];
  // 🟦 도형의 가장 아래 끝 → 페이지 baseHeight 자동 연장
  const shapesBottom = (shapes || []).reduce(
    (max, s) => Math.max(max, (s.y || 0) + (s.h || 0)),
    0
  );
  const layer = useFreeImageLayer({
    pageKey: 'P10', mainLayers, image: componentImage, allImages, baseHeight: Math.max(2200, shapesBottom + 80),
    editMode, freeImages, imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage, onDuplicateFreeImage,
    onAddFreeText, onUpdateFreeText, onDeleteFreeText, onDuplicateFreeText,
    shapes,
    onDeleteShape, onDuplicateShape,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onToggleLayerVisibility, onSetLayerName,
    freeTexts, textOverrides: overrides,
    activeLayerId, onSetActiveLayer,
  });
  const mainActive = layer.isLayerActive('main', mainImgId);

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.white} onClearActive={layer.clearActiveLayer}>
    <div style={{ position: 'relative', zIndex: 30, pointerEvents: 'none' }}>
      {/* ─────────── 1. 구성품 안내 (강조) ─────────── */}
      <div style={{ padding: '50px 40px 30px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <div style={{ textAlign: 'center' }}>
          <EditableText
            {...editPropsFor('P10.components.title')}
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
            {components.title || '구성품 안내'}
          </EditableText>
          <EditableText
            {...editPropsFor('P10.components.subText')}
            as="div"
            defaultStyle={{
              marginTop: 12,
              color: BRAND.colors.neutralText,
              fontSize: 22,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            박스 안에 이렇게 들어있어요
          </EditableText>
        </div>

        <div style={{
          marginTop: 26, position: 'relative',
          pointerEvents: editMode ? 'auto' : 'none',
        }}>
          <EditableImage
            id={mainImgId}
            src={componentImage}
            aspect="16 / 10"
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

        {/* 구성품 체크리스트 — 🆕 모든 항목을 동일한 variant로 통일 (사용자 요청 2026-04-28) */}
        <div
          style={{
            marginTop: 24,
            backgroundColor: BRAND.colors.sub,
            borderRadius: 16,
            padding: '22px 24px',
          }}
        >
          {(components.bullets || []).slice(0, 4).map((b, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '10px 4px',
                borderBottom:
                  i === Math.min((components.bullets || []).length, 4) - 1
                    ? 'none'
                    : `1px solid ${BRAND.colors.neutral}`,
              }}
            >
              <CheckIcon size={26} variant={variant} />
              <EditableText
                {...editPropsFor(`P10.components.bullets.${i}`)}
                as="span"
                defaultStyle={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: BRAND.colors.text,
                  letterSpacing: '-0.02em',
                  wordBreak: 'keep-all',
                }}
              >
                {b}
              </EditableText>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 40px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <Divider color={BRAND.colors.main} />
      </div>

      {/* ─────────── 2. FAQ 5개 ─────────── */}
      <div style={{ padding: '30px 30px 60px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <SectionTitle size={30}>자주 묻는 질문</SectionTitle>
          <div style={{ marginTop: 10, color: BRAND.colors.neutralText, fontSize: 22, fontWeight: 600 }}>
            구매 전 궁금증을 모았어요
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {faq.slice(0, 5).map((f, i) => (
            <div
              key={i}
              style={{
                backgroundColor: BRAND.colors.sub,
                borderRadius: 16,
                padding: '22px 22px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: BRAND.colors.main,
                    lineHeight: 1,
                  }}
                >
                  Q.
                </span>
                <EditableText
                  {...editPropsFor(`P10.faq.${i}.q`)}
                  as="span"
                  defaultStyle={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: BRAND.colors.text,
                    lineHeight: 1.4,
                  }}
                >
                  {f.q}
                </EditableText>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 900,
                    color: BRAND.colors.text,
                    lineHeight: 1,
                  }}
                >
                  A.
                </span>
                <EditableText
                  {...editPropsFor(`P10.faq.${i}.a`)}
                  as="p"
                  defaultStyle={{
                    fontSize: 24,
                    fontWeight: 500,
                    color: BRAND.colors.text,
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  {f.a}
                </EditableText>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 40px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <Divider color={BRAND.colors.main} dashed />
      </div>

      {/* ─────────── 4. 상품 필수표기사항 (전자상거래법) ─────────── */}
      <div style={{ padding: '30px 40px 20px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <EditableText
            {...editPropsFor('P10.compliance.title')}
            as="h2"
            defaultStyle={{
              fontSize: 30,
              fontWeight: 900,
              color: BRAND.colors.main,
              textAlign: 'center',
              lineHeight: 1.2,
              letterSpacing: '-0.035em',
              margin: 0,
              wordBreak: 'keep-all',
            }}
          >
            상품 필수표기사항
          </EditableText>
          <EditableText
            {...editPropsFor('P10.compliance.subTitle')}
            as="div"
            defaultStyle={{
              marginTop: 8,
              color: BRAND.colors.neutralText,
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              textAlign: 'center',
            }}
          >
            전자상거래 등에서의 상품정보제공 고시 기준
          </EditableText>
        </div>

        <div
          style={{
            border: `1.5px solid ${BRAND.colors.neutral}`,
            borderRadius: 12,
            overflow: editMode ? 'visible' : 'hidden',
            backgroundColor: '#fff',
          }}
        >
          {complianceRows.map((row, i) => {
            const isFirst = i === 0;
            const isLast = i === complianceRows.length - 1;
            return (
            <div
              key={row.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '200px 1fr',
                borderBottom: isLast
                  ? 'none'
                  : `1px solid ${BRAND.colors.neutral}`,
              }}
            >
              <div
                style={{
                  padding: '14px 16px',
                  backgroundColor: BRAND.colors.sub,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  // 좌상/좌하 모서리 둥글게 — 외곽 컨테이너의 borderRadius:12 와 동일
                  // (편집모드에서 overflow:visible 일 때도 회색이 직각으로 튀어나오지 않게)
                  borderTopLeftRadius: isFirst ? 12 : 0,
                  borderBottomLeftRadius: isLast ? 12 : 0,
                }}
              >
                <EditableText
                  {...editPropsFor(`P10.compliance.label.${row.key}`)}
                  as="span"
                  defaultStyle={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: BRAND.colors.text,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.4,
                    textAlign: 'center',
                  }}
                >
                  {row.label}
                </EditableText>
              </div>
              <div
                style={{
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <EditableText
                  {...editValuePropsFor(row.key)}
                  as="span"
                  defaultStyle={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: BRAND.colors.text,
                    lineHeight: 1.4,
                    letterSpacing: '-0.02em',
                    wordBreak: 'keep-all',
                    textAlign: 'center',
                  }}
                >
                  {row.value}
                </EditableText>
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* ─────────── 5. 마감 CTA 영역 ─────────── */}
      {/* 하단 여백 — 페이지 끝 부분 자연스러운 마무리 */}
      <div style={{ padding: '0 0 60px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
      <div
        style={{
          margin: '20px 40px 0',
          backgroundColor: BRAND.colors.main,
          borderRadius: 18,
          padding: '30px 28px',
          textAlign: 'center',
          color: '#fff',
        }}
      >
        <EditableText
          {...editPropsFor('P10.ctaTitle')}
          as="div"
          defaultStyle={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: '-0.03em',
            marginBottom: 8,
            color: '#fff',
            textAlign: 'center',
          }}
        >
          지금 장바구니에 담아보세요
        </EditableText>
        <EditableText
          {...editPropsFor('P10.ctaSubText')}
          as="div"
          defaultStyle={{
            fontSize: 18,
            fontWeight: 500,
            opacity: 0.95,
            letterSpacing: '-0.02em',
            lineHeight: 1.5,
            wordBreak: 'keep-all',
            color: '#fff',
            textAlign: 'center',
          }}
        >
          문의 사항이 있으시면 구매 페이지의 문의하기로 편하게 남겨주세요.
        </EditableText>
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
