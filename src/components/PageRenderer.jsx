import { forwardRef, lazy, Suspense } from 'react';

function lazyWithRetry(importer, key) {
  return lazy(async () => {
    try {
      const mod = await importer();
      try { sessionStorage.removeItem(`lazy_retry_${key}`); } catch {}
      return mod;
    } catch (err) {
      const msg = String(err?.message || '');
      const chunkLoadFailed = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg);
      if (chunkLoadFailed) {
        try {
          const retryKey = `lazy_retry_${key}`;
          const alreadyRetried = sessionStorage.getItem(retryKey) === '1';
          if (!alreadyRetried) {
            sessionStorage.setItem(retryKey, '1');
            window.location.reload();
            return new Promise(() => {});
          }
          sessionStorage.removeItem(retryKey);
        } catch {}
      }
      throw err;
    }
  });
}

// 🚀 P1~P10 페이지 컴포넌트 lazy load
//   - 첫 진입 시 P1만 빠르게 로드
//   - 사용자가 다른 페이지 탭 클릭하면 그 페이지만 추가 로드
//   - "전체 미리보기" 모드에서는 모두 동시 로드 (Suspense가 알아서 처리)
const P1Hero      = lazyWithRetry(() => import('./pages/P1Hero.jsx'), 'P1Hero');
const P2Benefits  = lazyWithRetry(() => import('./pages/P2Benefits.jsx'), 'P2Benefits');
const P3Target    = lazyWithRetry(() => import('./pages/P3Target.jsx'), 'P3Target');
const P4Reviews   = lazyWithRetry(() => import('./pages/P4Reviews.jsx'), 'P4Reviews');
const P5Compare   = lazyWithRetry(() => import('./pages/P5Compare.jsx'), 'P5Compare');
const P6Material  = lazyWithRetry(() => import('./pages/P6Material.jsx'), 'P6Material');
const P7Lifestyle = lazyWithRetry(() => import('./pages/P7Lifestyle.jsx'), 'P7Lifestyle');
const P8Usages    = lazyWithRetry(() => import('./pages/P8Usages.jsx'), 'P8Usages');
const P9HowTo     = lazyWithRetry(() => import('./pages/P9HowTo.jsx'), 'P9HowTo');
const P10Faq      = lazyWithRetry(() => import('./pages/P10Faq.jsx'), 'P10Faq');

