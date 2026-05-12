/**
 * briefDefaults.js — 제품 브리프(brief) 기본값 및 카테고리 정의
 *
 * App.jsx에서 분리: Sidebar/AutoFill/AI 호출 등 여러 곳에서 공유.
 */

export const PRODUCT_TYPES = [
  '청소도구형',
  '수납형',
  '욕실/위생형',
  '주방정리형',
  '소모품형',
  '생활보조형',
  '인테리어소품형',
];

export const DEFAULT_BRIEF = {
  productName: '',
  productType: '',
  strengths: ['', '', ''],
  targetCustomers: ['', '', ''],
  material: '',
  sizeSpec: '',
  photoTypes: '',
  reviews: [
    { nickname: '', date: '', body: '' },
    { nickname: '', date: '', body: '' },
    { nickname: '', date: '', body: '' },
    { nickname: '', date: '', body: '' },
  ],
  differences: ['', '', '', ''],
  // P5: 일반 상품과의 비교 — 유저가 직접 입력
  generalProductName: '',           // 예: "일반 주방선반", "기존 제품"
  generalProductFeatures: ['', '', '', ''], // 각 차별점에 대응하는 "일반 제품은 어떤지"
  usages: ['', '', '', ''],
  usageSteps: ['', '', ''],
  faqs: [
    { q: '', a: '' },
    { q: '', a: '' },
    { q: '', a: '' },
    { q: '', a: '' },
    { q: '', a: '' },
  ],
  hasGeneralProductPhoto: false,
  extraNotes: '',
  // 필수표기사항 (쿠팡 상품 상세페이지 하단에 표시)
  compliance: {
    modelName: '',        // 품명 및 모델명
    sizeWeight: '',       // 크기/무게
    color: '',            // 색상
    material: '',         // 재질
    manufacturer: '',     // 제조자/수입자
    origin: '',           // 제조국
    asContact: '',        // A/S 책임자 및 연락처
  },
  // 톤앤매너
  themeId: 'warmBeige',
  // 전역 폰트 (모든 페이지에 일괄 적용)
  fontId: 'pretendard',
  // P1 강점카드 디자인 설정 (사용자가 직접 조정)
  p1CardSettings: {
    iconVariant: 0,    // 0~5 (0:원형, 1:사각, 2:방패, 3:하트, 4:육각, 5:꽃)
    iconSize: 28,      // 16 ~ 56
    iconColor: '',     // 빈문자열 = 테마색 사용, 그 외 hex 코드
    cardMinHeight: 220, // 140 ~ 320
    cardPaddingY: 18,   // 8 ~ 40 (위쪽)
    cardPaddingYBottom: 20, // 8 ~ 40 (아래쪽)
    cardPaddingX: 10,   // 4 ~ 30
    cardRadius: 18,     // 0 ~ 32
    cardGap: 22,        // 8 ~ 40
  },
};
