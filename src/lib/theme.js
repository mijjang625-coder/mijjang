// 브랜드 디자인 고정값 — 테마 프리셋 지원
// 시스템 프롬프트 §3 에 정의된 컬러/폰트 규칙과 1:1 대응됩니다.
// 사용자가 톤앤매너를 선택하면 BRAND.colors가 해당 테마로 스왑됩니다.

export const FONT_FAMILY =
  "'Pretendard Variable','Pretendard','NanumSquare','나눔스퀘어','NanumSquareOTF',system-ui,-apple-system,sans-serif";

// ─────────── 폰트 프리셋 5종 (무료 상업용 한글 폰트) ───────────
// 사용자가 섹션 1에서 선택하면 전체 P1~P10에 일괄 적용됨.
// 모두 CDN(Google Fonts / jsdelivr)에서 로드되며 상업적 사용이 가능합니다.
export const FONT_PRESETS = {
  pretendard: {
    id: 'pretendard',
    name: 'Pretendard (기본)',
    description: '모던하고 깔끔한 전방위 고딕 · 가독성 최고',
    family: "'Pretendard Variable','Pretendard',system-ui,-apple-system,sans-serif",
    sample: '프리텐다드 AaBb 123',
  },
  nanumGothic: {
    id: 'nanumGothic',
    name: '나눔고딕',
    description: '전통적이고 친숙한 한국 대표 고딕',
    family: "'Nanum Gothic','나눔고딕',sans-serif",
    sample: '나눔고딕 AaBb 123',
  },
  notoSansKR: {
    id: 'notoSansKR',
    name: 'Noto Sans KR',
    description: '구글 공식 · 다양한 굵기 지원 · 안정적',
    family: "'Noto Sans KR',sans-serif",
    sample: '노토 산스 AaBb 123',
  },
  jua: {
    id: 'jua',
    name: '배달의민족 주아',
    description: '둥글고 귀여운 느낌 · 유쾌한 생활용품',
    family: "'Jua',sans-serif",
    sample: '주아 AaBb 123',
  },
  gaegu: {
    id: 'gaegu',
    name: '개구쟁이',
    description: '손글씨 느낌 · 감성 · 수공예 · 선물',
    family: "'Gaegu',cursive",
    sample: '개구쟁이 AaBb 123',
  },
  gowunDodum: {
    id: 'gowunDodum',
    name: '고운 도둠',
    description: '세련되고 도톰한 모던 세리프',
    family: "'Gowun Dodum',serif",
    sample: '고운 도둠 AaBb 123',
  },
};

// 톤앤매너 프리셋 — 생활/인테리어/감성 상품에 자주 쓰이는 조합
export const THEME_PRESETS = {
  warmBeige: {
    id: 'warmBeige',
    name: '웜 베이지 (기본)',
    description: '차분하고 고급스러운 생활용품 · 인테리어',
    swatch: ['#C8B6A6', '#F7F3EE', '#2F2A26', '#E87A2B'],
    colors: {
      main: '#C8B6A6',
      sub: '#F7F3EE',
      text: '#2F2A26',
      accent: '#E87A2B',
      white: '#FFFFFF',
      neutral: '#E8E5E1',
      neutralText: '#8A8680',
    },
  },
  softSage: {
    id: 'softSage',
    name: '세이지 그린',
    description: '자연 친화 · 친환경 · 위생 · 주방용품',
    swatch: ['#A3B899', '#F1F4EC', '#2D332A', '#E8A04A'],
    colors: {
      main: '#A3B899',
      sub: '#F1F4EC',
      text: '#2D332A',
      accent: '#E8A04A',
      white: '#FFFFFF',
      neutral: '#E2E6DE',
      neutralText: '#7D8277',
    },
  },
  modernMono: {
    id: 'modernMono',
    name: '모던 모노크롬',
    description: '미니멀 · 도시적 · 트렌디한 인테리어 소품',
    swatch: ['#3A3A3A', '#F4F4F4', '#1A1A1A', '#FF6B3D'],
    colors: {
      main: '#3A3A3A',
      sub: '#F4F4F4',
      text: '#1A1A1A',
      accent: '#FF6B3D',
      white: '#FFFFFF',
      neutral: '#E5E5E5',
      neutralText: '#888888',
    },
  },
  softPink: {
    id: 'softPink',
    name: '소프트 핑크',
    description: '여성 · 뷰티 · 감성 · 선물용',
    swatch: ['#E8B4B8', '#FCF3F2', '#3A2A2E', '#D4687A'],
    colors: {
      main: '#E8B4B8',
      sub: '#FCF3F2',
      text: '#3A2A2E',
      accent: '#D4687A',
      white: '#FFFFFF',
      neutral: '#EFE0DF',
      neutralText: '#9B8184',
    },
  },
  oceanBlue: {
    id: 'oceanBlue',
    name: '오션 블루',
    description: '청결 · 위생 · 청량감 · 여름 · 욕실용품',
    swatch: ['#7AA5C4', '#EEF4F8', '#1E2E3E', '#F4A04E'],
    colors: {
      main: '#7AA5C4',
      sub: '#EEF4F8',
      text: '#1E2E3E',
      accent: '#F4A04E',
      white: '#FFFFFF',
      neutral: '#DDE6EC',
      neutralText: '#6E8194',
    },
  },
  deepNavy: {
    id: 'deepNavy',
    name: '딥 네이비',
    description: '프리미엄 · 남성적 · 전자제품 · 오피스',
    swatch: ['#2C3E5C', '#EEF1F6', '#0F1825', '#D4A04E'],
    colors: {
      main: '#2C3E5C',
      sub: '#EEF1F6',
      text: '#0F1825',
      accent: '#D4A04E',
      white: '#FFFFFF',
      neutral: '#DCE2EB',
      neutralText: '#6B7890',
    },
  },
};

