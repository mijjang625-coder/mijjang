import { useEffect, useRef, useState, useCallback } from 'react';
import PageRenderer from './components/PageRenderer.jsx';
import {
  generateCoupangPage,
  validateCommonBrief,
  validatePageRequirements,
  extractProductInfoFromUrl,
  extractProductInfoFromText,
  extractRecommendedKeywords,
  autoFillBrief,
} from './lib/openai.js';
import {
  downloadAsImage, downloadAsHtml,
  downloadAllAsSinglePng, downloadAllAsSeparatePngs,
  downloadAllAsHtml,
} from './lib/exporters.js';
import AISynthesisFloatingButton from './components/AISynthesisFloatingButton.jsx';
import InfoCard from './components/ui/InfoCard.jsx';
import ScaledHeightWrap from './components/ui/ScaledHeightWrap.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import OnboardingTour from './components/onboarding/OnboardingTour.jsx';
import { DEFAULT_BRIEF } from './lib/briefDefaults.js';
import { THEME_PRESETS, applyTheme, applyFont } from './lib/theme.js';
import {
  saveProject,
  loadProject,
  clearProject,
  downloadProjectJSON,
  readProjectJSONFromFile,
  getLastSaved,
  debounce,
} from './lib/storage.js';
import {
  costFromUsage,
  recordCost,
  getCostSummary,
  formatKRW,
  resetSession,
  getSessionStart,
} from './lib/costTracker.js';
import { useUndoableHistory, useUndoRedoKeyboard } from './hooks/useUndoableHistory.js';

const PAGE_LIST = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];

const PAGE_TITLES = {
  P1: 'P1 — 메인 히어로 + 강점 카드',
  P2: 'P2 — 베네핏 심화 설명',
  P3: 'P3 — 이런 분들께 추천드려요',
  P4: 'P4 — 리뷰 4개',
  P5: 'P5 — 2지선다 비교표',
  P6: 'P6 — 소재 & 사이즈 실증',
  P7: 'P7 — 감성 라이프스타일',
  P8: 'P8 — 다양한 활용법',
  P9: 'P9 — 사용법',
  P10: 'P10 — 구성품 안내 + FAQ',
};

// PRODUCT_TYPES, DEFAULT_BRIEF는 src/lib/briefDefaults.js로 분리 (Sidebar에서도 import)

