import { BRAND } from '../../lib/theme.js';
import { PageFrame } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import ShapeLayer from '../ShapeLayer.jsx';
import { useFreeImageLayer } from './freeImageLayer.jsx';

// 🆕 (2026-04-28) 일반 제품 이미지 = 우리 제품 이미지를 자동으로 무채색·블러 처리해 사용
//   사용자가 generalImage 를 직접 지정하지 않은 경우, 우리 제품 사진(ourImage)을
//   그대로 사용하면서 CSS filter 로 grayscale + blur + brightness 보정 → "비슷한 실루엣"
//   효과. 우리 제품 이미지가 바뀌면 자동으로 반영된다.
//
// 🛟 ourImage 도 없는 경우의 fallback: 무채색 그라디언트 빈 박스 (제품 윤곽 없음)
const GENERIC_FALLBACK_BG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e0e0e0"/>
      <stop offset="1" stop-color="#b8b8b8"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#bg)"/>
</svg>
  `.trim());

// P5: 2지선다 비교표 — 글 버전 + 사진 버전
// version: 'text' | 'photo'
export default function P5Compare({
  copy = {},
  ourImage,
  generalImage,
  allImages = [],
  version = 'text',
  editMode = false,
  overrides = {},
  onOverrideChange = () => {},
  imageOverrides = {},
  onImageOverrideChange = () => {},
  freeImages = [],
  onAddFreeImage = () => {},
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
  const editPropsFor = (id) => ({
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  const mainImgId = 'P5.ourImage';
  const generalImgId = 'P5.generalImage';
  // 🆕 (2026-04-28) 일반 제품 이미지도 EditableImage 로 등록 → 사용자가 직접 교체/리사이즈 가능
  const mainLayers = version === 'photo'
    ? [
        { id: mainImgId, defaultName: '🖼 우리 제품 사진', defaultZ: 1 },
        { id: generalImgId, defaultName: '🖼 일반 제품 사진', defaultZ: 2 },
      ]
    : [];
  // 🟦 도형의 가장 아래 끝 → 페이지 baseHeight 자동 연장
  const shapesBottom = (shapes || []).reduce(
    (max, s) => Math.max(max, (s.y || 0) + (s.h || 0)),
    0
  );
  const layer = useFreeImageLayer({
    pageKey: 'P5', mainLayers, image: ourImage, allImages, baseHeight: Math.max(900, shapesBottom + 80),
    editMode, freeImages, imageOverrides, layerNames,
    onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage,
    onAddFreeText, onUpdateFreeText, onDeleteFreeText,
    shapes,
    onDeleteShape,
    onChangeLayer, onChangeLayerKind, onReorderLayers, onToggleLayerVisibility, onSetLayerName,
    freeTexts, textOverrides: overrides,
    activeLayerId, onSetActiveLayer,
  });
  const mainActive = layer.isLayerActive('main', mainImgId);
  const generalActive = layer.isLayerActive('main', generalImgId);
  const {
    headline = '왜 이 제품을 선택해야 할까요?',
    sub = '',
    rows = [],
    ourProductName = '우리 제품',
    generalProductName = '일반 제품',
    ourSubLabel = '',       // 예: "PREMIUM", "OUR BRAND"
    generalSubLabel = '',   // 예: "GENERAL", "기존 방식"
  } = copy;

  // 🆕 일반 제품 이미지 결정 우선순위 (2026-04-28 v2):
  //   1) 사용자가 EditableImage 로 일반 제품 사진을 업로드/교체 → 그대로 사용 (무필터)
  //   2) 미지정 → 우리 제품 사진(ourImage)을 가져와 CSS filter로 강하게 흐리게 처리
  //      → 우리 제품이 바뀌면 일반 제품도 자동으로 비슷한 실루엣으로 따라 바뀜
  //      → 사용자가 더블클릭/우클릭으로 일반 제품 사진을 따로 지정하면 그 사진으로 교체됨
  //   3) 둘 다 없음 → fallback 무채색 그라디언트 박스
  const useOurAsGeneralBase = !generalImage && !!ourImage;
  const resolvedGeneralImage = generalImage || ourImage || GENERIC_FALLBACK_BG;

  // ── 모든 텍스트 셀의 공통 스타일 (비교항목 라벨 + 우리/일반 콘텐츠) ──
  // 요청사항: 좌측 '비교 항목'부터 '병 입구'까지 글씨 크기 동일 + 가운데 정렬
  const UNIFORM_FONT_SIZE = 20;
  const UNIFORM_PADDING = '18px 10px';

  // 🆕 (2026-04-28) 헤더 셀 — label EditableText 로 변경하여 사용자 수정 가능
  // 🆕 (2026-05-09 v6) 사용자 목업 반영:
  //   - 일반 제품 헤더 = 셀 바깥쪽(위)은 페이지 배경색(투명) + 안쪽에 둥근 회색 박스(위쪽 모서리만 둥글게)
  //   - PREMIUM/GENERAL 영문 서브 라벨은 완전 삭제 (사용자 요청)
  //   - 일반 제품 헤더가 90% 정도 작아 보이게 위쪽 공백 50px 확보
  //   - transform 미사용 → PNG 내보내기 안전
  const colHeader = (labelId, label, isOurs) => {
    if (isOurs) {
      // 우리 제품: 솔리드 헤더 + 우측 상단만 둥글게 (사용자 요청)
      return (
        <div
          style={{
            padding: '14px 10px',
            backgroundColor: BRAND.colors.main,
            color: '#fff',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: 72,
            // 🆕 (2026-05-09) 우측 상단 모서리 둥글게 — GENERAL 헤더 둥근 박스와 시각적 균형
            borderRadius: '0 14px 0 0',
            // 🆕 (2026-05-09) 그리드 외곽 border 제거에 따른 상단 외곽선 보강
            borderTop: `1px solid ${BRAND.colors.neutral}`,
            // 🆕 (2026-04-28) 컬럼 사이 세로 구분선
            borderLeft: `1px solid ${BRAND.colors.neutral}`,
            pointerEvents: editMode ? 'auto' : 'inherit',
          }}
        >
          <EditableText
            {...editPropsFor(labelId)}
            as="div"
            defaultStyle={{
              fontWeight: 900,
              // 🆕 (2026-05-09) 사용자 목업(qKGDwmmD) 기준: 22px (원래대로)
              fontSize: 22,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              wordBreak: 'keep-all',
              color: 'inherit',
              textAlign: 'center',
              // 가로 + 세로 정중앙 정렬 명확하게
              width: '100%',
              margin: 0,
            }}
          >
            {label}
          </EditableText>
        </div>
      );
    }
    // 일반 제품: 셀 자체는 투명, 안쪽 박스만 둥근 회색
    // 🆕 (2026-05-09) 박스 하단을 다음 행으로 40px 침범시켜 키만 시각적으로 키움
    //   marginBottom: -40px → 그리드 행 높이는 변경 없음 (욕실청소솔 헤더 영향 없음)
    //   overflow: visible 로 박스가 셀 경계를 넘어 다음 행에 겹쳐 보이게 함
    return (
      <div
        style={{
          padding: '50px 0 0 0',           // 위쪽 공백 → 페이지 배경색 노출
          backgroundColor: 'transparent',
          minHeight: 72,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'stretch',
          overflow: 'visible',
          pointerEvents: editMode ? 'auto' : 'inherit',
        }}
      >
        <div
          style={{
            width: '100%',
            backgroundColor: '#c8c8c8',
            color: '#6b6b6b',
            padding: '14px 10px',
            // 🆕 박스 하단을 다음 행(제품 사진 셀) 위쪽 40px 까지 확장
            //   → 사진 1처럼 일반 청소 도구 박스가 욕실청소솔 헤더보다 더 아래로 내려옴
            //   → 그리드 행 높이 자체에는 영향 없음 (욕실청소솔 헤더 키 변동 없음)
            marginBottom: -40,
            paddingBottom: 14 + 40, // 박스 안쪽 컨텐츠는 셀 경계 안쪽에 정렬되도록
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            // 위쪽 두 모서리만 둥글게
            borderRadius: '14px 14px 0 0',
            opacity: 0.85,
            position: 'relative',
            zIndex: 2, // 다음 행(이미지 셀) 위로 박스가 보이도록
          }}
        >
          <EditableText
            {...editPropsFor(labelId)}
            as="div"
            defaultStyle={{
              fontWeight: 700,
              // 🆕 (2026-05-09) 사용자 목업(qKGDwmmD) 기준: 22px (욕실청소솔과 동일 크기)
              fontSize: 22,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              wordBreak: 'keep-all',
              color: 'inherit',
              textAlign: 'center',
              // 가로 + 세로 정중앙 정렬 명확하게
              width: '100%',
              margin: 0,
            }}
          >
            {label}
          </EditableText>
        </div>
      </div>
    );
  };

  // 좌측 '비교 항목' 라벨 셀 (통일된 스타일)
  // 🆕 (2026-04-28) EditableText 로 변경 — 사용자가 비교 항목 이름 수정 가능
  //   id 가 null 이면 (예: '제품' 사진 행 라벨) 일반 텍스트로 표시
  const renderLabelCell = (text, id = null, isFirstRow = false, isLastRow = false) => (
    <div
      style={{
        padding: UNIFORM_PADDING,
        backgroundColor: BRAND.colors.sub,
        color: BRAND.colors.text,
        borderTop: isFirstRow ? 'none' : `1px solid ${BRAND.colors.neutral}`,
        // 🆕 (2026-05-09) 그리드 외곽 border 제거에 따른 좌측 외곽선 보강
        borderLeft: `1px solid ${BRAND.colors.neutral}`,
        borderBottom: isLastRow ? `1px solid ${BRAND.colors.neutral}` : 'none',
        borderRadius: isLastRow ? '0 0 0 14px' : 0,
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: editMode ? 'auto' : 'inherit',
      }}
    >
      {id ? (
        <EditableText
          {...editPropsFor(id)}
          as="div"
          defaultStyle={{
            fontWeight: 700,
            fontSize: UNIFORM_FONT_SIZE,
            color: BRAND.colors.text,
            wordBreak: 'keep-all',
            textAlign: 'center',
            width: '100%',
          }}
        >
          {text}
        </EditableText>
      ) : (
        <div style={{ fontWeight: 700, fontSize: UNIFORM_FONT_SIZE, wordBreak: 'keep-all' }}>
          {text}
        </div>
      )}
    </div>
  );

  // 우리 제품 / 일반 제품 콘텐츠 셀 — 둘 다 같은 폰트 크기, 가운데 정렬
  // 일반 제품은 무채색 + opacity로만 약화 (크기는 통일)
  // 🆕 (2026-04-28) EditableText 로 변경 — 사용자가 셀 내용 수정 가능
  // 🆕 (2026-05-09 v5) 단순화 — 안쪽 wrapper 박스 제거, 원래 단순 회색 셀로 복귀
  //   행 높이 자동 정렬 유지 (PREMIUM 컬럼과 줄 맞춤). 일반 제품 헤더만 padding-top 으로 내려옴.
  const renderCell = (id, text, isOurs, isLastRow = false) => (
    <div
      style={{
        padding: UNIFORM_PADDING,
        backgroundColor: isOurs ? 'rgba(200,182,166,0.12)' : '#f5f5f5',
        borderBottom: `1px solid ${BRAND.colors.neutral}`,
        // 🆕 (2026-04-28) 컬럼 사이 세로 구분선
        borderLeft: `1px solid ${BRAND.colors.neutral}`,
        // 🆕 (2026-05-09) 우리 제품 셀 마지막 행 우하단 둥근 처리
        //   (일반 제품 셀은 외곽선/둥근 처리 없음 — 단독 둥근 헤더 박스 디자인 유지)
        borderRadius: isLastRow && isOurs ? '0 0 14px 0' : 0,
        textAlign: 'center',
        opacity: isOurs ? 1 : 0.8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: editMode ? 'auto' : 'inherit',
      }}
    >
      <EditableText
        {...editPropsFor(id)}
        as="div"
        defaultStyle={{
          color: isOurs ? BRAND.colors.text : '#9a9a9a',
          fontSize: UNIFORM_FONT_SIZE,
          fontWeight: isOurs ? 700 : 400,
          textAlign: 'center',
          lineHeight: 1.4,
          wordBreak: 'keep-all',
          width: '100%',
        }}
      >
        {text}
      </EditableText>
    </div>
  );

  return (
    <PageFrame height={layer.pageHeight} bg={BRAND.colors.white} onClearActive={layer.clearActiveLayer}>
      <div style={{ position: 'relative', pointerEvents: 'auto' }}>
      <div style={{ padding: '50px 40px 24px', textAlign: 'center', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <EditableText
          {...editPropsFor('P5.headline')}
          as="h2"
          defaultStyle={{
            fontSize: 38,
            fontWeight: 800,
            color: BRAND.colors.text,
            margin: 0,
            textAlign: 'center',
            letterSpacing: '-0.03em',
            lineHeight: 1.3,
          }}
        >
          {headline}
        </EditableText>
        {(sub || editMode) && (
          <div style={{ marginTop: 14 }}>
            <EditableText
              {...editPropsFor('P5.sub')}
              as="p"
              defaultStyle={{
                fontSize: 24,
                fontWeight: 500,
                color: BRAND.colors.text,
                margin: 0,
                textAlign: 'center',
                lineHeight: 1.6,
              }}
              placeholder={editMode ? '(서브 카피)' : ''}
            >
              {sub}
            </EditableText>
          </div>
        )}
      </div>

      <div style={{ padding: '10px 30px 50px', pointerEvents: editMode ? 'auto' : 'inherit' }}>
        <div
          style={{
            // 🆕 (2026-05-09) 그리드 외곽 border/borderRadius 제거
            //   → GENERAL 헤더 위쪽 빈 공간 위로 보이던 잔여 외곽선 완전 제거
            //   → 각 셀이 자체적으로 외곽 테두리/모서리 처리
            display: 'grid',
            gridTemplateColumns: '0.7fr 1fr 0.9fr',
          }}
        >
          {/* 헤더 행 — 동일한 EditableText 시스템으로 좌측 '비교 항목' 텍스트도 수정 가능 (2026-04-28) */}
          {/* 🆕 (2026-05-09) 그리드 외곽 border 제거에 따른 셀별 외곽선 보강 */}
          <div
            style={{
              backgroundColor: '#fff',
              padding: UNIFORM_PADDING,
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderTop: `1px solid ${BRAND.colors.neutral}`,
              borderLeft: `1px solid ${BRAND.colors.neutral}`,
              borderRadius: '14px 0 0 0',
              pointerEvents: editMode ? 'auto' : 'inherit',
            }}
          >
            <EditableText
              {...editPropsFor('P5.compareLabel')}
              as="div"
              defaultStyle={{
                fontWeight: 800,
                fontSize: UNIFORM_FONT_SIZE,
                color: BRAND.colors.text,
                textAlign: 'center',
                width: '100%',
              }}
            >
              비교 항목
            </EditableText>
          </div>
          {colHeader('P5.ourProductName', ourProductName, true)}
          {colHeader('P5.generalProductName', generalProductName, false)}

          {/* 사진 행 (사진 버전에서만) — 일반 제품은 전체적으로 90% 축소 */}
          {version === 'photo' && (
            <>
              {renderLabelCell('제품', 'P5.photoRowLabel')}

              {/* 우리 제품: 정상 크기 (100%) */}
              <div
                style={{
                  padding: 10,
                  borderTop: `1px solid ${BRAND.colors.neutral}`,
                  // 🆕 (2026-04-28) 컬럼 사이 세로 구분선
                  borderLeft: `1px solid ${BRAND.colors.neutral}`,
                  backgroundColor: 'rgba(200,182,166,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 12,
                    overflow: editMode ? 'visible' : 'hidden',
                    backgroundColor: '#fff',
                    boxShadow: '0 2px 8px rgba(200,182,166,0.25)',
                    position: 'relative',
                    pointerEvents: 'auto',
                    zIndex: imageOverrides[mainImgId]?.zIndex ?? 1,
                  }}
                >
                  <EditableImage
                    id={mainImgId}
                    src={ourImage}
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
              </div>

              {/* 일반 제품 이미지 셀
                  🆕 (2026-04-28) EditableImage 로 교체 — 사용자가 일반 제품 사진을
                       자유롭게 업로드/교체/리사이즈/이동할 수 있게 됨.
                  🆕 (2026-05-09 v5) 단순화 — 원래 단순 회색 셀로 복귀
                       (안쪽 wrapper 제거, 행 높이 자동 정렬 유지)
                  🆕 (2026-05-09) 사진 박스 자체를 90% 폭으로 축소 (사용자 요청 1-A)
                       — 우리 제품 대비 약간 작아 보이는 효과 */}
              <div
                style={{
                  padding: 10,
                  borderTop: `1px solid ${BRAND.colors.neutral}`,
                  // 🆕 (2026-04-28) 컬럼 사이 세로 구분선
                  borderLeft: `1px solid ${BRAND.colors.neutral}`,
                  backgroundColor: '#f5f5f5',
                  display: 'flex',
                  // 🆕 (2026-05-09) 사용자 요청 2-A: 사진 하단을 우리 제품 사진 하단과 같은 라인에 정렬
                  //   alignItems: 'center' → 'flex-end' 로 변경하여 사진을 셀 하단에 붙임
                  //   결과: 90% 박스의 위쪽에 회색 여백이 더 생기고 사진 하단 라인은 우리 제품과 동일
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    // 🆕 (2026-05-09) 박스 자체를 90% 폭으로 축소 (사용자 요청 1-A)
                    //   transform: scale 미사용 → html-to-image PNG 내보내기 안전
                    width: '90%',
                    aspectRatio: '1 / 1',
                    borderRadius: 12,
                    overflow: editMode ? 'visible' : 'hidden',
                    backgroundColor: '#fff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    position: 'relative',
                    pointerEvents: 'auto',
                    zIndex: imageOverrides[generalImgId]?.zIndex ?? 1,
                    // 🐛 (2026-04-28 v2) 부모 div 의 filter 제거.
                    //   filter 는 자식 전체(편집 툴바/핸들 포함)에 적용되어 툴바도 흐려졌었음.
                    //   → EditableImage 의 extraFilter prop 으로 이미지 element 에만 적용함.
                  }}
                >
                  <EditableImage
                    id={generalImgId}
                    src={resolvedGeneralImage}
                    aspect="1 / 1"
                    radius={0}
                    editMode={editMode}
                    override={imageOverrides[generalImgId] || {}}
                    onChange={(partial) => onImageOverrideChange(generalImgId, partial)}
                    availableImages={(allImages || []).filter(Boolean)}
                    isActive={editMode ? generalActive : null}
                    onActivate={() => layer.activateLayer('main', generalImgId)}
                    hasActiveOther={editMode && layer.hasActiveLayer && !generalActive}
                    onLayerAction={(action) => layer.handleLayerAction({ kind: 'main', id: generalImgId }, action)}
                    // 🆕 (2026-04-28) 사용자가 일반 제품 사진을 따로 지정하지 않은 경우에만
                    //   이미지에만 grayscale+blur 적용 → 툴바/핸들은 선명하게 유지
                    // 🆕 (2026-04-28 v3) blur 3px → 1px 로 약화 (사용자 요청 — 너무 흐릿했음)
                    // 🆕 (2026-05-09 v4) blur 1px → 8px 로 5배+ 강화 (사용자 요청 — 형태가 알아볼 수 있어서 더 흐릿하게)
                    //   brightness 0.9 → 0.95, contrast 0.9 → 0.7 로 추가 약화하여 형태 식별 더 어렵게
                    extraFilter={useOurAsGeneralBase ? 'grayscale(100%) brightness(0.95) contrast(0.7) blur(8px)' : ''}
                  />
                </div>
              </div>
            </>
          )}

          {/* 비교 데이터 행들 — 레이블/우리/일반 모두 EditableText 로 수정 가능 (2026-04-28) */}
          {/* 🆕 (2026-05-09) 마지막 행에 isLastRow 플래그 전달 → 좌하단/우하단 둥근 처리 */}
          {rows.map((row, i) => {
            const isLastRow = i === rows.length - 1;
            return (
              <div key={i} style={{ display: 'contents' }}>
                {renderLabelCell(row.label, `P5.rows.${i}.label`, false, isLastRow)}

                {/* 우리 제품 셀 — 정상 크기 */}
                {renderCell(`P5.rows.${i}.ours`, row.ours, true, isLastRow)}

                {/* 일반 제품 셀 — renderCell 사용 (단순 회색 셀)
                    🆕 (2026-05-09 v5) 안쪽 wrapper 제거하고 renderCell 로 통일 */}
                {renderCell(`P5.rows.${i}.general`, row.general, false, isLastRow)}
              </div>
            );
          })}
        </div>
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
