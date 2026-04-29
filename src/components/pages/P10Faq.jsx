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
  const editPropsFor = (id) => ({
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });
  const {
    components = { title: '구성품 안내', bullets: [] },
    faq = [],
    // 필수표기사항 — 전자상거래법 기준 7개 항목
    compliance = {},
    // shippingInfo / csInfo / careInfo는 더이상 P10에 표시하지 않음
    // (필수표기사항과 중복 — 2025-04 사용자 요청으로 제거)
  } = copy;

  // 필수표기사항 항목 정의 (표시 순서 + 라벨)
  const complianceRows = [
    { label: '품명 및 모델명',      value: compliance.modelName },
    { label: '크기 / 무게',          value: compliance.sizeWeight },
    { label: '색상',                  value: compliance.color },
    { label: '재질',                  value: compliance.material },
    { label: '제조자 / 수입자',      value: compliance.manufacturer },
    { label: '제조국',                value: compliance.origin },
    { label: 'A/S 책임자 및 연락처', value: compliance.asContact },
  ].map((r) => ({
    ...r,
    // 빈 값은 '상세페이지 참조'로 대체 (안전한 기본값)
    value: r.value?.trim() ? r.value : '상세페이지 참조',
  }));

  const mainImgId = 'P10.componentImage';
  const mainLayers = [{ id: mainImgId, defaultName: '🖼 구성품 사진', defaultZ: 1 }];
  // 🟦 도형의 가장 아래 끝 → 페이지 baseHeight 자동 연장
  const shapesBottom = (shapes || []).reduce(
    (max, s) => Math.max(max, (s.y || 0) + (s.h || 0)),
    0
  );
  const layer = useFreeImageLayer({
    pageKey: 'P10', mainLayers, image: componentImage, allImages, baseHeight: Math.max(2200, shapesBottom + 80),
    editMode, freeImages, imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage,
    shapes,
    onDeleteShape,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onSetLayerName,
    activeLayerId, onSetActiveLayer,
  });
  const mainActive = layer.isLayerActive('main', mainImgId);

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.white} onClearActive={layer.clearActiveLayer}>
    <div style={{ position: 'relative' }}>
      {/* ─────────── 1. 구성품 안내 (강조) ─────────── */}
      <div style={{ padding: '50px 40px 30px' }}>
        <div style={{ textAlign: 'center' }}>
          <EditableText
            {...editPropsFor('P10.components.title')}
            as="h2"
            defaultStyle={{
              fontSize: 40,
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
              fontSize: 20,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            박스 안에 이렇게 들어있어요
          </EditableText>
        </div>

        <div style={{
          marginTop: 26, position: 'relative',
          pointerEvents: 'auto',
          zIndex: imageOverrides[mainImgId]?.zIndex ?? 1,
        }}>
          <EditableImage
            id={mainImgId}
            src={componentImage}
            aspect="16 / 10"
            radius={16}
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
                  fontSize: 23,
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

      <div style={{ padding: '10px 40px' }}>
        <Divider color={BRAND.colors.main} />
      </div>

      {/* ─────────── 2. FAQ 5개 ─────────── */}
      <div style={{ padding: '30px 30px 60px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <SectionTitle size={36}>자주 묻는 질문</SectionTitle>
          <div style={{ marginTop: 10, color: BRAND.colors.neutralText, fontSize: 20, fontWeight: 600 }}>
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
                    fontSize: 25,
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
                    fontSize: 23,
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

      <div style={{ padding: '10px 40px' }}>
        <Divider color={BRAND.colors.main} dashed />
      </div>

      {/* ─────────── 4. 상품 필수표기사항 (전자상거래법) ─────────── */}
      <div style={{ padding: '30px 40px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <SectionTitle size={32}>상품 필수표기사항</SectionTitle>
          <div
            style={{
              marginTop: 8,
              color: BRAND.colors.neutralText,
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: '-0.02em',
            }}
          >
            전자상거래 등에서의 상품정보제공 고시 기준
          </div>
        </div>

        <div
          style={{
            border: `1.5px solid ${BRAND.colors.neutral}`,
            borderRadius: 12,
            overflow: editMode ? 'visible' : 'hidden',
            backgroundColor: '#fff',
          }}
        >
          {complianceRows.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '200px 1fr',
                borderBottom:
                  i === complianceRows.length - 1
                    ? 'none'
                    : `1px solid ${BRAND.colors.neutral}`,
              }}
            >
              <div
                className="p10-compliance-cell"
                style={{
                  // 2026-04-29: 한글 baseline이 셀 박스 중앙보다 아래로 보이는 문제 수정
                  // padding-top을 살짝 줄이고 padding-bottom을 늘려 시각적 중앙 정렬
                  padding: '12px 16px 16px',
                  backgroundColor: BRAND.colors.sub,
                  fontSize: 16,
                  fontWeight: 800,
                  color: BRAND.colors.text,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                {row.label}
              </div>
              <div
                className="p10-compliance-cell"
                style={{
                  // 2026-04-29: 한글 baseline 시각 중앙 정렬 보정
                  padding: '12px 18px 16px',
                  fontSize: 16,
                  fontWeight: 500,
                  color: BRAND.colors.text,
                  lineHeight: 1.2,
                  letterSpacing: '-0.02em',
                  wordBreak: 'keep-all',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                {row.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────── 5. 마감 CTA 영역 ─────────── */}
      {/* 🆕 하단 여백을 margin이 아닌 padding으로 적용 — html2canvas가
            margin을 캡처에서 누락시키는 문제 방지 (마지막 글자 잘림 현상 수정)
            2026-04-29: 사용자 요청 - 50px → 100px 로 늘려 끝 부분이 갑자기 끊기는 느낌 제거 */}
      <div style={{ padding: '0 0 100px' }}>
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
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            opacity: 0.95,
            letterSpacing: '-0.02em',
            lineHeight: 1.5,
            wordBreak: 'keep-all',
          }}
        >
          문의 사항이 있으시면 구매 페이지의 문의하기로 편하게 남겨주세요.
        </div>
      </div>
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