export default function App() {
  // API 설정
  const [apiKey, setApiKey] = useState('');
  const [falApiKey, setFalApiKey] = useState(''); // fal.ai (nano-banana-2/pro 합성용)
  const [model, setModel] = useState('gpt-4o-mini');

  // 🆕 리뷰 분석 결과 (CompetitorAnalyzer 갭 매칭용)
  const [reviewInsights, setReviewInsights] = useState(null);

  // 브리프 + 이미지
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [images, setImages] = useState([]); // data URLs

  // 제작 결과
  // pages[pageNumber] = { copy, designNotes, confirmMessage, needsMoreInfo, missingItems, usedPhotos }
  const [pages, setPages] = useState({});
  const [currentPage, setCurrentPage] = useState('P1');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [p5Version, setP5Version] = useState('text');
  // (pageVariants는 아래에서 한 번만 선언)

  // 💰 비용 추적 — recordCost 호출 시 +1 → 위젯 리렌더 트리거
  const [costBumpKey, setCostBumpKey] = useState(0);
  const [sessionStartMs] = useState(() => getSessionStart());
  // 메모이즈 안 함: costBumpKey 바뀔 때마다 다시 합산
  const costSummary = (() => {
    void costBumpKey; // dep 주석
    return getCostSummary({ sinceMs: sessionStartMs });
  })();

  // ⏱ 페이지 생성 진행 상태 (예상 시간 표시용)
  // 페이지별 평균 소요 시간 (초) — 실측 기반 보수치
  const PAGE_AVG_SECONDS = {
    P1: 18, P2: 22, P3: 16, P4: 28, P5: 24,
    P6: 18, P7: 22, P8: 26, P9: 22, P10: 32,
  };
  // generationProgress: { pageNumber, startedAt, avgSec, isRevision } | null
  const [generationProgress, setGenerationProgress] = useState(null);
  const [progressTick, setProgressTick] = useState(0); // 1초마다 +1
  useEffect(() => {
    if (!generationProgress) return;
    const id = setInterval(() => setProgressTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [generationProgress]);

  // 참조 URL (1688/쿠팡/네이버 등) - AI 자동 채우기
  const [referenceUrl, setReferenceUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState(null); // { filledFields: [], source: '' }
  const [extractMode, setExtractMode] = useState('url'); // 'url' | 'paste'
  const [pastedText, setPastedText] = useState('');
  const [userNotes, setUserNotes] = useState(''); // 사용자가 직접 작성한 메모 (1688 내용보다 우선)
  const [ocrImages, setOcrImages] = useState([]); // OCR용 이미지 (1688 다운받은 이미지, base64 dataURL)
  const [showPasteHint, setShowPasteHint] = useState(false); // Captcha 감지 시 true
  // 추천 검색어 20개 추출
  const [keywords, setKeywords] = useState([]); // [{rank, keyword, type}]
  const [isExtractingKeywords, setIsExtractingKeywords] = useState(false);

  // 수정 요청 채팅창
  const [feedbackInput, setFeedbackInput] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [revisionHistory, setRevisionHistory] = useState({}); // { P1: [{ feedback, at }, ...] }
  // 🆕 (2026-04-28) 채팅창 접기/펼치기 — 기본 접힘
  const [feedbackExpanded, setFeedbackExpanded] = useState(false);

  // AI 자동 채움
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillMessage, setAutoFillMessage] = useState('');

  // 페이지 variant — "다시 생성"할 때마다 +1씩 증가해서 체크 아이콘/레이아웃 변화를 유도
  // { P1: 0, P2: 0, ... } (초기 생성은 0, 다시 생성마다 +1)
  const [pageVariants, setPageVariants] = useState({});

  // 인라인 편집 모드 — 미리보기 위에서 더블클릭으로 텍스트 직접 수정
  const [editMode, setEditMode] = useState(false);
  // 📱 미리보기 디바이스 모드 — 'pc'(780px) | 'mobile'(360px ≈ 0.46배 축소) | 'split'(둘 다)
  // localStorage 에 저장하여 새로고침 후에도 유지
  const [previewMode, setPreviewMode] = useState(() => {
    try { return localStorage.getItem('previewMode') || 'pc'; } catch { return 'pc'; }
  });
  useEffect(() => {
    try { localStorage.setItem('previewMode', previewMode); } catch {}
  }, [previewMode]);

  // 🎓 온보딩 튜토리얼 — 첫 방문 시 1회 자동 표시 (이후엔 ❓ 헬프 버튼으로 재실행)
  // -1 = Welcome 모달부터, 0~4 = 스포트라이트 단계부터
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStartStep, setOnboardingStartStep] = useState(-1);
  useEffect(() => {
    try {
      const seen = localStorage.getItem('hasSeenOnboarding');
      if (!seen) {
        // 살짝 지연 후 열어 화면이 그려진 다음에 등장
        setTimeout(() => setOnboardingOpen(true), 500);
      }
    } catch {}
  }, []);
  const handleCloseOnboarding = () => {
    setOnboardingOpen(false);
    try { localStorage.setItem('hasSeenOnboarding', '1'); } catch {}
  };
  const handleOpenOnboarding = (fromStart = true) => {
    setOnboardingStartStep(fromStart ? -1 : 0);
    setOnboardingOpen(true);
  };

  // 페이지별 텍스트 오버라이드
  // { P1: { "mainHeadline": { text, style, offset }, "subHeadline": {...}, ... } }
  const [textOverrides, setTextOverrides] = useState({});
  // 페이지별 이미지 오버라이드
  // { P1: { "heroImage": { scale }, ... } }
  const [imageOverrides, setImageOverrides] = useState({});

  // 페이지별 자유 배치 이미지 (사용자가 추가한 사진들)
  // { P1: [{ id, src, x, y, w, h, crop, zIndex, slot? }, ...] }
  // slot: 'top' | 'between-0-1' | 'between-1-2' | ... | 'bottom' | null
  //   slot != null  → 인라인 끼워넣기 (본문 콘텐츠가 그만큼 아래로 밀려남)
  //   slot == null  → 자유 위치 (기존 동작, 자유사진끼리 자유롭게 배치/겹침)
  const [freeImages, setFreeImages] = useState({});

  // 📝 페이지별 자유 글박스 (자유 위치 — position: absolute)
  // { P1: [{ id, x, y, width, height, html, text, style, zIndex }, ...] }
  // - "📝 글박스 추가" 버튼으로 추가됨
  // - 페이지 normal flow 에 영향 없음 — 크기를 늘려도 사진/다른 요소가 밀리지 않음
  const [freeTexts, setFreeTexts] = useState({});

  // 🟦 페이지별 도형 (사각형, 원, 선, 화살표, 하이라이트)
  // { P1: [{ id, type, x, y, w, h, stroke, strokeWidth, fill, opacity, zIndex }, ...] }
  // type: 'rect' | 'circle' | 'line' | 'arrow' | 'highlight'
  const [shapes, setShapes] = useState({});

  // 페이지별 레이어 사용자 지정 이름  { P1: { 'free_xxx': '메인꽃병', 'P1.heroImage': '메인사진' } }
  const [layerNames, setLayerNames] = useState({});

  // 페이지별 활성 레이어 ID — 클릭 관통 제어를 위해 한 번에 한 레이어만 인터랙티브
  // null = 비활성 (편집모드 OFF 또는 아무것도 선택 안 됨)
  const [activeLayerId, setActiveLayerId] = useState(null);

  // 편집 모드가 꺼지거나 페이지 전환 시 활성 레이어 해제
  useEffect(() => {
    setActiveLayerId(null);
  }, [editMode, currentPage]);

  // 🆕 텍스트(EditableText/FreeText) 가 활성화 됐다는 broadcast 를 받으면
  //   이미지/도형의 activeLayerId 도 함께 해제 → 사진 옵션바 자동으로 닫힘
  useEffect(() => {
    const handler = (e) => {
      const id = e?.detail?.id || '';
      // 텍스트가 활성화된 경우에만 레이어 활성 상태 해제 (이미지끼리는 기존 시스템이 처리)
      if (id.startsWith('text:') || id.startsWith('free-text:')) {
        setActiveLayerId(null);
      }
    };
    window.addEventListener('editor:select', handler);
    return () => window.removeEventListener('editor:select', handler);
  }, []);

  // ─── 🔄 Undo/Redo 히스토리 ───────────────────────────
  // 6개 편집 가능한 상태를 묶어서 한 번에 undo/redo
  const undoHistory = useUndoableHistory({
    pages: {},
    textOverrides: {},
    imageOverrides: {},
    freeImages: {},
    freeTexts: {},
    shapes: {},
    layerNames: {},
  });

  // setter들을 history에 등록 (한 번만)
  useEffect(() => {
    undoHistory.registerSetters({
      pages: setPages,
      textOverrides: setTextOverrides,
      imageOverrides: setImageOverrides,
      freeImages: setFreeImages,
      freeTexts: setFreeTexts,
      shapes: setShapes,
      layerNames: setLayerNames,
    });
  }, [undoHistory]);

  // 현재 상태 스냅샷 헬퍼 — snapshot 호출 시 사용
  const getCurrentSnapshot = useCallback(() => ({
    pages,
    textOverrides,
    imageOverrides,
    freeImages,
    freeTexts,
    shapes,
    layerNames,
  }), [pages, textOverrides, imageOverrides, freeImages, freeTexts, shapes, layerNames]);

  // 키보드 단축키 등록 (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
  useUndoRedoKeyboard(undoHistory.undo, undoHistory.redo);

  // 편집 액션 직전에 호출 — 변경 후 자동으로 그 상태가 다음 history 항목이 됨
  // pattern: pushHistory('라벨'); 그 다음 setState(...)
  const pushHistory = useCallback((label) => {
    undoHistory.snapshot(getCurrentSnapshot(), label);
  }, [undoHistory, getCurrentSnapshot]);

  // 🔄 연속 동작용 debounce snapshot
  // 같은 키(예: 'P1.heroImage.move')로 연속 호출되면 첫 번째만 스냅샷 (드래그 한 묶음)
  // 다른 키가 오거나 800ms 후에는 새 스냅샷 가능
  const lastActionRef = useRef({ key: null, timestamp: 0 });
  const pushHistoryDebounced = useCallback((key, label) => {
    const now = Date.now();
    const last = lastActionRef.current;
    // 같은 key + 800ms 이내 → 무시 (연속 동작)
    if (last.key === key && now - last.timestamp < 800) {
      lastActionRef.current = { key, timestamp: now };
      return;
    }
    pushHistory(label);
    lastActionRef.current = { key, timestamp: now };
  }, [pushHistory]);

  // ─────────────────────────────────────────────────────────
  // 🎨 AI 합성용 — 현재 활성화된 레이어의 실제 이미지 src 추출
  // 페이지별 EditableImage id 형식:
  //   P1.heroImage  /  P2.images.{0..2}  /  P3.image  /  P4.images.{0..3}
  //   P5.ourImage  /  P6.materialImage|sizeImage  /  P7.images.{0..2}
  //   P8.images.{0..3}  /  P9.images.{0..2}  /  P10.componentImage
  // ─────────────────────────────────────────────────────────
  const getActiveImageSrc = () => {
    const PAGE_IMAGE_MAP = {
      P1: { start: 0,  count: 1 },
      P2: { start: 1,  count: 3 },
      P3: { start: 4,  count: 1 },
      P4: { start: 5,  count: 4 },
      P5: { start: 9,  count: 1 },
      P6: { start: 10, count: 2 },
      P7: { start: 12, count: 3 },
      P8: { start: 15, count: 4 },
      P9: { start: 19, count: 3 },
      P10:{ start: 22, count: 1 },
    };

    if (!activeLayerId) return null;
    // 'main:P1.heroImage' / 'free:abc123' / 'shape:xyz' 형식
    const [kind, ...rest] = activeLayerId.split(':');
    const editableId = rest.join(':');

    // 1. main 레이어 (메인 EditableImage)
    if (kind === 'main') {
      // override 에 src 있으면 그걸 우선 (사용자가 사진 교체했을 수 있음)
      const pageOverrides = imageOverrides[currentPage] || {};
      const overrideSrc = pageOverrides[editableId]?.src;
      if (overrideSrc) return overrideSrc;

      // 없으면 PAGE_IMAGE_MAP 으로 인덱스 추론
      const map = PAGE_IMAGE_MAP[currentPage];
      if (!map) return images[0] || null;

      // P2.images.1 → 1, P4.images.3 → 3, P1.heroImage → 0
      const m = editableId.match(/\.images\.(\d+)$/);
      const subIdx = m ? Number(m[1]) : 0;
      const realIdx = map.start + subIdx;
      // 사진 수환 (이미지가 부족하면 첫 번째로 fallback)
      return images[realIdx] || images[realIdx % Math.max(1, images.length)] || images[0] || null;
    }

    // 2. free 레이어 (사용자가 추가한 자유 사진)
    if (kind === 'free') {
      const pageFree = freeImages[currentPage] || [];
      const found = pageFree.find((f) => f.id === editableId);
      return found?.src || null;
    }

    // shape 레이어는 사진이 아니므로 null
    return null;
  };
  const activeImageSrc = getActiveImageSrc();

  const setLayerName = (pageNum, layerId, name) => {
    setLayerNames((prev) => ({
      ...prev,
      [pageNum]: { ...(prev[pageNum] || {}), [layerId]: name },
    }));
  };

  // 자유 이미지 추가 (자유 위치 — slot=null)
  // - 페이지 우상단의 "사진 추가" 버튼으로 추가되는 사진은 자유 위치 모드로 들어감
  // - 페이지 위쪽(본문 시작 부분)에 가운데 정렬로 추가 — 사용자가 드래그로 원하는 위치로 이동
  const addFreeImage = (pageNum, src) => {
    pushHistory(`${pageNum} 사진 추가`);
    setFreeImages((prev) => {
      const list = prev[pageNum] || [];
      const id = 'free_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const NEW_W = 480;
      const NEW_H = 360;
      const PAGE_W = 780;
      const x = Math.round((PAGE_W - NEW_W) / 2);

      // 🆕 페이지 위쪽(y=120)에 추가 — 본문 위에 자연스럽게 겹쳐서 보임
      // 같은 위치에 이미 사진이 있으면 비스듬히 쌓아서 겹침 표시
      const freeOnly = list.filter((it) => !it.slot);
      const BASE_Y = 120;
      let y = BASE_Y;
      const occupied = freeOnly.filter((it) => Math.abs((it.y || 0) - y) < 50).length;
      y = BASE_Y + occupied * 30;
      const xOffset = occupied * 30;

      const newItem = {
        id, src,
        x: x + xOffset,
        y, w: NEW_W, h: NEW_H,
        crop: null, zIndex: 501 + list.length,
        slot: null, // 자유 위치
      };
      return { ...prev, [pageNum]: [...list, newItem] };
    });
  };

  // 인라인 끼워넣기 — 특정 슬롯 위치에 사진 삽입
  // slot: 'top' | `between-${i}-${i+1}` | 'bottom' (페이지 컴포넌트가 정의)
  // 본문이 이 사진 높이만큼 아래로 밀려남 (페이지 컴포넌트에서 처리)
  const addFreeImageToSlot = (pageNum, slot, src) => {
    pushHistory(`${pageNum} 사진 끼워넣기`);
    setFreeImages((prev) => {
      const list = prev[pageNum] || [];
      const id = 'free_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const NEW_W = 700;   // 본문 폭(700) 가득 찬 큰 사진
      const NEW_H = 460;
      const PAGE_W = 780;
      const x = Math.round((PAGE_W - NEW_W) / 2);
      const newItem = {
        id, src, x, y: 0, w: NEW_W, h: NEW_H,
        crop: null,
        zIndex: 100 + list.length,
        slot, // 인라인 끼워넣기
      };
      return { ...prev, [pageNum]: [...list, newItem] };
    });
  };

  // 자유 이미지 업데이트 — 자유사진끼리는 서로 절대 밀어내지 않음 (자유로운 겹침/배치 허용)
  const updateFreeImage = (pageNum, id, partial) => {
    pushHistoryDebounced(`free.${pageNum}.${id}`, `${pageNum} 사진 편집`);
    setFreeImages((prev) => {
      const list = prev[pageNum] || [];
      return {
        ...prev,
        [pageNum]: list.map((it) => (it.id === id ? { ...it, ...partial } : it)),
      };
    });
  };

  // 자유 이미지 삭제
  const deleteFreeImage = (pageNum, id) => {
    pushHistory(`${pageNum} 사진 삭제`);
    setFreeImages((prev) => {
      const list = prev[pageNum] || [];
      return {
        ...prev,
        [pageNum]: list.filter((it) => it.id !== id),
      };
    });
  };

  // ─── 📝 자유 글박스 CRUD ───────────────────────────────────────────
  // 📝 자유 글박스 추가 — "글박스 추가" 버튼으로 호출
  // - 페이지 위쪽에 기본 크기로 생성
  // - 같은 위치에 이미 글박스가 있으면 비스듬히 쌓아 겹침 표시
  const addFreeText = (pageNum) => {
    pushHistory(`${pageNum} 글박스 추가`);
    setFreeTexts((prev) => {
      const list = prev[pageNum] || [];
      const id = 'freetext_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const NEW_W = 280;
      const NEW_H = 60;
      const PAGE_W = 780;
      const baseX = Math.round((PAGE_W - NEW_W) / 2);
      const BASE_Y = 100;
      const occupied = list.filter((it) => Math.abs((it.y || 0) - BASE_Y) < 50).length;
      const x = baseX + occupied * 30;
      const y = BASE_Y + occupied * 30;
      const newItem = {
        id,
        x, y,
        width: NEW_W,
        height: NEW_H,
        html: '글씨를 입력하세요',
        text: '글씨를 입력하세요',
        style: {
          fontSize: 18,
          fontWeight: 700,
          color: '#2F2A26',
          textAlign: 'center',
          fontFamily: "'NanumSquare','나눔스퀘어',system-ui,-apple-system,sans-serif",
        },
        zIndex: 10000 + list.length, // 모든 이미지/도형보다 앞
      };
      return { ...prev, [pageNum]: [...list, newItem] };
    });
  };

  // 자유 글박스 업데이트 (위치/크기/내용/스타일/z-index)
  const updateFreeText = (pageNum, id, partial) => {
    pushHistoryDebounced(`freetext.${pageNum}.${id}`, `${pageNum} 글박스 편집`);
    setFreeTexts((prev) => {
      const list = prev[pageNum] || [];
      return {
        ...prev,
        [pageNum]: list.map((it) => (it.id === id ? { ...it, ...partial } : it)),
      };
    });
  };

  // 자유 글박스 삭제
  const deleteFreeText = (pageNum, id) => {
    pushHistory(`${pageNum} 글박스 삭제`);
    setFreeTexts((prev) => {
      const list = prev[pageNum] || [];
      return {
        ...prev,
        [pageNum]: list.filter((it) => it.id !== id),
      };
    });
  };

  // ─── 🟦 도형 CRUD ─────────────────────────────────────────────────
  // 도형 추가
  // - geometry 인자가 있으면 사용자가 드래그한 위치/크기로 생성 (Photoshop 방식)
  // - geometry가 없으면 기존 동작: 페이지 하단에 기본 크기로 배치
  // geometry: { x, y, w, h } — 페이지 좌표(780px 기준) 정수
  const addShape = (pageNum, type, geometry = null) => {
    pushHistory(`${pageNum} 도형 추가 (${type})`);
    setShapes((prev) => {
      const list = prev[pageNum] || [];
      const id = 'shape_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

      // 종류별 스타일 프리셋 (색상/두께/투명도)
      const stylePresets = {
        rect:      { stroke: '#ef4444', strokeWidth: 4, fill: 'none',    opacity: 1 },
        circle:    { stroke: '#ef4444', strokeWidth: 4, fill: 'none',    opacity: 1 },
        line:      { stroke: '#1f2937', strokeWidth: 4, fill: 'none',    opacity: 1 },
        arrow:     { stroke: '#1f2937', strokeWidth: 4, fill: 'none',    opacity: 1 },
        highlight: { stroke: 'none',    strokeWidth: 0, fill: '#fde047', opacity: 0.5 },
      };
      const styleP = stylePresets[type] || stylePresets.rect;

      let x, y, w, h;
      if (geometry && geometry.w >= 5 && geometry.h >= 5) {
        // 🆕 사용자가 드래그한 위치/크기 사용
        x = Math.round(geometry.x);
        y = Math.round(geometry.y);
        w = Math.round(geometry.w);
        h = Math.round(geometry.h);
        // line은 기본 높이 보정 (너무 얇으면 안 보임)
        if (type === 'line' && h > 0 && h < 4) h = 4;
      } else {
        // 📦 fallback: 기존 동작 (기본 크기 + 자동 배치)
        const sizePresets = {
          rect:      { w: 240, h: 160 },
          circle:    { w: 200, h: 200 },
          line:      { w: 280, h: 4   },
          arrow:     { w: 240, h: 60  },
          highlight: { w: 320, h: 80  },
        };
        const sz = sizePresets[type] || sizePresets.rect;
        const PAGE_BASE_HEIGHT = {
          P1: 1500, P2: 1300, P3: 1450, P4: 1300, P5: 1300,
          P6: 1300, P7: 1500, P8: 1350, P9: 1300, P10: 1500,
        };
        const baseY = PAGE_BASE_HEIGHT[pageNum] || 1300;
        const PAGE_W = 780;
        const existingMaxBottom = list.reduce(
          (max, it) => Math.max(max, (it.y || 0) + (it.h || 0)),
          0
        );
        x = Math.round((PAGE_W - sz.w) / 2);
        y = Math.max(baseY, existingMaxBottom) + 24;
        w = sz.w;
        h = sz.h;
      }

      const newShape = {
        id, type, x, y, w, h,
        ...styleP,
        zIndex: 700 + list.length,
      };
      return { ...prev, [pageNum]: [...list, newShape] };
    });
  };

  const updateShape = (pageNum, id, partial) => {
    pushHistoryDebounced(`shape.${pageNum}.${id}`, `${pageNum} 도형 편집`);
    setShapes((prev) => {
      const list = prev[pageNum] || [];
      return {
        ...prev,
        [pageNum]: list.map((it) => (it.id === id ? { ...it, ...partial } : it)),
      };
    });
  };

  const deleteShape = (pageNum, id) => {
    pushHistory(`${pageNum} 도형 삭제`);
    setShapes((prev) => {
      const list = prev[pageNum] || [];
      return {
        ...prev,
        [pageNum]: list.filter((it) => it.id !== id),
      };
    });
  };

  // 레이어 관리 정책 (정규화):
  //   모든 레이어(메인사진 + 자유이미지)는 1..N 의 연속된 정수 z-index 사용
  //   N = 전체 레이어 수, 큰 숫자 = 앞쪽
  //   레이어 패널의 맨 위 항목 = 가장 큰 z, 맨 아래 항목 = z=1
  //
  // 페이지의 전체 레이어 순서를 받아서(앞→뒤), z-index를 1..N으로 재할당
  // orderedFromTop: [{ kind: 'main'|'free', id }, ...]  맨 앞 → 맨 뒤
  const applyNormalizedZ = (pageNum, orderedFromTop) => {
    if (!Array.isArray(orderedFromTop) || orderedFromTop.length === 0) return;
    const N = orderedFromTop.length;
    // 위에서부터: index 0 → z=N, index 1 → z=N-1, ..., 마지막 → z=1
    const zMap = {};
    orderedFromTop.forEach((l, i) => {
      zMap[`${l.kind}:${l.id}`] = N - i;
    });

    // 자유이미지(free) + 인라인사진(inline) z-index 일괄 적용
    // 둘 다 freeImages 배열에 있으므로 함께 처리
    setFreeImages((prev) => {
      const list = (prev[pageNum] || []).map((it) => {
        const zFree = zMap[`free:${it.id}`];
        const zInline = zMap[`inline:${it.id}`];
        const z = zFree !== undefined ? zFree : zInline;
        return z !== undefined ? { ...it, zIndex: z } : it;
      });
      return { ...prev, [pageNum]: list };
    });
    // 도형(shape) z-index 적용
    setShapes((prev) => {
      const list = (prev[pageNum] || []).map((it) => {
        const z = zMap[`shape:${it.id}`];
        return z !== undefined ? { ...it, zIndex: z } : it;
      });
      return { ...prev, [pageNum]: list };
    });
    // 🆕 (2026-05-03) 자유 글박스(freetext) z-index 일괄 적용
    setFreeTexts((prev) => {
      const list = (prev[pageNum] || []).map((it) => {
        const z = zMap[`freetext:${it.id}`];
        return z !== undefined ? { ...it, zIndex: z } : it;
      });
      return { ...prev, [pageNum]: list };
    });
    // 메인 사진들 z-index는 imageOverrides 에 기록
    orderedFromTop.forEach((l) => {
      if (l.kind === 'main') {
        const z = zMap[`main:${l.id}`];
        if (z !== undefined) updateImageOverride(pageNum, l.id, { zIndex: z });
      }
    });
  };

  // 페이지의 현재 모든 레이어를 z-index 내림차순(앞→뒤) 으로 반환
  // mainLayers: [{ id, zIndex }, ...] - P1의 경우 'P1.heroImage'
  // 호출 측에서 어떤 메인 이미지들이 있는지 알려줘야 함 (P1Hero에서 전달)
  const getOrderedLayers = (pageNum, mainLayers = []) => {
    // 자유 위치 사진 (slot 없음)
    const free = (freeImages[pageNum] || [])
      .filter((it) => !it.slot)
      .map((it) => ({
        kind: 'free',
        id: it.id,
        zIndex: it.zIndex ?? 1,
      }));
    // 인라인 사진 (slot 있음)
    const inlineList = (freeImages[pageNum] || [])
      .filter((it) => !!it.slot)
      .map((it, i) => ({
        kind: 'inline',
        id: it.id,
        zIndex: it.zIndex ?? (500 + i),
      }));
    const mains = mainLayers.map((m) => ({
      kind: 'main',
      id: m.id,
      zIndex: imageOverrides[pageNum]?.[m.id]?.zIndex ?? m.defaultZ ?? 1,
    }));
    const shapeList = (shapes[pageNum] || []).map((s) => ({
      kind: 'shape',
      id: s.id,
      zIndex: s.zIndex ?? 700,
    }));
    // 🆕 (2026-05-03) 자유 글박스(freetext) — 기본 z-index 10000 (모든 이미지/도형보다 위)
    const freeTextList = (freeTexts[pageNum] || []).map((it) => ({
      kind: 'freetext',
      id: it.id,
      zIndex: it.zIndex ?? 10000,
    }));
    return [...mains, ...free, ...inlineList, ...shapeList, ...freeTextList].sort((a, b) => b.zIndex - a.zIndex);
  };

  // 단건 레이어 액션: front/back/forward/backward
  // mainLayers를 받아서 전체 정규화 후 1..N 으로 재할당
  const changeLayerNormalized = (pageNum, kind, id, action, mainLayers = []) => {
    const ordered = getOrderedLayers(pageNum, mainLayers);
    const idx = ordered.findIndex((l) => l.kind === kind && l.id === id);
    console.log('[App] changeLayerNormalized:', pageNum, kind, id, action, 'idx=', idx, 'ordered=', ordered);
    if (idx < 0) return;
    const next = ordered.slice();
    const [target] = next.splice(idx, 1);
    let newIdx = idx;
    if (action === 'front') newIdx = 0;
    else if (action === 'back') newIdx = next.length;
    else if (action === 'forward') newIdx = Math.max(0, idx - 1);
    else if (action === 'backward') newIdx = Math.min(next.length, idx + 1);
    next.splice(newIdx, 0, target);
    applyNormalizedZ(pageNum, next);
  };

  // 하위 호환을 위해 기존 시그니처도 유지 (자유이미지만 처리)
  const changeLayer = (pageNum, id, action) => {
    // mainLayers 정보 없으면 P1.heroImage 만 가정
    const guessMain = pageNum === 'P1' ? [{ id: 'P1.heroImage' }] : [];
    changeLayerNormalized(pageNum, 'free', id, action, guessMain);
  };

  // 드래그앤드롭 결과 적용 — newOrder는 위(앞)→아래(뒤) 순서
  // newOrder: [{ kind, id }, ...]
  const reorderLayers = (pageNum, newOrder) => {
    if (!Array.isArray(newOrder) || newOrder.length === 0) return;
    applyNormalizedZ(pageNum, newOrder);
  };

  // 🆕 (2026-05-03) 레이어 가시성 토글 — 포토샵 방식 눈 아이콘
  // kind: 'main' | 'free' | 'inline' | 'shape' | 'freetext' | 'text'
  // hidden:true 면 visibility:hidden — PNG 캡처에도 그대로 반영됨
  const toggleLayerVisibility = (pageNum, kind, id) => {
    pushHistory(`${pageNum} 레이어 가시성 토글`);
    if (kind === 'main') {
      setImageOverrides((prev) => {
        const pagePrev = prev[pageNum] || {};
        const itemPrev = pagePrev[id] || {};
        const nextHidden = !itemPrev.hidden;
        return {
          ...prev,
          [pageNum]: { ...pagePrev, [id]: { ...itemPrev, hidden: nextHidden } },
        };
      });
    } else if (kind === 'free' || kind === 'inline') {
      setFreeImages((prev) => {
        const list = prev[pageNum] || [];
        return {
          ...prev,
          [pageNum]: list.map((it) => (it.id === id ? { ...it, hidden: !it.hidden } : it)),
        };
      });
    } else if (kind === 'shape') {
      setShapes((prev) => {
        const list = prev[pageNum] || [];
        return {
          ...prev,
          [pageNum]: list.map((it) => (it.id === id ? { ...it, hidden: !it.hidden } : it)),
        };
      });
    } else if (kind === 'freetext') {
      setFreeTexts((prev) => {
        const list = prev[pageNum] || [];
        return {
          ...prev,
          [pageNum]: list.map((it) => (it.id === id ? { ...it, hidden: !it.hidden } : it)),
        };
      });
    } else if (kind === 'text') {
      // 🆕 기존 글박스(textOverrides) — id 형태: 'P1.mainHeadline' 등
      // textOverrides 는 페이지별 객체이므로 id 자체를 키로 사용
      setTextOverrides((prev) => {
        const pagePrev = prev[pageNum] || {};
        const itemPrev = pagePrev[id] || {};
        const nextHidden = !itemPrev.hidden;
        return {
          ...prev,
          [pageNum]: { ...pagePrev, [id]: { ...itemPrev, hidden: nextHidden } },
        };
      });
    }
  };

  // 텍스트 오버라이드 업데이트 헬퍼 (페이지 + 텍스트ID + 부분 override 병합)
  const updateTextOverride = (pageNum, textId, partial) => {
    pushHistoryDebounced(`text.${pageNum}.${textId}`, `${pageNum} 텍스트 수정`);
    setTextOverrides((prev) => {
      const pagePrev = prev[pageNum] || {};
      const itemPrev = pagePrev[textId] || {};
      return {
        ...prev,
        [pageNum]: {
          ...pagePrev,
          [textId]: { ...itemPrev, ...partial },
        },
      };
    });
  };

  // 이미지 오버라이드 업데이트 헬퍼
  const updateImageOverride = (pageNum, imageId, partial) => {
    pushHistoryDebounced(`img.${pageNum}.${imageId}`, `${pageNum} 사진 조정`);
    setImageOverrides((prev) => {
      const pagePrev = prev[pageNum] || {};
      const itemPrev = pagePrev[imageId] || {};
      return {
        ...prev,
        [pageNum]: {
          ...pagePrev,
          [imageId]: { ...itemPrev, ...partial },
        },
      };
    });
  };

  // 현재 페이지 오버라이드 전체 리셋 (텍스트 + 이미지 모두)
  const resetPageOverrides = (pageNum) => {
    setTextOverrides((prev) => {
      const next = { ...prev };
      delete next[pageNum];
      return next;
    });
    setImageOverrides((prev) => {
      const next = { ...prev };
      delete next[pageNum];
      return next;
    });
  };

  // 테마 적용 — themeId 바뀔 때마다 BRAND.colors 스왑
  useEffect(() => {
    applyTheme(brief.themeId || 'warmBeige');
    // 강제 리렌더 트리거 (hacky but effective)
    setPages((prev) => ({ ...prev }));
  }, [brief.themeId]);

  // 전역 폰트 적용 — fontId 바뀔 때마다 BRAND.fontFamily 스왑
  useEffect(() => {
    applyFont(brief.fontId || 'pretendard');
    setPages((prev) => ({ ...prev }));
  }, [brief.fontId]);

  const pageRefs = {
    P1: useRef(null), P2: useRef(null), P3: useRef(null), P4: useRef(null), P5: useRef(null),
    P6: useRef(null), P7: useRef(null), P8: useRef(null), P9: useRef(null), P10: useRef(null),
  };

  // API 키 저장/로딩
  useEffect(() => {
    const saved = localStorage.getItem('openai_api_key');
    if (saved) setApiKey(saved);
    const savedFal = localStorage.getItem('fal_api_key');
    if (savedFal) setFalApiKey(savedFal);
    const savedModel = localStorage.getItem('openai_model');
    if (savedModel) setModel(savedModel);
  }, []);
  useEffect(() => { if (apiKey) localStorage.setItem('openai_api_key', apiKey); }, [apiKey]);
  useEffect(() => { if (falApiKey) localStorage.setItem('fal_api_key', falApiKey); }, [falApiKey]);
  useEffect(() => { if (model) localStorage.setItem('openai_model', model); }, [model]);

  // ─── 프로젝트 자동 저장/복원 ─────────────────────────
  const [hydrated, setHydrated] = useState(false);     // 첫 로드 완료 여부
  const [lastSavedAt, setLastSavedAt] = useState(null); // 마지막 자동 저장 시각
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'

  // 앱 시작 시 1회 — localStorage + IndexedDB에서 복원
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await loadProject();
        if (cancelled) return;
        if (saved) {
          if (saved.brief) setBrief(saved.brief);
          if (Array.isArray(saved.images)) setImages(saved.images);
          if (saved.pages) setPages(saved.pages);
          if (saved.currentPage) setCurrentPage(saved.currentPage);
          if (saved.pageVariants) setPageVariants(saved.pageVariants);
          if (saved.textOverrides) setTextOverrides(saved.textOverrides);
          if (saved.imageOverrides) setImageOverrides(saved.imageOverrides);
          if (saved.freeImages) setFreeImages(saved.freeImages);
          if (saved.freeTexts) setFreeTexts(saved.freeTexts);
          if (saved.shapes) setShapes(saved.shapes);
          if (saved.layerNames) setLayerNames(saved.layerNames);
          if (saved.p5Version) setP5Version(saved.p5Version);
          if (saved.revisionHistory) setRevisionHistory(saved.revisionHistory);
          setLastSavedAt(getLastSaved());
          // 🔄 복원된 상태를 히스토리 시작점으로
          undoHistory.reset({
            pages: saved.pages || {},
            textOverrides: saved.textOverrides || {},
            imageOverrides: saved.imageOverrides || {},
            freeImages: saved.freeImages || {},
            freeTexts: saved.freeTexts || {},
            shapes: saved.shapes || {},
            layerNames: saved.layerNames || {},
          });
        }
      } catch (e) {
        console.warn('프로젝트 복원 실패:', e);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 자동 저장 (1초 debounce)
  const debouncedSaveRef = useRef(null);
  if (!debouncedSaveRef.current) {
    debouncedSaveRef.current = debounce(async (snapshot) => {
      try {
        setSaveStatus('saving');
        const { savedAt } = await saveProject(snapshot);
        setLastSavedAt(savedAt);
        setSaveStatus('saved');
        // 2초 후 idle로
        setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);
      } catch (e) {
        console.error('자동 저장 실패:', e);
        setSaveStatus('error');
      }
    }, 1000);
  }

  // 주요 state가 변할 때마다 debounce 자동 저장
  useEffect(() => {
    if (!hydrated) return; // 첫 hydration 전에는 저장하지 않음 (덮어쓰기 방지)
    debouncedSaveRef.current({
      brief, images, pages, currentPage, pageVariants,
      textOverrides, imageOverrides, freeImages, freeTexts, shapes, layerNames, p5Version, revisionHistory,
    });
  }, [hydrated, brief, images, pages, currentPage, pageVariants,
      textOverrides, imageOverrides, freeImages, freeTexts, shapes, layerNames, p5Version, revisionHistory]);

  // 수동 내보내기 (JSON 파일로 다운로드)
  const handleExportProject = useCallback(() => {
    const productName = (brief.productName || 'project').trim().slice(0, 30).replace(/[^\w가-힣]/g, '_') || 'project';
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `coupang-${productName}-${stamp}.json`;
    downloadProjectJSON({
      brief, images, pages, currentPage, pageVariants,
      textOverrides, imageOverrides, freeImages, freeTexts, shapes, layerNames, p5Version, revisionHistory,
    }, filename);
  }, [brief, images, pages, currentPage, pageVariants, textOverrides, imageOverrides, freeImages, freeTexts, shapes, layerNames, p5Version, revisionHistory]);

  // 수동 불러오기 (JSON 파일 입력)
  const fileInputRef = useRef(null);
  const handleImportProject = useCallback(async (file) => {
    try {
      const data = await readProjectJSONFromFile(file);
      if (!window.confirm('현재 작업 중인 내용을 모두 덮어쓰고 불러올까요?')) return;
      // 이미지 (base64) 그대로 setImages → 다음 자동 저장 때 IDB로 옮겨짐
      if (data.brief) setBrief(data.brief);
      setImages(Array.isArray(data.images) ? data.images : []);
      setPages(data.pages || {});
      setCurrentPage(data.currentPage || 'P1');
      setPageVariants(data.pageVariants || {});
      setTextOverrides(data.textOverrides || {});
      setImageOverrides(data.imageOverrides || {});
      setFreeImages(data.freeImages || {});
      setFreeTexts(data.freeTexts || {});
      setShapes(data.shapes || {});
      setLayerNames(data.layerNames || {});
      setP5Version(data.p5Version || 'text');
      setRevisionHistory(data.revisionHistory || {});
      // 🔄 히스토리 초기화 (불러온 상태가 새 시작점)
      undoHistory.reset({
        pages: data.pages || {},
        textOverrides: data.textOverrides || {},
        imageOverrides: data.imageOverrides || {},
        freeImages: data.freeImages || {},
        freeTexts: data.freeTexts || {},
        shapes: data.shapes || {},
        layerNames: data.layerNames || {},
      });
      alert('✅ 프로젝트를 불러왔습니다.');
    } catch (e) {
      alert('❌ 불러오기 실패: ' + e.message);
    }
  }, []);

  // 모두 초기화
  const handleClearAll = useCallback(async () => {
    if (!window.confirm('모든 입력/이미지/제작 결과를 지우고 처음부터 시작할까요?\n(저장된 데이터도 모두 삭제됩니다.)')) return;
    if (!window.confirm('정말 초기화하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      await clearProject();
    } catch {}
    // state 리셋
    setBrief(DEFAULT_BRIEF);
    setImages([]);
    setPages({});
    setCurrentPage('P1');
    setPageVariants({});
    setTextOverrides({});
    setImageOverrides({});
    setFreeImages({});
    setFreeTexts({});
    setLayerNames({});
    setP5Version('text');
    setRevisionHistory({});
    setExtractResult(null);
    setReferenceUrl('');
    setPastedText('');
    setUserNotes('');
    setError('');
    setLastSavedAt(null);
    // 🔄 히스토리도 초기화
    undoHistory.reset({
      pages: {},
      textOverrides: {},
      imageOverrides: {},
      freeImages: {},
      shapes: {},
      layerNames: {},
    });
    alert('✅ 초기화되었습니다.');
  }, []);

  // 브리프 수정 헬퍼
  const updateBrief = (patch) => setBrief((b) => ({ ...b, ...patch }));
  const updateArrayItem = (key, idx, value) => {
    setBrief((b) => {
      const next = [...b[key]];
      next[idx] = value;
      return { ...b, [key]: next };
    });
  };
  const updateObjectArrayItem = (key, idx, subKey, value) => {
    setBrief((b) => {
      const next = b[key].map((it, i) => (i === idx ? { ...it, [subKey]: value } : it));
      return { ...b, [key]: next };
    });
  };

  // 참조 URL 또는 붙여넣은 텍스트에서 제품 정보 자동 추출
  const handleAutoFillFromUrl = async () => {
    setError('');
    setExtractResult(null);
    setShowPasteHint(false);
    if (!apiKey.trim()) {
      setError('OpenAI API 키를 먼저 입력해주세요.');
      return;
    }
    if (extractMode === 'url' && !referenceUrl.trim()) {
      setError('참조 URL을 입력해주세요.');
      return;
    }
    if (extractMode === 'paste' && pastedText.trim().length < 50 && userNotes.trim().length < 10 && ocrImages.length === 0) {
      setError('① 페이지 내용(최소 50자), ② 내 메모(최소 10자), 또는 📷 OCR 이미지 중 하나는 필요합니다.');
      return;
    }
    try {
      setIsExtracting(true);
      let info;
      if (extractMode === 'url') {
        let url = referenceUrl.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        info = await extractProductInfoFromUrl({
          apiKey: apiKey.trim(),
          model,
          url,
        });
      } else {
        info = await extractProductInfoFromText({
          apiKey: apiKey.trim(),
          model,
          pastedText,
          userNotes,
          imageDataUrls: ocrImages, // OCR 전용 이미지 (1688 다운받은 그림)
        });
      }

      // 빈 값이 아닌 필드만 병합 (사용자가 이미 입력한 값 보호)
      const filled = [];
      setBrief((b) => {
        const next = { ...b };
        const setIf = (key, val) => {
          if (val && val.toString().trim() && !b[key]?.toString().trim()) {
            next[key] = val;
            filled.push(key);
          }
        };
        setIf('productName', info.productName);
        setIf('productType', info.productType);
        setIf('material', info.material);
        setIf('sizeSpec', info.sizeSpec);
        setIf('photoTypes', info.photoTypes);
        setIf('extraNotes', info.extraNotes);
        setIf('generalProductName', info.generalProductName);

        // compliance (모델명/색상)
        const nextCompliance = { ...(b.compliance || {}) };
        let compChanged = false;
        if (info.modelName && !nextCompliance.modelName?.trim()) {
          nextCompliance.modelName = info.modelName; compChanged = true;
        }
        if (info.color && !nextCompliance.color?.trim()) {
          nextCompliance.color = info.color; compChanged = true;
        }
        if (info.material && !nextCompliance.material?.trim()) {
          nextCompliance.material = info.material; compChanged = true;
        }
        if (info.sizeSpec && !nextCompliance.sizeWeight?.trim()) {
          nextCompliance.sizeWeight = info.sizeSpec; compChanged = true;
        }
        if (compChanged) { next.compliance = nextCompliance; filled.push('compliance'); }

        // 배열 필드는 빈 슬롯만 채움
        const fillArray = (key, src, max) => {
          if (Array.isArray(src) && src.length > 0) {
            const cur = Array.isArray(b[key]) ? [...b[key]] : Array(max).fill('');
            while (cur.length < max) cur.push('');
            src.slice(0, max).forEach((s, i) => {
              if (!cur[i]?.toString().trim() && s?.toString().trim()) cur[i] = s;
            });
            if (JSON.stringify(cur) !== JSON.stringify(b[key])) {
              next[key] = cur; filled.push(key);
            }
          }
        };
        fillArray('strengths', info.strengths, 3);
        fillArray('differences', info.differences, 4);
        fillArray('generalProductFeatures', info.generalProductFeatures, 4);
        fillArray('usages', info.usages, 4);
        fillArray('usageSteps', info.usageSteps, 3);

        // targetCustomers — 구버전 문자열 응답도 호환
        const tcArr = Array.isArray(info.targetCustomers)
          ? info.targetCustomers
          : info.targetCustomer ? [info.targetCustomer] : [];
        fillArray('targetCustomers', tcArr, 3);

        // reviews (객체 배열, 65자 컷)
        if (Array.isArray(info.reviews) && info.reviews.length > 0) {
          const nextR = [...b.reviews];
          info.reviews.slice(0, 4).forEach((r, i) => {
            if (!nextR[i]) nextR[i] = { nickname: '', date: '', body: '' };
            const slot = { ...nextR[i] };
            let changed = false;
            if (!slot.nickname?.trim() && r?.nickname) { slot.nickname = r.nickname; changed = true; }
            if (!slot.date?.trim() && r?.date) { slot.date = r.date; changed = true; }
            if (!slot.body?.trim() && r?.body) {
              slot.body = String(r.body).slice(0, 65); changed = true;
            }
            if (changed) nextR[i] = slot;
          });
          if (JSON.stringify(nextR) !== JSON.stringify(b.reviews)) {
            next.reviews = nextR; filled.push('reviews');
          }
        }

        // faqs (객체 배열)
        if (Array.isArray(info.faqs) && info.faqs.length > 0) {
          const nextF = [...b.faqs];
          info.faqs.slice(0, 5).forEach((f, i) => {
            if (!nextF[i]) nextF[i] = { q: '', a: '' };
            const slot = { ...nextF[i] };
            let changed = false;
            if (!slot.q?.trim() && f?.q) { slot.q = f.q; changed = true; }
            if (!slot.a?.trim() && f?.a) { slot.a = f.a; changed = true; }
            if (changed) nextF[i] = slot;
          });
          if (JSON.stringify(nextF) !== JSON.stringify(b.faqs)) {
            next.faqs = nextF; filled.push('faqs');
          }
        }
        return next;
      });

      setExtractResult({
        filledFields: filled,
        source: info._source,
        attempts: info._attempts,
        contentLength: info._contentLength,
        normalizeNote: info._normalizeNote,
        weakContent: info._weakContent,
        finalUrl: info._finalUrl,
      });
    } catch (err) {
      setError(err.message || 'URL 분석 중 오류가 발생했습니다.');
      // 봇 차단(Captcha) 감지 시 붙여넣기 모드 권장
      if (err.isBlocked) {
        setShowPasteHint(true);
      }
    } finally {
      setIsExtracting(false);
    }
  };

  // 추천 검색어 20개 추출
  const handleExtractKeywords = async () => {
    setError('');
    if (!apiKey.trim()) {
      setError('OpenAI API 키를 먼저 입력해주세요.');
      return;
    }
    if (!brief.productName?.trim() && pastedText.trim().length < 50 && userNotes.trim().length < 10 && ocrImages.length === 0) {
      setError('제품명·페이지 내용·메모·OCR 이미지 중 하나는 필요합니다.');
      return;
    }
    try {
      setIsExtractingKeywords(true);
      const { keywords: kws } = await extractRecommendedKeywords({
        apiKey: apiKey.trim(),
        model,
        pastedText,
        userNotes,
        imageDataUrls: ocrImages,
        productName: brief.productName,
      });
      setKeywords(kws || []);
    } catch (err) {
      setError(err.message || '추천 검색어 추출 중 오류가 발생했습니다.');
    } finally {
      setIsExtractingKeywords(false);
    }
  };

  // 이미지 업로드
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
      ),
    ).then((urls) => setImages((prev) => [...prev, ...urls]));
  };
  const removeImage = (idx) => setImages((prev) => prev.filter((_, i) => i !== idx));

  // AI로 빈 칸 자동 채우기 — 제품명만 있으면 나머지 전부 채움
  const handleAutoFillEmpty = async () => {
    setError('');
    setAutoFillMessage('');
    if (!apiKey) { setError('OpenAI API 키를 입력해 주세요.'); return; }
    if (!brief.productName?.trim()) {
      setError('제품명은 직접 입력해 주세요. 나머지는 AI가 채웁니다.');
      return;
    }
    setIsAutoFilling(true);
    try {
      const filled = await autoFillBrief({
        apiKey,
        model,
        brief,
        imageCount: images.length,
      });
      setBrief(filled);
      setAutoFillMessage('✅ AI가 빈 칸을 채웠습니다. 수정하거나 그대로 페이지를 생성하세요.');
      setTimeout(() => setAutoFillMessage(''), 6000);
    } catch (e) {
      setError(`자동 채움 실패: ${e.message || e}`);
    } finally {
      setIsAutoFilling(false);
    }
  };

  // 페이지 제작
  const handleGenerate = async (pageNumber, options = {}) => {
    const { revisionRequest = '', previousCopy = null } = options;
    setError('');

    // 🔍 디버그: 생성 시작 로그 (문제 파악용)
    console.log(`[handleGenerate] ${pageNumber} 시작`, {
      hasApiKey: !!apiKey.trim(),
      imageCount: images.length,
      productName: brief.productName,
      revisionRequest: revisionRequest || '(없음)',
    });

    // API 키 먼저 체크 (빠른 실패)
    if (!apiKey.trim()) {
      setError('⚠️ 섹션 1에서 OpenAI API 키를 입력해주세요.');
      console.warn('[handleGenerate] API 키 없음');
      return;
    }

    // 공통 필수 체크 — blocking만 생성 차단, warnings는 무시 (AI가 채움)
    const common = validateCommonBrief(brief, images);
    if (!common.ok) {
      const missing = (common.blocking || common.missing).join(', ');
      setError(`⚠️ 다음 필수 정보가 부족합니다: ${missing}\n→ 섹션 3(제품명) / 섹션 4(제품 사진 1장 이상)를 먼저 입력해주세요.`);
      console.warn('[handleGenerate] 필수 정보 부족:', missing);
      return;
    }
    // 페이지별 체크는 경고만 — AI가 자동으로 채움
    validatePageRequirements(pageNumber, brief);

    if (revisionRequest) setIsRevising(true); else setIsLoading(true);
    // ⏱ 진행 상태 시작
    setGenerationProgress({
      pageNumber,
      startedAt: Date.now(),
      avgSec: PAGE_AVG_SECONDS[pageNumber] || 22,
      isRevision: !!revisionRequest,
    });
    setProgressTick(0);
    try {
      // 이전 페이지 요약
      const previousPagesSummary = PAGE_LIST.slice(0, PAGE_LIST.indexOf(pageNumber))
        .filter((p) => pages[p])
        .map((p) => `${p}: ${pages[p]?.pagePurpose || ''}`)
        .join('\n');

      console.log(`[handleGenerate] ${pageNumber} API 호출 시작 (model=${model})`);
      const result = await generateCoupangPage({
        apiKey: apiKey.trim(),
        model,
        pageNumber,
        brief,
        imageCount: images.length,
        previousPagesSummary,
        revisionRequest,
        previousCopy,
        revisionHistory: revisionHistory[pageNumber] || [], // 누적 수정 히스토리
      });
      console.log(`[handleGenerate] ${pageNumber} 응답 수신`, {
        hasCopy: !!result?.copy,
        needsMoreInfo: result?.needsMoreInfo,
        missingItems: result?.missingItems,
      });

      // 💰 비용 기록 (응답에 _usage가 있는 경우)
      if (result?._usage) {
        const cost = costFromUsage(model, result._usage);
        if (cost) {
          recordCost({
            label: `${pageNumber} ${revisionRequest ? '수정' : '생성'}`,
            model: cost.model,
            inputTokens: cost.inputTokens,
            outputTokens: cost.outputTokens,
            krw: cost.krw,
          });
          // 페이지 객체에도 비용 보존 (UI 표시용)
          result._costKrw = cost.krw;
          // 누적 합계 갱신
          setCostBumpKey((k) => k + 1);
        }
      }

      // AI가 needsMoreInfo: true로 답하면 에러로 표시
      if (result?.needsMoreInfo) {
        const items = (result.missingItems || []).join(', ');
        setError(`🤖 AI가 정보 부족으로 생성을 거부했습니다: ${items || '상세 정보 필요'}\n→ 섹션 3~5에서 더 구체적으로 입력하거나 '빈 칸 채우기'를 먼저 눌러주세요.`);
      }

      // 🔄 페이지 생성/수정 직전 상태를 히스토리에 저장 (Ctrl+Z로 이전 결과로 복원 가능)
      pushHistory(revisionRequest ? `${pageNumber} 수정` : `${pageNumber} 생성`);
      setPages((prev) => ({ ...prev, [pageNumber]: result }));
      setCurrentPage(pageNumber);

      // 수정 히스토리 기록 / variant 증가
      if (revisionRequest) {
        // 채팅창 "수정 요청" — 히스토리 기록 (variant 유지)
        setRevisionHistory((prev) => ({
          ...prev,
          [pageNumber]: [
            ...(prev[pageNumber] || []),
            { feedback: revisionRequest, at: new Date().toLocaleTimeString('ko-KR') },
          ],
        }));
        setFeedbackInput('');
      } else {
        // "다시 생성" 또는 "초기 생성" — variant +1로 레이아웃/아이콘 모양 변경
        // (채팅 수정이 아닐 때만 variant 증가)
        setPageVariants((prev) => ({
          ...prev,
          [pageNumber]: (prev[pageNumber] || 0) + 1,
        }));
      }
    } catch (err) {
      console.error(`[handleGenerate] ${pageNumber} 실패`, err);
      setError(`❌ ${pageNumber} 생성 실패: ${err.message || err}\n→ 브라우저 콘솔(F12)에서 자세한 에러를 확인할 수 있습니다.`);
    } finally {
      setIsLoading(false);
      setIsRevising(false);
      setGenerationProgress(null);
    }
  };

  // 수정 요청 (채팅창에서 전송)
  const handleRevise = async () => {
    if (!feedbackInput.trim()) return;
    const current = pages[currentPage];
    if (!current?.copy) {
      setError(`${currentPage}를 먼저 생성해주세요.`);
      return;
    }
    await handleGenerate(currentPage, {
      revisionRequest: feedbackInput.trim(),
      previousCopy: current.copy,
    });
  };

  // 다운로드
  const handleDownloadImage = async (pageNumber) => {
    try {
      const node = pageRefs[pageNumber].current;
      await downloadAsImage(node, `${brief.productName || 'product'}-${pageNumber}.png`);
    } catch (err) { setError(err.message); }
  };
  const handleDownloadHtml = (pageNumber) => {
    try {
      const node = pageRefs[pageNumber].current;
      downloadAsHtml(node, `${brief.productName || 'product'}-${pageNumber}.html`);
    } catch (err) { setError(err.message); }
  };

  // ───── 전체 내보내기 (P1~P10) ─────
  const [exportProgress, setExportProgress] = useState(null); // { done, total, label } | null
  const [showExportPanel, setShowExportPanel] = useState(false);

  /** 모든 페이지가 mount 되도록 잠시 기다리고, 완성된 페이지의 ref 노드 배열을 반환 */
  const collectAllPageNodes = async () => {
    // 한 프레임 대기 — 숨겨진 export 영역의 페이지들이 DOM에 들어올 시간
    await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => setTimeout(r, 200));
    const list = [];
    for (const key of PAGE_LIST) {
      const result = pages[key];
      if (!result?.copy || result?.needsMoreInfo) continue;
      const node = exportPageRefs[key]?.current;
      if (node) list.push({ key, node });
    }
    return list;
  };

  const productSlug = (brief.productName || 'product').replace(/[^\w가-힣]+/g, '_').slice(0, 40) || 'product';

  const handleExportAllSinglePng = async () => {
    try {
      setShowExportPanel(true);
      setExportProgress({ done: 0, total: 1, label: '준비 중...' });
      const list = await collectAllPageNodes();
      if (!list.length) { setError('완성된 페이지가 없습니다.'); setExportProgress(null); return; }
      await downloadAllAsSinglePng(list, `${productSlug}-all.png`, setExportProgress);
      setTimeout(() => setExportProgress(null), 1500);
    } catch (err) { setError(err.message); setExportProgress(null); }
  };

  const handleExportAllSeparate = async () => {
    try {
      setShowExportPanel(true);
      setExportProgress({ done: 0, total: 1, label: '준비 중...' });
      const list = await collectAllPageNodes();
      if (!list.length) { setError('완성된 페이지가 없습니다.'); setExportProgress(null); return; }
      await downloadAllAsSeparatePngs(list, productSlug, setExportProgress);
      setTimeout(() => setExportProgress(null), 1500);
    } catch (err) { setError(err.message); setExportProgress(null); }
  };

  const handleExportAllHtml = async () => {
    try {
      setShowExportPanel(true);
      setExportProgress({ done: 0, total: 1, label: 'HTML 생성 중...' });
      const list = await collectAllPageNodes();
      if (!list.length) { setError('완성된 페이지가 없습니다.'); setExportProgress(null); return; }
      downloadAllAsHtml(list, `${productSlug}-all.html`);
      setExportProgress({ done: 1, total: 1, label: '완료' });
      setTimeout(() => setExportProgress(null), 1500);
    } catch (err) { setError(err.message); setExportProgress(null); }
  };

  // 숨겨진 전체 페이지 렌더링용 refs (편집 UI 없이 순수 렌더)
  const exportPageRefs = {
    P1: useRef(null), P2: useRef(null), P3: useRef(null), P4: useRef(null), P5: useRef(null),
    P6: useRef(null), P7: useRef(null), P8: useRef(null), P9: useRef(null), P10: useRef(null),
  };

  const currentResult = pages[currentPage];
  const completedCount = PAGE_LIST.filter((p) => pages[p] && !pages[p].needsMoreInfo).length;

  return (
    <div className="min-h-full" style={{ backgroundColor: '#f0ebe4' }}>
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b" style={{ borderColor: '#e2ddd4' }}>
        <div className="max-w-[1700px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-black"
              style={{ backgroundColor: '#C8B6A6' }}
            >
              쿠
            </div>
            <div>
              <h1 className="text-base font-extrabold" style={{ color: '#2F2A26' }}>
                쿠팡 상세페이지 제작 에이전트 v3.2
              </h1>
              <p className="text-[11px] text-slate-500">
                생활용품/인테리어용품 · P1~P10 순차 제작 · 브랜드 고정값 적용
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 💰 이번 세션 누적 비용 */}
            <div
              className="text-[11px] font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-amber-50"
              style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}
              title={`이번 세션 OpenAI 비용 — ${costSummary.count}회 호출 / 합계 ${formatKRW(costSummary.totalKrw)}\n클릭 시 세션 리셋`}
              onClick={() => {
                if (window.confirm('비용 카운터를 0원으로 리셋할까요?\n(과거 기록은 유지됩니다)')) {
                  resetSession();
                  setCostBumpKey((k) => k + 1);
                  // sessionStartMs는 초기값이므로 페이지 리로드 권장하나 우선 리셋만
                  window.location.reload();
                }
              }}
            >
              <span>💰</span>
              <span>이번 세션</span>
              <span style={{ color: '#B45309', fontWeight: 'bold' }}>
                {formatKRW(costSummary.totalKrw)}
              </span>
              {costSummary.count > 0 && (
                <span style={{ color: '#B45309', opacity: 0.7 }}>· {costSummary.count}회</span>
              )}
            </div>

            {/* 자동 저장 상태 표시 */}
            <div className="text-[11px] font-semibold flex items-center gap-1.5" title="작업 내용은 1초마다 브라우저에 자동 저장됩니다.">
              {saveStatus === 'saving' && (
                <span style={{ color: '#0ea5e9' }}>💾 저장 중...</span>
              )}
              {saveStatus === 'saved' && (
                <span style={{ color: '#16a34a' }}>✓ 저장됨</span>
              )}
              {saveStatus === 'error' && (
                <span style={{ color: '#dc2626' }}>⚠️ 저장 실패</span>
              )}
              {saveStatus === 'idle' && lastSavedAt && (
                <span style={{ color: '#94a3b8' }}>
                  {(() => {
                    const d = new Date(lastSavedAt);
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    return `자동 저장 ${hh}:${mm}`;
                  })()}
                </span>
              )}
              {saveStatus === 'idle' && !lastSavedAt && (
                <span style={{ color: '#94a3b8' }}>자동 저장 대기</span>
              )}
            </div>

            {/* ❓ 온보딩 튜토리얼 다시 보기 */}
            <button
              onClick={() => handleOpenOnboarding(true)}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border hover:bg-slate-50 flex items-center gap-1"
              style={{ borderColor: '#e2ddd4', color: '#6b6660' }}
              title="온보딩 튜토리얼 다시 보기 (5분)"
            >
              <span>❓</span>
              <span>도움말</span>
            </button>

            {/* 프로젝트 관리 버튼 그룹 */}
            <div className="flex items-center gap-1 border-l pl-3" style={{ borderColor: '#e2ddd4' }}>
              <button
                onClick={handleExportProject}
                title="현재 프로젝트를 JSON 파일로 내보내기 (다른 PC에서도 불러올 수 있음)"
                className="px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors hover:bg-slate-100"
                style={{ color: '#2F2A26', border: '1px solid #e2ddd4' }}
              >
                💾 내보내기
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportProject(f);
                  e.target.value = ''; // 같은 파일 다시 선택 가능하게
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="저장된 JSON 파일을 불러와서 작업 이어가기"
                className="px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors hover:bg-slate-100"
                style={{ color: '#2F2A26', border: '1px solid #e2ddd4' }}
              >
                📂 불러오기
              </button>
              <button
                onClick={handleClearAll}
                title="모든 입력/이미지/제작 결과 초기화 (되돌릴 수 없음)"
                className="px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors hover:bg-red-50"
                style={{ color: '#dc2626', border: '1px solid #fecaca' }}
              >
                🗑️ 초기화
              </button>
            </div>

            {/* P1~P10 전체 내보내기 (PNG/HTML) */}
            <div className="relative" data-tour="export-button">
              <button
                onClick={() => setShowExportPanel((v) => !v)}
                title="P1~P10 전체를 한꺼번에 내보내기"
                className="px-3 py-1.5 rounded-md text-[11px] font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#2F2A26' }}
                disabled={completedCount === 0}
              >
                📦 전체 내보내기 ({completedCount}/10)
              </button>
              {showExportPanel && (
                <div
                  className="absolute right-0 mt-1 bg-white rounded-lg shadow-xl border p-2 z-40"
                  style={{ borderColor: '#e2ddd4', width: 260 }}
                >
                  <div className="text-[10px] font-bold text-slate-500 px-2 py-1">완성된 페이지만 포함됩니다</div>
                  <button
                    onClick={() => { handleExportAllSinglePng(); }}
                    disabled={!!exportProgress || completedCount === 0}
                    className="w-full text-left px-3 py-2 rounded text-[12px] font-bold hover:bg-slate-100 disabled:opacity-50 flex items-center gap-2"
                    style={{ color: '#2F2A26' }}
                  >
                    🖼️ <div><div>한 장의 긴 PNG</div><div className="text-[10px] font-normal text-slate-500">P1~P10 세로로 이어붙임</div></div>
                  </button>
                  <button
                    onClick={() => { handleExportAllSeparate(); }}
                    disabled={!!exportProgress || completedCount === 0}
                    className="w-full text-left px-3 py-2 rounded text-[12px] font-bold hover:bg-slate-100 disabled:opacity-50 flex items-center gap-2"
                    style={{ color: '#2F2A26' }}
                  >
                    🗂️ <div><div>페이지별 PNG (10장)</div><div className="text-[10px] font-normal text-slate-500">P1.png ~ P10.png 따로</div></div>
                  </button>
                  <button
                    onClick={() => { handleExportAllHtml(); }}
                    disabled={!!exportProgress || completedCount === 0}
                    className="w-full text-left px-3 py-2 rounded text-[12px] font-bold hover:bg-slate-100 disabled:opacity-50 flex items-center gap-2"
                    style={{ color: '#2F2A26' }}
                  >
                    📄 <div><div>전체 HTML 한 파일</div><div className="text-[10px] font-normal text-slate-500">쿠팡 등록용 (780px)</div></div>
                  </button>
                  <button
                    onClick={() => setShowExportPanel(false)}
                    className="w-full text-center px-3 py-1.5 mt-1 rounded text-[10px] text-slate-500 hover:bg-slate-100"
                  >닫기</button>
                </div>
              )}
            </div>

            <div className="text-xs font-semibold text-slate-600 border-l pl-3" style={{ borderColor: '#e2ddd4' }}>
              진행률: <span style={{ color: '#C8B6A6' }}>{completedCount}</span> / 10
            </div>
            <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${(completedCount / 10) * 100}%`,
                  backgroundColor: '#C8B6A6',
                  transition: 'width .3s',
                }}
              />
            </div>
          </div>
        </div>
        {/* 페이지 탭 + 현재 페이지 액션 (한 줄) */}
        <div className="max-w-[1700px] mx-auto px-6 pb-2 flex items-center gap-2 flex-wrap">
          {/* 우측으로 이동: P1~P10 페이지 탭 */}
          <div className="flex gap-1 items-center flex-wrap ml-auto">
            {PAGE_LIST.map((p) => {
              const done = pages[p] && !pages[p].needsMoreInfo;
              const active = currentPage === p;
              return (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className="px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap border shadow-sm"
                  style={{
                    backgroundColor: active ? '#C8B6A6' : done ? '#F7F3EE' : '#fff',
                    color: active ? '#fff' : '#2F2A26',
                    borderColor: active ? '#C8B6A6' : '#e2ddd4',
                  }}
                >
                  {done && !active ? '✓ ' : ''}{p}
                </button>
              );
            })}
          </div>

          {/* 우측: 현재 페이지 액션 (PNG / HTML / 다시 생성 / 다음) — 이전 PNG 버튼 크기와 동일 */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* PNG / HTML — 결과가 있을 때만 표시 */}
            {currentResult?.copy && !currentResult.needsMoreInfo && (
              <>
                <button
                  onClick={() => handleDownloadImage(currentPage)}
                  className="px-3 py-2 rounded-lg text-white text-xs font-bold shadow"
                  style={{ backgroundColor: '#2F2A26' }}
                  title={`${currentPage} 페이지를 PNG 이미지로 다운로드`}
                >
                  📥 PNG
                </button>
                <button
                  onClick={() => handleDownloadHtml(currentPage)}
                  className="px-3 py-2 rounded-lg text-xs font-bold border"
                  style={{ borderColor: '#2F2A26', color: '#2F2A26', backgroundColor: '#fff' }}
                  title={`${currentPage} 페이지를 HTML 파일로 다운로드`}
                >
                  📄 HTML
                </button>
              </>
            )}

            {/* 다시 생성 / 생성 — 항상 표시 */}
            <button
              data-tour="generate-button"
              onClick={() => handleGenerate(currentPage)}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg text-white font-bold text-xs shadow"
              style={{ backgroundColor: isLoading ? '#a89b8f' : '#C8B6A6' }}
            >
              {isLoading ? '생성 중...' : currentResult ? `🔁 ${currentPage} 다시 생성` : `${currentPage} 생성`}
            </button>

            {/* 다음 페이지 — 결과가 있을 때만 */}
            {currentResult?.copy && !currentResult.needsMoreInfo && (() => {
              const nextIdx = PAGE_LIST.indexOf(currentPage) + 1;
              if (nextIdx >= PAGE_LIST.length) return null;
              const nextP = PAGE_LIST[nextIdx];
              return (
                <button
                  onClick={() => { setCurrentPage(nextP); handleGenerate(nextP); }}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-lg text-white text-xs font-bold shadow"
                  style={{ backgroundColor: '#E87A2B' }}
                  title={`${nextP} 페이지로 자동 이동 + 생성`}
                >
                  다음 ({nextP}) →
                </button>
              );
            })()}
          </div>
        </div>
      </header>

      <main className="max-w-[1700px] mx-auto px-6 py-5 grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5 items-start">
        {/* 좌측: 입력 + 페이지 컨트롤 (Sidebar 컴포넌트로 분리됨) */}
        <Sidebar
          apiKey={apiKey} setApiKey={setApiKey}
          falApiKey={falApiKey} setFalApiKey={setFalApiKey}
          model={model} setModel={setModel}
          brief={brief} setBrief={setBrief}
          updateBrief={updateBrief}
          updateArrayItem={updateArrayItem}
          updateObjectArrayItem={updateObjectArrayItem}
          images={images}
          handleImageUpload={handleImageUpload}
          reviewInsights={reviewInsights}
          setReviewInsights={setReviewInsights}
          referenceUrl={referenceUrl} setReferenceUrl={setReferenceUrl}
          isExtracting={isExtracting}
          extractResult={extractResult}
          extractMode={extractMode} setExtractMode={setExtractMode}
          pastedText={pastedText} setPastedText={setPastedText}
          userNotes={userNotes} setUserNotes={setUserNotes}
          ocrImages={ocrImages} setOcrImages={setOcrImages}
          showPasteHint={showPasteHint}
          keywords={keywords} setKeywords={setKeywords}
          isExtractingKeywords={isExtractingKeywords}
          isAutoFilling={isAutoFilling}
          autoFillMessage={autoFillMessage}
          handleAutoFillFromUrl={handleAutoFillFromUrl}
          handleAutoFillEmpty={handleAutoFillEmpty}
          handleExtractKeywords={handleExtractKeywords}
          // 🆕 (2026-05-08) 경쟁사 분석기에서 추천 헤드라인을 추천 페이지의 메인 텍스트로 즉시 덮어쓰기
          applyHeadlineToPage={(pageNum, text) => {
            // 페이지별 메인 헤드라인 텍스트 ID 매핑
            const PAGE_MAIN_TEXT_ID = {
              P1: 'P1.mainHeadline',
              P2: 'P2.headline',
              P3: 'P3.mainTitle',
              P4: 'P4.sectionTitle',
              P5: 'P5.headline',
              P6: 'P6.material.title',
              P7: 'P7.title',
              P8: 'P8.headline',
              P9: 'P9.title',
              P10: 'P10.ctaTitle',
            };
            const textId = PAGE_MAIN_TEXT_ID[pageNum];
            if (!textId) {
              alert(`${pageNum} 페이지는 자동 적용을 지원하지 않습니다.`);
              return;
            }
            const safe = String(text || '').trim();
            if (!safe) return;
            const escaped = safe
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            updateTextOverride(pageNum, textId, { html: escaped, text: safe });
            alert(`✅ ${pageNum} 페이지 메인 헤드라인을 다음 문구로 교체했습니다.\n\n"${safe}"\n\n💡 ${pageNum} 페이지를 열어 확인하세요.`);
          }}
        />

        {/* 우측: 현재 페이지 제작 + 미리보기 */}
        <section className="space-y-4">
          {/* 현재 페이지 제작 카드 */}
          <div className="bg-white rounded-2xl p-5 border" style={{ borderColor: '#e2ddd4' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-2">
                  <span>현재 작업 중</span>
                  {/* 💰 이 페이지 마지막 생성 비용 */}
                  {currentResult?._costKrw > 0 && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}
                      title={`이 페이지 최근 생성 비용 (${currentResult._model || model})`}
                    >
                      💰 {formatKRW(currentResult._costKrw)}
                    </span>
                  )}
                </div>
                <div className="text-xl font-extrabold" style={{ color: '#2F2A26' }}>
                  {PAGE_TITLES[currentPage]}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap items-center justify-end">
                {/* P5 버전 선택만 유지 — PNG/HTML/다시생성/다음 버튼은 상단 헤더로 이동됨 */}
                {currentPage === 'P5' && currentResult?.copy && (
                  <select value={p5Version} onChange={(e) => setP5Version(e.target.value)} className="input" style={{ width: 'auto', padding: '8px 10px' }}>
                    <option value="text">글 버전</option>
                    <option value="photo">사진 버전</option>
                  </select>
                )}
              </div>
            </div>

            {error && (
              <div
                className="p-4 rounded-lg border-2 mb-3 text-sm font-semibold"
                style={{
                  backgroundColor: '#fef2f2',
                  borderColor: '#ef4444',
                  color: '#991b1b',
                  whiteSpace: 'pre-line',  // \n 줄바꿈 표시
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            )}

            {/* AI가 채울 항목 미리 보여주기 — 경고만, 차단하지 않음 */}
            {(() => {
              const common = validateCommonBrief(brief, images);
              const specific = validatePageRequirements(currentPage, brief);
              const allWarnings = [...(common.warnings || []), ...(specific.warnings || [])];
              if (allWarnings.length === 0 || !common.ok) return null;
              return (
                <div className="p-3 rounded-lg border mb-3 text-xs" style={{ backgroundColor: '#FFF8F0', borderColor: '#FDBA74', color: '#9A3412' }}>
                  <div className="font-bold mb-1">🤖 빈 칸이 있습니다 — 페이지 생성 시 AI가 자동으로 채웁니다</div>
                  <ul className="list-disc list-inside">
                    {allWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                  <div className="mt-1 text-[11px]">
                    💡 더 좋은 결과를 위해 위 섹션의 <b>🪄 빈 칸 채우기</b> 버튼을 먼저 눌러주세요.
                  </div>
                </div>
              );
            })()}

            {currentResult?.needsMoreInfo && (
              <div className="p-3 rounded-lg border text-sm mb-3" style={{ backgroundColor: '#fff7ed', borderColor: '#fdba74', color: '#9a3412' }}>
                <div className="font-bold mb-1">ℹ️ 정보가 부족합니다</div>
                <ul className="list-disc list-inside text-xs">
                  {currentResult.missingItems?.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}

            {/* 🗑 (2026-04-28 사용자 요청) "사용 사진" / "디자인/배치 지시" 카드 제거 — 화면 공간 절약
                데이터(currentResult.usedPhotos / designNotes)는 그대로 유지 — AI 응답엔 영향 없음 */}

            {!currentResult && !isLoading && (
              <div className="p-6 rounded-xl text-center text-sm border-2 border-dashed" style={{ borderColor: '#C8B6A6', backgroundColor: '#F7F3EE', color: '#6b635c' }}>
                좌측에 정보를 입력한 뒤 상단 <b>{currentPage} 생성</b> 버튼을 눌러주세요.
              </div>
            )}

            {/* ⏱ 페이지 생성 진행률 (예상 시간 표시) */}
            {generationProgress && (() => {
              void progressTick; // 1초마다 리렌더 트리거
              const elapsedSec = Math.max(0, Math.floor((Date.now() - generationProgress.startedAt) / 1000));
              const avgSec = generationProgress.avgSec;
              const pct = Math.min(95, Math.round((elapsedSec / avgSec) * 100)); // 100% 안 채워서 답답함 방지
              const remainSec = Math.max(1, avgSec - elapsedSec);
              const isOverdue = elapsedSec > avgSec;
              return (
                <div
                  className="p-4 rounded-xl border-2"
                  style={{
                    borderColor: '#C8B6A6',
                    backgroundColor: '#FFFBEB',
                    boxShadow: '0 2px 8px rgba(200,182,166,0.15)',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-bold flex items-center gap-2" style={{ color: '#92400E' }}>
                      <span className="inline-block animate-pulse">🔄</span>
                      {generationProgress.pageNumber} {generationProgress.isRevision ? '수정' : '생성'} 중...
                    </div>
                    <div className="text-xs font-bold" style={{ color: isOverdue ? '#dc2626' : '#92400E' }}>
                      {isOverdue ? '⏳ 거의 완료' : `⏱ 약 ${remainSec}초 남음`}
                    </div>
                  </div>
                  {/* 프로그레스 바 */}
                  <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#FDE68A' }}>
                    <div
                      className="h-full transition-all duration-1000"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: isOverdue ? '#F59E0B' : '#C8B6A6',
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[10px]" style={{ color: '#92400E', opacity: 0.8 }}>
                    <span>경과 {elapsedSec}초 / 평균 {avgSec}초</span>
                    <span>{pct}%</span>
                  </div>
                  {isOverdue && (
                    <div className="mt-2 text-[11px]" style={{ color: '#92400E' }}>
                      💡 평균보다 오래 걸리고 있어요. 응답이 길거나 서버가 혼잡할 때 발생할 수 있습니다.
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 수정 요청 채팅창 — 접기/펼치기 (기본: 접힘) */}
            {currentResult?.copy && (
              <div
                className="mt-4 rounded-xl border-2"
                style={{ borderColor: '#C8B6A6', backgroundColor: '#F7F3EE' }}
              >
                {/* 헤더 — 클릭하면 토글 */}
                <button
                  type="button"
                  onClick={() => setFeedbackExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                  style={{ cursor: 'pointer' }}
                  title={feedbackExpanded ? '채팅창 접기' : '채팅창 펼치기'}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: '#2F2A26' }}>
                      💬 {currentPage} 수정 요청 — AI에게 자연어로 지시
                    </span>
                    {revisionHistory[currentPage]?.length > 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ backgroundColor: '#E87A2B', color: '#fff' }}
                      >
                        {revisionHistory[currentPage].length}
                      </span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: '#6b635c' }}>
                    {feedbackExpanded ? '▲ 접기' : '▼ 펼치기'}
                  </span>
                </button>

                {/* 본문 — 펼쳤을 때만 표시 */}
                {feedbackExpanded && (
                  <div className="px-4 pb-4">
                    {revisionHistory[currentPage]?.length > 0 && (
                      <div className="flex items-center justify-end mb-2">
                        <button
                          onClick={() => setRevisionHistory((prev) => ({ ...prev, [currentPage]: [] }))}
                          className="text-[10px] text-slate-500 hover:text-slate-700 underline"
                          title="수정 누적 초기화 (다음 수정부터 이전 지시가 반영되지 않음)"
                        >
                          🔄 히스토리 초기화
                        </button>
                      </div>
                    )}

                    {/* 수정 히스토리 */}
                    {revisionHistory[currentPage]?.length > 0 && (
                      <div className="mb-2 space-y-1 max-h-24 overflow-auto">
                        {revisionHistory[currentPage].map((h, i) => (
                          <div key={i} className="text-[11px] p-1.5 rounded bg-white flex items-start gap-1" style={{ color: '#6b635c' }}>
                            <span className="font-bold whitespace-nowrap">#{i + 1} [{h.at}]</span>
                            <span className="flex-1">{h.feedback}</span>
                          </div>
                        ))}
                        <div className="text-[10px] text-emerald-700 font-semibold">
                          ✓ 위 {revisionHistory[currentPage].length}개 수정이 누적되어 다음 요청에도 유지됩니다.
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <textarea
                        value={feedbackInput}
                        onChange={(e) => setFeedbackInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleRevise();
                          }
                        }}
                        placeholder="예) 메인 헤드라인 더 짧게 / 강점 2번 타이틀을 '안심 소재'로 / 트러스트 라인 지워줘"
                        rows={2}
                        className="input flex-1 text-[12px]"
                        style={{ resize: 'vertical', minHeight: 48 }}
                        disabled={isRevising}
                      />
                      <button
                        onClick={handleRevise}
                        disabled={isRevising || !feedbackInput.trim()}
                        className="px-3 py-2 rounded-lg text-white text-xs font-bold shadow disabled:opacity-50 whitespace-nowrap"
                        style={{ backgroundColor: '#E87A2B' }}
                      >
                        {isRevising ? '수정 중...' : '✨ 수정 반영'}
                      </button>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                      💡 <b>텍스트 수정</b>: 지워달라 / 바꿔달라 / 더 짧게 등 (이전 수정도 누적 반영)<br />
                      📷 <b>사진 교체</b>는 편집 모드에서 사진 클릭 후 우측 <b>↔ 사진 변경</b> 버튼 사용<br />
                      ⌨️ Ctrl/⌘ + Enter로 바로 전송
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 미리보기 */}
          <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: '#e2ddd4' }}>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-sm font-bold" style={{ color: '#2F2A26' }}>{currentPage} 미리보기</div>
              <div className="flex items-center gap-2">
                {/* 🔄 Undo/Redo 버튼 — 항상 표시 */}
                <div className="flex items-center gap-1 mr-1">
                  <button
                    onClick={undoHistory.undo}
                    disabled={!undoHistory.canUndo}
                    className="text-[11px] font-bold px-2 py-1 rounded border transition-all"
                    style={{
                      backgroundColor: undoHistory.canUndo ? '#fff' : '#f5f1ec',
                      borderColor: undoHistory.canUndo ? '#C8B6A6' : '#e2ddd4',
                      color: undoHistory.canUndo ? '#2F2A26' : '#bcb5ad',
                      cursor: undoHistory.canUndo ? 'pointer' : 'not-allowed',
                    }}
                    title={
                      undoHistory.canUndo
                        ? `실행취소 (Ctrl+Z)\n마지막: ${undoHistory.lastLabel || ''}`
                        : '되돌릴 변경 내역 없음'
                    }
                  >
                    ⏪ 실행취소
                  </button>
                  <button
                    onClick={undoHistory.redo}
                    disabled={!undoHistory.canRedo}
                    className="text-[11px] font-bold px-2 py-1 rounded border transition-all"
                    style={{
                      backgroundColor: undoHistory.canRedo ? '#fff' : '#f5f1ec',
                      borderColor: undoHistory.canRedo ? '#C8B6A6' : '#e2ddd4',
                      color: undoHistory.canRedo ? '#2F2A26' : '#bcb5ad',
                      cursor: undoHistory.canRedo ? 'pointer' : 'not-allowed',
                    }}
                    title={
                      undoHistory.canRedo
                        ? `다시실행 (Ctrl+Y)\n다음: ${undoHistory.nextLabel || ''}`
                        : '다시 실행할 내역 없음'
                    }
                  >
                    ⏩ 다시실행
                  </button>
                </div>
                {currentResult?.copy && (
                  <>
                    <button
                      onClick={() => setEditMode((v) => !v)}
                      className="text-[11px] font-bold px-2.5 py-1 rounded border-2 transition-all"
                      style={{
                        backgroundColor: editMode ? '#E87A2B' : '#fff',
                        borderColor: editMode ? '#E87A2B' : '#C8B6A6',
                        color: editMode ? '#fff' : '#2F2A26',
                      }}
                      title="더블클릭으로 텍스트 직접 수정 · 드래그로 위치 이동 · 툴바로 스타일 변경"
                    >
                      {editMode ? '✓ 편집 중 (끄기)' : '✏️ 인라인 편집'}
                    </button>
                    {(Object.keys(textOverrides[currentPage] || {}).length > 0 ||
                      Object.keys(imageOverrides[currentPage] || {}).length > 0) && (
                      <button
                        onClick={() => {
                          if (window.confirm(`${currentPage}의 인라인 편집 내용을 모두 되돌릴까요?`)) {
                            resetPageOverrides(currentPage);
                          }
                        }}
                        className="text-[10px] font-bold px-2 py-1 rounded border"
                        style={{ borderColor: '#e2ddd4', color: '#6b635c' }}
                        title="이 페이지의 인라인 편집 전부 초기화"
                      >
                        ↺ 편집 초기화
                      </button>
                    )}
                  </>
                )}
                {/* 📱 디바이스 미리보기 토글 */}
                <div
                  className="flex items-center rounded-lg overflow-hidden border"
                  style={{ borderColor: '#C8B6A6' }}
                  title="미리보기 디바이스 전환"
                >
                  {[
                    { key: 'pc',         label: '🖥 PC',        sub: '780px' },
                    // 2026-04-29: 태블릿 모드 사용자 요청으로 미리보기 옵션에서 제거
                    // (구현 코드는 하단에 유지 — 향후 복구 시 이 배열에 다시 추가하면 됨)
                    { key: 'mobile',     label: '📱 모바일',    sub: '360px' },
                    { key: 'mobileFull', label: '📜 전체',      sub: 'P1~P10 모바일' },
                    { key: 'split',      label: '🔀 동시',      sub: 'PC+모바일' },
                  ].map((m, idx, arr) => (
                    <button
                      key={m.key}
                      onClick={() => setPreviewMode(m.key)}
                      className="text-[11px] font-bold px-2.5 py-1 transition-all"
                      style={{
                        backgroundColor: previewMode === m.key ? '#2F2A26' : '#fff',
                        color: previewMode === m.key ? '#fff' : '#2F2A26',
                        borderRight: idx < arr.length - 1 ? '1px solid #e2ddd4' : 'none',
                        whiteSpace: 'nowrap',
                      }}
                      title={`${m.label} — ${m.sub}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {editMode && (
              <div
                className="text-[11px] mb-2 px-3 py-2 rounded-lg border leading-relaxed"
                style={{ backgroundColor: '#FFF8F0', borderColor: '#FDBA74', color: '#9A3412' }}
              >
                ✏️ <b>편집 모드</b> — 텍스트: <b>더블클릭</b>으로 글자 수정 · <b>클릭</b>으로 폰트/크기/색상 툴바 · <b>드래그</b>로 위치 이동 / 사진: 우하단 <b>파란 핸들</b>을 드래그해서 크기 조절 (ESC로 편집 종료)
                <br />
                ⌨️ <b>미세 이동</b> — 요소 선택 후 <b>화살표 키 = 1px</b> · <b>Shift+화살표 = 10px</b> · <b>Alt+드래그 = 자동 정렬(스냅) OFF</b> (자유 이동)
              </div>
            )}
            <div className="rounded-xl overflow-auto flex justify-center py-4 gap-6" style={{ backgroundColor: '#f0ebe4', maxHeight: 'calc(100vh - 260px)' }}>
              {currentResult?.copy && !currentResult.needsMoreInfo ? (() => {
                // 페이지 콘텐츠 — 한번만 정의, 모드별로 다른 wrapper에 넣음
                const renderPage = (refToUse, deviceMode) => (
                  <PageRenderer
                    ref={refToUse}
                    pageNumber={currentPage}
                    copy={{ ...currentResult.copy, p1CardSettings: brief.p1CardSettings }}
                    images={images}
                    version={p5Version}
                    variant={pageVariants[currentPage] || 0}
                    // 편집은 PC 모드(또는 split의 PC면)에서만 — 모바일은 미리보기 전용
                    editMode={editMode && deviceMode === 'pc'}
                    overrides={textOverrides[currentPage] || {}}
                    onOverrideChange={(textId, partial) => updateTextOverride(currentPage, textId, partial)}
                    imageOverrides={imageOverrides[currentPage] || {}}
                    onImageOverrideChange={(imageId, partial) => updateImageOverride(currentPage, imageId, partial)}
                    freeImages={freeImages[currentPage] || []}
                    onAddFreeImage={(src) => addFreeImage(currentPage, src)}
                    onAddFreeImageToSlot={(slot, src) => addFreeImageToSlot(currentPage, slot, src)}
                    onUpdateFreeImage={(id, partial) => updateFreeImage(currentPage, id, partial)}
                    onDeleteFreeImage={(id) => deleteFreeImage(currentPage, id)}
                    freeTexts={freeTexts[currentPage] || []}
                    onAddFreeText={() => addFreeText(currentPage)}
                    onUpdateFreeText={(id, partial) => updateFreeText(currentPage, id, partial)}
                    onDeleteFreeText={(id) => deleteFreeText(currentPage, id)}
                    shapes={shapes[currentPage] || []}
                    onAddShape={(type, geometry) => addShape(currentPage, type, geometry)}
                    onUpdateShape={(id, partial) => updateShape(currentPage, id, partial)}
                    onDeleteShape={(id) => deleteShape(currentPage, id)}
                    onChangeLayer={(id, action) => changeLayer(currentPage, id, action)}
                    onChangeLayerKind={(kind, id, action, mainLayers) =>
                      changeLayerNormalized(currentPage, kind, id, action, mainLayers)
                    }
                    onReorderLayers={(newOrder) => reorderLayers(currentPage, newOrder)}
                    onToggleLayerVisibility={(kind, id) => toggleLayerVisibility(currentPage, kind, id)}
                    layerNames={layerNames[currentPage] || {}}
                    onSetLayerName={(layerId, name) => setLayerName(currentPage, layerId, name)}
                    activeLayerId={activeLayerId}
                    onSetActiveLayer={setActiveLayerId}
                  />
                );

                // 모바일 폰 프레임 wrapper
                // 실제 콘텐츠는 780px이지만, 모바일에서는 360/780 = 0.4615 배율로 축소
                // 🆕 폰 화면 높이는 고정 (실제 핸드폰처럼) → 내부 콘텐츠가 길면 스크롤
                const MOBILE_W = 360;
                const MOBILE_H = 720; // 실제 핸드폰 비율 (16:9, iPhone 14 Pro 정도)
                const SCALE = MOBILE_W / 780;
                const MobileFrame = ({ children, label }) => (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {label && (
                      <div className="text-[11px] font-bold mb-2 px-2 py-0.5 rounded" style={{ backgroundColor: '#fff', color: '#2F2A26', border: '1px solid #e2ddd4' }}>
                        {label}
                      </div>
                    )}
                    <div style={{
                      width: MOBILE_W + 24, // 폰 베젤 양옆 12px씩
                      backgroundColor: '#1e293b',
                      borderRadius: 28,
                      padding: '36px 12px 36px',
                      boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
                      position: 'relative',
                    }}>
                      {/* 노치 */}
                      <div style={{
                        position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                        width: 80, height: 16, backgroundColor: '#0f172a', borderRadius: 999,
                      }} />
                      {/* 📱 화면 영역 — 고정 높이로 안에서만 스크롤 */}
                      <div style={{
                        width: MOBILE_W,
                        height: MOBILE_H,
                        backgroundColor: '#fff',
                        borderRadius: 6,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        // 모바일 느낌의 부드러운 스크롤
                        WebkitOverflowScrolling: 'touch',
                        // 스크롤바 살짝 보이게 (선택)
                        scrollbarWidth: 'thin',
                      }}>
                        {/* children 은 ScaledHeightWrap 으로 감싼 상태 — 안에서 scale 처리 */}
                        {children}
                      </div>
                      {/* 하단 홈 인디케이터 */}
                      <div style={{
                        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                        width: 100, height: 4, backgroundColor: '#475569', borderRadius: 999,
                      }} />
                    </div>
                  </div>
                );

                const PCFrame = ({ children, label }) => (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {label && (
                      <div className="text-[11px] font-bold mb-2 px-2 py-0.5 rounded" style={{ backgroundColor: '#fff', color: '#2F2A26', border: '1px solid #e2ddd4' }}>
                        {label}
                      </div>
                    )}
                    {children}
                  </div>
                );

                if (previewMode === 'mobile') {
                  // ⚠️ 모바일 단독 모드: 스케일 컨테이너의 height는 inner * scale 이어야 잘림 방지
                  return (
                    <div style={{ position: 'relative' }}>
                      <MobileFrame>
                        <ScaledHeightWrap scale={SCALE}>
                          {renderPage(pageRefs[currentPage], 'mobile')}
                        </ScaledHeightWrap>
                      </MobileFrame>
                    </div>
                  );
                }

                // 📲 태블릿 모드 (560px ≈ 0.72배 축소)
                if (previewMode === 'tablet') {
                  const TABLET_W = 560;
                  const TABLET_SCALE = TABLET_W / 780;
                  return (
                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                      <div
                        style={{
                          width: TABLET_W + 24,
                          padding: 12,
                          background: '#1f2937',
                          borderRadius: 28,
                          boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
                        }}
                      >
                        <div
                          style={{
                            width: TABLET_W,
                            background: '#fff',
                            borderRadius: 18,
                            overflow: 'hidden',
                          }}
                        >
                          <ScaledHeightWrap scale={TABLET_SCALE}>
                            {renderPage(pageRefs[currentPage], 'tablet')}
                          </ScaledHeightWrap>
                        </div>
                      </div>
                    </div>
                  );
                }

                // 🆕 전체 모드: 생성된 모든 페이지(P1~P10)를 세로로 이어붙여 핸드폰 안에서 스크롤
                if (previewMode === 'mobileFull') {
                  const generatedPages = PAGE_LIST.filter((p) => pages[p]?.copy && !pages[p].needsMoreInfo);
                  if (generatedPages.length === 0) {
                    return (
                      <div className="text-xs text-slate-400 py-20 text-center">
                        먼저 페이지를 생성해주세요 (P1부터).
                      </div>
                    );
                  }
                  // 각 페이지를 PageRenderer 로 렌더 (편집 OFF)
                  const renderPageFor = (pageKey) => {
                    const result = pages[pageKey];
                    if (!result?.copy) return null;
                    return (
                      <PageRenderer
                        key={pageKey}
                        pageNumber={pageKey}
                        copy={{ ...result.copy, p1CardSettings: brief.p1CardSettings }}
                        images={images}
                        version={p5Version}
                        variant={pageVariants[pageKey] || 0}
                        editMode={false}
                        overrides={textOverrides[pageKey] || {}}
                        onOverrideChange={() => {}}
                        imageOverrides={imageOverrides[pageKey] || {}}
                        onImageOverrideChange={() => {}}
                        freeImages={freeImages[pageKey] || []}
                        onAddFreeImage={() => {}}
                        onAddFreeImageToSlot={() => {}}
                        onUpdateFreeImage={() => {}}
                        onDeleteFreeImage={() => {}}
                        freeTexts={freeTexts[pageKey] || []}
                        onAddFreeText={() => {}}
                        onUpdateFreeText={() => {}}
                        onDeleteFreeText={() => {}}
                        shapes={shapes[pageKey] || []}
                        onAddShape={() => {}}
                        onUpdateShape={() => {}}
                        onDeleteShape={() => {}}
                        onChangeLayer={() => {}}
                        onChangeLayerKind={() => {}}
                        onReorderLayers={() => {}}
                        onToggleLayerVisibility={() => {}}
                        layerNames={layerNames[pageKey] || {}}
                        onSetLayerName={() => {}}
                        activeLayerId={null}
                        onSetActiveLayer={() => {}}
                      />
                    );
                  };
                  return (
                    <div style={{ position: 'relative' }}>
                      <MobileFrame label={`📜 전체 (${generatedPages.length}개 페이지)`}>
                        <ScaledHeightWrap scale={SCALE}>
                          <div style={{ width: 780, display: 'flex', flexDirection: 'column' }}>
                            {generatedPages.map((p) => (
                              <div key={p} style={{ position: 'relative' }}>
                                {/* 페이지 구분 라벨 (선택) */}
                                <div style={{
                                  position: 'absolute', top: 8, left: 8, zIndex: 9999,
                                  fontSize: 14, fontWeight: 700, color: '#fff',
                                  backgroundColor: 'rgba(47,42,38,0.85)',
                                  padding: '4px 10px', borderRadius: 6,
                                  pointerEvents: 'none',
                                }}>
                                  {p}
                                </div>
                                {renderPageFor(p)}
                              </div>
                            ))}
                          </div>
                        </ScaledHeightWrap>
                      </MobileFrame>
                    </div>
                  );
                }

                if (previewMode === 'split') {
                  return (
                    <>
                      <PCFrame label="🖥 PC (780px) — 편집 가능">
                        {renderPage(pageRefs[currentPage], 'pc')}
                      </PCFrame>
                      <MobileFrame label="📱 모바일 (360px)">
                        <ScaledHeightWrap scale={SCALE}>
                          {/* split 의 모바일은 별도 ref 없음 — 시각 미리보기용 */}
                          {renderPage(null, 'mobile')}
                        </ScaledHeightWrap>
                      </MobileFrame>
                    </>
                  );
                }

                // 기본 PC 모드 — PCFrame 없이 직접 렌더 (5185 방식, 사진편집 정상화)
                return renderPage(pageRefs[currentPage], 'pc');
              })() : (
                <div className="text-xs text-slate-400 py-20 text-center">
                  {currentPage} 생성 후 이곳에 미리보기가 표시됩니다.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ───── 화면 밖 숨김 렌더링 영역 ─────
          전체 내보내기를 위해 모든 완성된 페이지를 항상 DOM에 마운트해두고,
          html2canvas가 ref로 캡처할 수 있도록 한다. 사용자에게는 보이지 않음. */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          left: -100000,
          top: 0,
          width: 780,
          pointerEvents: 'none',
          opacity: 0,
        }}
      >
        {PAGE_LIST.map((p) => {
          const r = pages[p];
          if (!r?.copy || r?.needsMoreInfo) return null;
          return (
            <div key={`export-${p}`} style={{ width: 780 }}>
              <PageRenderer
                ref={exportPageRefs[p]}
                pageNumber={p}
                copy={{ ...r.copy, p1CardSettings: brief.p1CardSettings }}
                images={images}
                version={p5Version}
                variant={pageVariants[p] || 0}
                editMode={false}
                overrides={textOverrides[p] || {}}
                onOverrideChange={() => {}}
                imageOverrides={imageOverrides[p] || {}}
                onImageOverrideChange={() => {}}
                freeImages={freeImages[p] || []}
                onAddFreeImage={() => {}}
                onAddFreeImageToSlot={() => {}}
                onUpdateFreeImage={() => {}}
                onDeleteFreeImage={() => {}}
                freeTexts={freeTexts[p] || []}
                onAddFreeText={() => {}}
                onUpdateFreeText={() => {}}
                onDeleteFreeText={() => {}}
                shapes={shapes[p] || []}
                onAddShape={() => {}}
                onUpdateShape={() => {}}
                onDeleteShape={() => {}}
                onChangeLayer={() => {}}
                onChangeLayerKind={() => {}}
                onReorderLayers={() => {}}
                onToggleLayerVisibility={() => {}}
                layerNames={layerNames[p] || {}}
                onSetLayerName={() => {}}
                activeLayerId={null}
                onSetActiveLayer={() => {}}
              />
            </div>
          );
        })}
      </div>

      {/* 🎨 AI 사진 합성 플로팅 버튼 (편집모드에서만, '도형 추가' 바로 밑) */}
      <AISynthesisFloatingButton
        editMode={editMode}
        apiKey={apiKey}
        falApiKey={falApiKey}
        productName={brief.productName}
        uploadedImages={images}
        activeImageSrc={activeImageSrc}
        currentPage={currentPage}
        onAddImages={(urls) => {
          if (!Array.isArray(urls) || !urls.length) return;
          setImages((prev) => [...prev, ...urls]);
        }}
      />

      {/* 전체 내보내기 진행 토스트 */}
      {exportProgress && (
        <div
          className="fixed bottom-6 right-6 bg-white border rounded-xl shadow-2xl px-5 py-4 z-50"
          style={{ borderColor: '#e2ddd4', minWidth: 260 }}
        >
          <div className="text-xs font-bold mb-2" style={{ color: '#2F2A26' }}>
            📦 전체 내보내기 진행 중
          </div>
          <div className="text-[11px] text-slate-600 mb-2">{exportProgress.label}</div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${exportProgress.total ? (exportProgress.done / exportProgress.total) * 100 : 0}%`,
                backgroundColor: '#C8B6A6',
              }}
            />
          </div>
          <div className="text-[10px] text-slate-500 mt-1 text-right">
            {exportProgress.done} / {exportProgress.total}
          </div>
        </div>
      )}

      <style>{`
        .input {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid #e2ddd4;
          border-radius: 7px;
          font-size: 13px;
          background: #fff;
          outline: none;
          color: #2F2A26;
        }
        .input:focus { border-color: #C8B6A6; box-shadow: 0 0 0 3px rgba(200,182,166,.2); }
        textarea.input { line-height: 1.5; }
      `}</style>

      {/* 🎓 온보딩 튜토리얼 */}
      <OnboardingTour
        open={onboardingOpen}
        onClose={handleCloseOnboarding}
        startStep={onboardingStartStep}
      />
    </div>
  );
}

