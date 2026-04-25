import { forwardRef } from 'react';
import P1Hero from './pages/P1Hero.jsx';
import P2Benefits from './pages/P2Benefits.jsx';
import P3Target from './pages/P3Target.jsx';
import P4Reviews from './pages/P4Reviews.jsx';
import P5Compare from './pages/P5Compare.jsx';
import P6Material from './pages/P6Material.jsx';
import P7Lifestyle from './pages/P7Lifestyle.jsx';
import P8Usages from './pages/P8Usages.jsx';
import P9HowTo from './pages/P9HowTo.jsx';
import P10Faq from './pages/P10Faq.jsx';

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
    shapes = [],
    onAddShape = () => {},
    onUpdateShape = () => {},
    onDeleteShape = () => {},
    onChangeLayer = () => {},
    onChangeLayerKind = () => {},
    onReorderLayers = () => {},
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
    shapes,
    onAddShape,
    onUpdateShape,
    onDeleteShape,
    onChangeLayer,
    onChangeLayerKind,
    onReorderLayers,
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

  switch (pageNumber) {
    case 'P1':
      return <div ref={ref}><P1Hero copy={copy} image={pick(PAGE_IMAGE_MAP.P1.start)} allImages={images} variant={variant} {...editProps} /></div>;

    case 'P2':
      return <div ref={ref}><P2Benefits copy={copy} images={imagesFor('P2')} {...editProps} /></div>;

    case 'P3':
      return <div ref={ref}><P3Target copy={copy} image={pick(PAGE_IMAGE_MAP.P3.start)} variant={variant} {...editProps} /></div>;

    case 'P4':
      return <div ref={ref}><P4Reviews copy={copy} images={imagesFor('P4')} {...editProps} /></div>;

    case 'P5':
      return (
        <div ref={ref}>
          <P5Compare
            copy={copy}
            ourImage={pick(PAGE_IMAGE_MAP.P5.start)}
            generalImage={null}
            version={version}
            {...editProps}
          />
        </div>
      );

    case 'P6': {
      const [materialImg, sizeImg] = imagesFor('P6');
      return <div ref={ref}><P6Material copy={copy} materialImage={materialImg} sizeImage={sizeImg} {...editProps} /></div>;
    }

    case 'P7':
      return <div ref={ref}><P7Lifestyle copy={copy} images={imagesFor('P7')} {...editProps} /></div>;

    case 'P8':
      return <div ref={ref}><P8Usages copy={copy} images={imagesFor('P8')} {...editProps} /></div>;

    case 'P9':
      return <div ref={ref}><P9HowTo copy={copy} images={imagesFor('P9')} {...editProps} /></div>;

    case 'P10':
      return <div ref={ref}><P10Faq copy={copy} componentImage={pick(PAGE_IMAGE_MAP.P10.start)} variant={variant} {...editProps} /></div>;

    default:
      return null;
  }
});

export default PageRenderer;
