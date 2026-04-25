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
  // - 본문 텍스트/사진과 안 겹치도록 페이지 본문 콘텐츠 아래에 떨어뜨림
  const addFreeImage = (pageNum, src) => {
    setFreeImages((prev) => {
      const list = prev[pageNum] || [];
      const id = 'free_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const NEW_W = 480;
      const NEW_H = 360;
      const GAP = 24;
      const PAGE_W = 780;
      const x = Math.round((PAGE_W - NEW_W) / 2);

      // 페이지별 본문 콘텐츠 baseHeight
      const PAGE_BASE_HEIGHT = {
        P1: 1500, P2: 1300, P3: 1450, P4: 1300, P5: 1300,
        P6: 1300, P7: 1500, P8: 1350, P9: 1300, P10: 1500,
      };
      const baseHeight = PAGE_BASE_HEIGHT[pageNum] || 1300;

      // 자유 위치 사진들(slot=null)의 가장 아래 끝
      const freeOnly = list.filter((it) => !it.slot);
      const maxBottom = freeOnly.reduce(
        (max, it) => Math.max(max, (it.y || 0) + (it.h || 0)),
        0
      );
      const y = Math.max(baseHeight, maxBottom) + GAP;

      const newItem = {
        id, src, x, y, w: NEW_W, h: NEW_H,
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
    setFreeImages((prev) => {
      const list = prev[pageNum] || [];
      return {
        ...prev,
        [pageNum]: list.filter((it) => it.id !== id),
      };
    });
  };

  // ─── 🟦 도형 CRUD ─────────────────────────────────────────────────
  // 도형 추가 (페이지 가운데 근처에 기본 크기로)
  const addShape = (pageNum, type) => {
    setShapes((prev) => {
      const list = prev[pageNum] || [];
      const id = 'shape_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      // 페이지별 본문 baseHeight (도형은 자유 위치라 본문과 안 겹치게 아래쪽에 배치)
      const PAGE_BASE_HEIGHT = {
        P1: 1500, P2: 1300, P3: 1450, P4: 1300, P5: 1300,
        P6: 1300, P7: 1500, P8: 1350, P9: 1300, P10: 1500,
      };
      const baseY = (PAGE_BASE_HEIGHT[pageNum] || 1300);
      // 페이지 폭 780, 가운데 배치
      const PAGE_W = 780;

      // 종류별 기본 모양
      const presets = {
        rect:      { w: 240, h: 160, stroke: '#ef4444', strokeWidth: 4, fill: 'none',          opacity: 1 },
        circle:    { w: 200, h: 200, stroke: '#ef4444', strokeWidth: 4, fill: 'none',          opacity: 1 },
        line:      { w: 280, h: 4,   stroke: '#1f2937', strokeWidth: 4, fill: 'none',          opacity: 1 },
        arrow:     { w: 240, h: 60,  stroke: '#1f2937', strokeWidth: 4, fill: 'none',          opacity: 1 },
        highlight: { w: 320, h: 80,  stroke: 'none',    strokeWidth: 0, fill: '#fde047',       opacity: 0.5 },
      };
      const p = presets[type] || presets.rect;

      // 같은 페이지에 이미 있는 도형들의 가장 아래 끝 + 24px (겹침 방지)
      const existingMaxBottom = list.reduce(
        (max, it) => Math.max(max, (it.y || 0) + (it.h || 0)),
        0
      );
      const y = Math.max(baseY, existingMaxBottom) + 24;

      const newShape = {
        id, type,
        x: Math.round((PAGE_W - p.w) / 2),
        y,
        ...p,
        zIndex: 700 + list.length,
      };
      return { ...prev, [pageNum]: [...list, newShape] };
    });
  };

  const updateShape = (pageNum, id, partial) => {
    setShapes((prev) => {
      const list = prev[pageNum] || [];
      return {
        ...prev,
        [pageNum]: list.map((it) => (it.id === id ? { ...it, ...partial } : it)),
      };
    });
  };

  const deleteShape = (pageNum, id) => {
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
    return [...mains, ...free, ...inlineList, ...shapeList].sort((a, b) => b.zIndex - a.zIndex);
  };

  // 단건 레이어 액션: front/back/forward/backward
  // mainLayers를 받아서 전체 정규화 후 1..N 으로 재할당
  const changeLayerNormalized = (pageNum, kind, id, action, mainLayers = []) => {
    const ordered = getOrderedLayers(pageNum, mainLayers);
    const idx = ordered.findIndex((l) => l.kind === kind && l.id === id);
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

  // 텍스트 오버라이드 업데이트 헬퍼 (페이지 + 텍스트ID + 부분 override 병합)
  const updateTextOverride = (pageNum, textId, partial) => {
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
          if (saved.shapes) setShapes(saved.shapes);
          if (saved.layerNames) setLayerNames(saved.layerNames);
          if (saved.p5Version) setP5Version(saved.p5Version);
          if (saved.revisionHistory) setRevisionHistory(saved.revisionHistory);
          setLastSavedAt(getLastSaved());
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
      textOverrides, imageOverrides, freeImages, shapes, layerNames, p5Version, revisionHistory,
    });
  }, [hydrated, brief, images, pages, currentPage, pageVariants,
      textOverrides, imageOverrides, freeImages, shapes, layerNames, p5Version, revisionHistory]);

  // 수동 내보내기 (JSON 파일로 다운로드)
  const handleExportProject = useCallback(() => {
    const productName = (brief.productName || 'project').trim().slice(0, 30).replace(/[^\w가-힣]/g, '_') || 'project';
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `coupang-${productName}-${stamp}.json`;
    downloadProjectJSON({
      brief, images, pages, currentPage, pageVariants,
      textOverrides, imageOverrides, freeImages, shapes, layerNames, p5Version, revisionHistory,
    }, filename);
  }, [brief, images, pages, currentPage, pageVariants, textOverrides, imageOverrides, freeImages, shapes, layerNames, p5Version, revisionHistory]);

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
      setShapes(data.shapes || {});
      setLayerNames(data.layerNames || {});
      setP5Version(data.p5Version || 'text');
      setRevisionHistory(data.revisionHistory || {});
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
    setLayerNames({});
    setP5Version('text');
    setRevisionHistory({});
    setExtractResult(null);
    setReferenceUrl('');
    setPastedText('');
    setUserNotes('');
    setError('');
    setLastSavedAt(null);
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

      // AI가 needsMoreInfo: true로 답하면 에러로 표시
      if (result?.needsMoreInfo) {
        const items = (result.missingItems || []).join(', ');
        setError(`🤖 AI가 정보 부족으로 생성을 거부했습니다: ${items || '상세 정보 필요'}\n→ 섹션 3~5에서 더 구체적으로 입력하거나 '빈 칸 채우기'를 먼저 눌러주세요.`);
      }

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
            <div className="relative">
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
        {/* 페이지 탭 */}
        <div className="max-w-[1700px] mx-auto px-6 pb-2 flex gap-1 overflow-x-auto">
          {PAGE_LIST.map((p) => {
            const done = pages[p] && !pages[p].needsMoreInfo;
            const active = currentPage === p;
            return (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border"
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
        />

        {/* 우측: 현재 페이지 제작 + 미리보기 */}
        <section className="space-y-4">
          {/* 현재 페이지 제작 카드 */}
          <div className="bg-white rounded-2xl p-5 border" style={{ borderColor: '#e2ddd4' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-bold text-slate-500 mb-1">현재 작업 중</div>
                <div className="text-xl font-extrabold" style={{ color: '#2F2A26' }}>
                  {PAGE_TITLES[currentPage]}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap items-center justify-end">
                {currentPage === 'P5' && currentResult?.copy && (
                  <select value={p5Version} onChange={(e) => setP5Version(e.target.value)} className="input" style={{ width: 'auto', padding: '8px 10px' }}>
                    <option value="text">글 버전</option>
                    <option value="photo">사진 버전</option>
                  </select>
                )}

                {/* ⬇️ 다운로드 버튼들 — 결과가 있을 때만 표시 */}
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
                      style={{ borderColor: '#2F2A26', color: '#2F2A26' }}
                      title={`${currentPage} 페이지를 HTML 파일로 다운로드`}
                    >
                      📄 HTML
                    </button>
                  </>
                )}

                {/* 다시 생성 / 생성 */}
                <button
                  onClick={() => handleGenerate(currentPage)}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-lg text-white font-bold text-xs shadow"
                  style={{ backgroundColor: isLoading ? '#a89b8f' : '#C8B6A6' }}
                >
                  {isLoading ? '생성 중...' : currentResult ? `🔁 ${currentPage} 다시 생성` : `${currentPage} 생성`}
                </button>

                {/* ➡️ 다음 페이지 만들기 — 결과가 있을 때만 */}
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

            {currentResult?.copy && !currentResult.needsMoreInfo && (
              <>
                {/* 사용 사진 / 디자인 노트 — 다운로드/다음 버튼은 상단 헤더로 이동했음 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <InfoCard title="📷 사용 사진" items={currentResult.usedPhotos} />
                  <InfoCard title="🎨 디자인/배치 지시" items={currentResult.designNotes} />
                </div>
              </>
            )}

            {!currentResult && !isLoading && (
              <div className="p-6 rounded-xl text-center text-sm border-2 border-dashed" style={{ borderColor: '#C8B6A6', backgroundColor: '#F7F3EE', color: '#6b635c' }}>
                좌측에 정보를 입력한 뒤 상단 <b>{currentPage} 생성</b> 버튼을 눌러주세요.
              </div>
            )}

            {/* 수정 요청 채팅창 */}
            {currentResult?.copy && (
              <div
                className="mt-4 p-4 rounded-xl border-2"
                style={{ borderColor: '#C8B6A6', backgroundColor: '#F7F3EE' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold" style={{ color: '#2F2A26' }}>
                    💬 {currentPage} 수정 요청 — AI에게 자연어로 지시하세요
                  </div>
                  {revisionHistory[currentPage]?.length > 0 && (
                    <button
                      onClick={() => setRevisionHistory((prev) => ({ ...prev, [currentPage]: [] }))}
                      className="text-[10px] text-slate-500 hover:text-slate-700 underline"
                      title="수정 누적 초기화 (다음 수정부터 이전 지시가 반영되지 않음)"
                    >
                      🔄 히스토리 초기화
                    </button>
                  )}
                </div>

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

          {/* 미리보기 */}
          <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: '#e2ddd4' }}>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-sm font-bold" style={{ color: '#2F2A26' }}>{currentPage} 미리보기</div>
              <div className="flex items-center gap-2">
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
                    { key: 'mobile',     label: '📱 모바일',    sub: '360px' },
                    { key: 'mobileFull', label: '📜 전체',      sub: 'P1~P10 모바일' },
                    { key: 'split',      label: '🔀 동시',      sub: 'PC+모바일' },
                  ].map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setPreviewMode(m.key)}
                      className="text-[11px] font-bold px-2.5 py-1 transition-all"
                      style={{
                        backgroundColor: previewMode === m.key ? '#2F2A26' : '#fff',
                        color: previewMode === m.key ? '#fff' : '#2F2A26',
                        borderRight: m.key !== 'split' ? '1px solid #e2ddd4' : 'none',
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
                className="text-[11px] mb-2 px-3 py-2 rounded-lg border"
                style={{ backgroundColor: '#FFF8F0', borderColor: '#FDBA74', color: '#9A3412' }}
              >
                ✏️ <b>편집 모드</b> — 텍스트: <b>더블클릭</b>으로 글자 수정 · <b>클릭</b>으로 폰트/크기/색상 툴바 · <b>드래그</b>로 위치 이동 / 사진: 우하단 <b>파란 핸들</b>을 드래그해서 크기 조절 (ESC로 편집 종료)
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
                    shapes={shapes[currentPage] || []}
                    onAddShape={(type) => addShape(currentPage, type)}
                    onUpdateShape={(id, partial) => updateShape(currentPage, id, partial)}
                    onDeleteShape={(id) => deleteShape(currentPage, id)}
                    onChangeLayer={(id, action) => changeLayer(currentPage, id, action)}
                    onChangeLayerKind={(kind, id, action, mainLayers) =>
                      changeLayerNormalized(currentPage, kind, id, action, mainLayers)
                    }
                    onReorderLayers={(newOrder) => reorderLayers(currentPage, newOrder)}
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
                        shapes={shapes[pageKey] || []}
                        onAddShape={() => {}}
                        onUpdateShape={() => {}}
                        onDeleteShape={() => {}}
                        onChangeLayer={() => {}}
                        onChangeLayerKind={() => {}}
                        onReorderLayers={() => {}}
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

                // 기본 PC 모드
                return (
                  <PCFrame>
                    {renderPage(pageRefs[currentPage], 'pc')}
                  </PCFrame>
                );
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
                shapes={shapes[p] || []}
                onAddShape={() => {}}
                onUpdateShape={() => {}}
                onDeleteShape={() => {}}
                onChangeLayer={() => {}}
                onChangeLayerKind={() => {}}
                onReorderLayers={() => {}}
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
    </div>
  );
}

