// 브랜드 디자인 고정값 — 테마 프리셋 지원
// 시스템 프롬프트 §3 에 정의된 컬러/폰트 규칙과 1:1 대응됩니다.
// 사용자가 톤앤매너를 선택하면 BRAND.colors가 해당 테마로 스왑됩니다.

export const FONT_FAMILY =
  "'NanumSquare','나눔스퀘어','NanumSquareOTF','Pretendard',system-ui,-apple-system,sans-serif";

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