// 페이지 로딩 fallback (스켈레톤)
function PageFallback({ pageNumber }) {
  return (
    <div style={{
      width: '100%',
      minHeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F7F3EE',
      color: '#6b635c',
      fontSize: 14,
      fontWeight: 'bold',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
        {pageNumber} 로딩 중...
      </div>
    </div>
  );
}

/**
 * 페이지별 사진 자동 분배 — 전체를 순차적으로 할당하고 부족하면 순환.
 *
 * 각 페이지가 필요로 하는 사진 개수:
 *   P1(1) + P2(3) + P3(1) + P4(4) + P5(1) + P6(2) + P7(3) + P8(4) + P9(3) + P10(1) = 23장
 *
 * 누적 시작 오프셋:
 *   P1=0 / P2=1 / P3=4 / P4=5 / P5=9 / P6=10 / P7=12 / P8=15 / P9=19 / P10=22
 *
 * → 사진 23장 이상 업로드하면 전부 다른 사진이 나옴.
 * → 부족하면 순환(% images.length)으로 재사용.
 */
const PAGE_IMAGE_MAP = {
  P1: { start: 0,  count: 1 },   // 메인 히어로 1장
  P2: { start: 1,  count: 3 },   // 강점 3개
  P3: { start: 4,  count: 1 },   // 추천 고객 1장
  P4: { start: 5,  count: 4 },   // 리뷰 4장
  P5: { start: 9,  count: 1 },   // 비교 (우리 제품) 1장
  P6: { start: 10, count: 2 },   // 소재 + 사이즈
  P7: { start: 12, count: 3 },   // 라이프스타일 3장
  P8: { start: 15, count: 4 },   // 활용법 4장
  P9: { start: 19, count: 3 },   // 사용 순서 3단계
  P10:{ start: 22, count: 1 },   // 구성품 1장
};

const PageRenderer = forwardRef(function PageRenderer(
  {
    pageNumber,
    copy,
    images = [],
    version = 'text',
    variant = 0,
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
    freeTexts = [],
    onAddFreeText = () => {},
    onUpdateFreeText = () => {},
    onDeleteFreeText = () => {},
    onDuplicateFreeText = () => {},
    shapes = [],
    onAddShape = () => {},
    onUpdateShape = () => {},
    onDeleteShape = () => {},
    onDuplicateShape = () => {},
    onChangeLayer = () => {},
    onChangeLayerKind = () => {},
    onReorderLayers = () => {},
    onToggleLayerVisibility = () => {},
    layerNames = {},
    onSetLayerName = () => {},
    activeLayerId = null,
    onSetActiveLayer = () => {},
  },
  ref,
) {
  // 공통 편집 props — 각 페이지 컴포넌트가 EditableText/EditableImage를 지원하면 사용
  const editProps = {
    editMode,
    overrides,
    onOverrideChange,
    imageOverrides,
    onImageOverrideChange,
    freeImages,
    onAddFreeImage,
    onAddFreeImageToSlot,
    onUpdateFreeImage,
    onDeleteFreeImage,
    onDuplicateFreeImage,
    freeTexts,
    onAddFreeText,
    onUpdateFreeText,
    onDeleteFreeText,
    onDuplicateFreeText,
    shapes,
    onAddShape,
    onUpdateShape,
    onDeleteShape,
    onDuplicateShape,
    onChangeLayer,
    onChangeLayerKind,
    onReorderLayers,
    onToggleLayerVisibility,
    layerNames,
    onSetLayerName,
    activeLayerId,
    onSetActiveLayer,
    allImages: images, // 모든 페이지의 사진 추가 패널에 전체 갤러리 노출
  };

  // 순환 접근 — 사진이 부족하면 % 로 돌려 재사용
  const pick = (idx) => {
    if (!images || images.length === 0) return undefined;
    return images[idx % images.length];
  };
  // 시작 오프셋에서 count개 가져오기 (부족하면 순환)
  const pickRange = (start, count) => {
    const out = [];
    for (let i = 0; i < count; i++) out.push(pick(start + i));
    return out;
  };
  // 각 페이지용 이미지 배열 헬퍼
  const imagesFor = (pageNum) => {
    const map = PAGE_IMAGE_MAP[pageNum] || { start: 0, count: 1 };
    return pickRange(map.start, map.count);
  };

  // Suspense로 감싸 lazy 로드된 페이지 컴포넌트가 준비될 때까지 fallback 표시
  const fallback = <PageFallback pageNumber={pageNumber} />;

  switch (pageNumber) {
    case 'P1':
      return <div ref={ref}><Suspense fallback={fallback}><P1Hero copy={copy} image={pick(PAGE_IMAGE_MAP.P1.start)} allImages={images} variant={variant} {...editProps} /></Suspense></div>;

    case 'P2':
      return <div ref={ref}><Suspense fallback={fallback}><P2Benefits copy={copy} images={imagesFor('P2')} {...editProps} /></Suspense></div>;

    case 'P3':
      return <div ref={ref}><Suspense fallback={fallback}><P3Target copy={copy} image={pick(PAGE_IMAGE_MAP.P3.start)} variant={variant} {...editProps} /></Suspense></div>;

    case 'P4':
      return <div ref={ref}><Suspense fallback={fallback}><P4Reviews copy={copy} images={imagesFor('P4')} {...editProps} /></Suspense></div>;

    case 'P5':
      return (
        <div ref={ref}>
          <Suspense fallback={fallback}>
            <P5Compare
              copy={copy}
              ourImage={pick(PAGE_IMAGE_MAP.P5.start)}
              generalImage={null}
              version={version}
              {...editProps}
            />
          </Suspense>
        </div>
      );

    case 'P6': {
      const [materialImg, sizeImg] = imagesFor('P6');
      return <div ref={ref}><Suspense fallback={fallback}><P6Material copy={copy} materialImage={materialImg} sizeImage={sizeImg} {...editProps} /></Suspense></div>;
    }

    case 'P7':
      return <div ref={ref}><Suspense fallback={fallback}><P7Lifestyle copy={copy} images={imagesFor('P7')} {...editProps} /></Suspense></div>;

    case 'P8':
      return <div ref={ref}><Suspense fallback={fallback}><P8Usages copy={copy} images={imagesFor('P8')} {...editProps} /></Suspense></div>;

    case 'P9':
      return <div ref={ref}><Suspense fallback={fallback}><P9HowTo copy={copy} images={imagesFor('P9')} {...editProps} /></Suspense></div>;

    case 'P10':
      return <div ref={ref}><Suspense fallback={fallback}><P10Faq copy={copy} componentImage={pick(PAGE_IMAGE_MAP.P10.start)} variant={variant} {...editProps} /></Suspense></div>;

    default:
      return null;
  }
});

export default PageRenderer;