// 카테고리별 강한 시각 프리셋
// - 사용자가 productType 을 선택하면 theme/font/P1 카드 스타일을 자동 동기화하여
//   카테고리별로 "보자마자 다른" 분위기를 제공합니다.
export const CATEGORY_VISUAL_PRESETS = {
  '청소도구형': {
    themeId: 'oceanBlue',
    fontId: 'nanumGothic',
    p1CardSettings: { iconVariant: 1, cardRadius: 10, cardGap: 14, cardMinHeight: 205 },
    previewSkin: {
      surface: '#EAF3FA',
      shell: '#0F3C5C',
      shellInner: '#FFFFFF',
      labelBg: '#0F3C5C',
      labelText: '#FFFFFF',
    },
  },
  '수납형': {
    themeId: 'modernMono',
    fontId: 'pretendard',
    p1CardSettings: { iconVariant: 2, cardRadius: 8, cardGap: 12, cardMinHeight: 200 },
    previewSkin: {
      surface: '#ECEFF2',
      shell: '#20242A',
      shellInner: '#FFFFFF',
      labelBg: '#20242A',
      labelText: '#FFFFFF',
    },
  },
  '욕실/위생형': {
    themeId: 'oceanBlue',
    fontId: 'notoSansKR',
    p1CardSettings: { iconVariant: 0, cardRadius: 24, cardGap: 18, cardMinHeight: 220 },
    previewSkin: {
      surface: '#E7F6FF',
      shell: '#0A4F77',
      shellInner: '#F8FDFF',
      labelBg: '#0A4F77',
      labelText: '#FFFFFF',
    },
  },
  '주방정리형': {
    themeId: 'softSage',
    fontId: 'gowunDodum',
    p1CardSettings: { iconVariant: 4, cardRadius: 16, cardGap: 16, cardMinHeight: 214 },
    previewSkin: {
      surface: '#EEF6EA',
      shell: '#37513C',
      shellInner: '#FFFFFF',
      labelBg: '#37513C',
      labelText: '#FFFFFF',
    },
  },
  '소모품형': {
    themeId: 'deepNavy',
    fontId: 'notoSansKR',
    p1CardSettings: { iconVariant: 3, cardRadius: 6, cardGap: 12, cardMinHeight: 196 },
    previewSkin: {
      surface: '#EEF2F8',
      shell: '#1A2940',
      shellInner: '#FFFFFF',
      labelBg: '#1A2940',
      labelText: '#FFFFFF',
    },
  },
  '생활보조형': {
    themeId: 'warmBeige',
    fontId: 'nanumGothic',
    p1CardSettings: { iconVariant: 5, cardRadius: 22, cardGap: 20, cardMinHeight: 226 },
    previewSkin: {
      surface: '#F8F1E8',
      shell: '#6B4F3C',
      shellInner: '#FFFDF8',
      labelBg: '#6B4F3C',
      labelText: '#FFFFFF',
    },
  },
  '인테리어소품형': {
    themeId: 'softPink',
    fontId: 'gaegu',
    p1CardSettings: { iconVariant: 5, cardRadius: 28, cardGap: 22, cardMinHeight: 232 },
    previewSkin: {
      surface: '#FDF0F4',
      shell: '#6F2F48',
      shellInner: '#FFFFFF',
      labelBg: '#6F2F48',
      labelText: '#FFFFFF',
    },
  },
};

export function getCategoryVisualPreset(productType) {
  return CATEGORY_VISUAL_PRESETS[productType] || null;
}

// 기본 테마 (호환용)
export const BRAND = {
  colors: THEME_PRESETS.warmBeige.colors,
  fontFamily: FONT_FAMILY,
};

// 선택된 테마로 BRAND.colors 스왑
export function applyTheme(themeId) {
  const preset = THEME_PRESETS[themeId] || THEME_PRESETS.warmBeige;
  BRAND.colors = preset.colors;
  return preset;
}

// 선택된 폰트로 BRAND.fontFamily 스왑 + document에 CSS 변수 적용
// (전체 페이지 일괄 변경 — Shared.jsx 등이 var(--app-font)를 사용)
export function applyFont(fontId) {
  const preset = FONT_PRESETS[fontId] || FONT_PRESETS.pretendard;
  BRAND.fontFamily = preset.family;
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--app-font', preset.family);
  }
  return preset;
}
