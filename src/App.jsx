import { useEffect, useRef, useState, useCallback } from 'react';
import PageRenderer from './components/PageRenderer.jsx';
import {
  generateCoupangPage,
  validateCommonBrief,
  validatePageRequirements,
  extractProductInfoFromUrl,
  extractProductInfoFromText,
  autoFillBrief,
} from './lib/openai.js';
import { downloadAsImage, downloadAsHtml } from './lib/exporters.js';
import { THEME_PRESETS, applyTheme, FONT_PRESETS, applyFont } from './lib/theme.js';
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

const PRODUCT_TYPES = [
  '청소도구형',
  '수납형',
  '욕실/위생형',
  '주방정리형',
  '소모품형',
  '생활보조형',
  '인테리어소품형',
];

const DEFAULT_BRIEF = {
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
};

export default function App() {
  // API 설정
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');

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
  const [showPasteHint, setShowPasteHint] = useState(false); // Captcha 감지 시 true

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
  // 페이지별 텍스트 오버라이드
  // { P1: { "mainHeadline": { text, style, offset }, "subHeadline": {...}, ... } }
  const [textOverrides, setTextOverrides] = useState({});
  // 페이지별 이미지 오버라이드
  // { P1: { "heroImage": { scale }, ... } }
  const [imageOverrides, setImageOverrides] = useState({});

  // 페이지별 자유 배치 이미지 (사용자가 추가한 사진들)
  // { P1: [{ id, src, x, y, w, h, crop, zIndex }, ...] }
  const [freeImages, setFreeImages] = useState({});

  // 페이지별 레이어 사용자 지정 이름  { P1: { 'free_xxx': '메인꽃병', 'P1.heroImage': '메인사진' } }
  const [layerNames, setLayerNames] = useState({});

  // 페이지별 활성 레이어 ID — 클릭 관통 제어를 위해 한 번에 한 레이어만 인터랙티브
  // null = 비활성 (편집모드 OFF 또는 아무것도 선택 안 됨)
  const [activeLayerId, setActiveLayerId] = useState(null);

  // 편집 모드가 꺼지거나 페이지 전환 시 활성 레이어 해제
  useEffect(() => {
    setActiveLayerId(null);
  }, [editMode, currentPage]);

  const setLayerName = (pageNum, layerId, name) => {
    setLayerNames((prev) => ({
      ...prev,
      [pageNum]: { ...(prev[pageNum] || {}), [layerId]: name },
    }));
  };

  // 자유 이미지 추가
  const addFreeImage = (pageNum, src) => {
    setFreeImages((prev) => {
      const list = prev[pageNum] || [];
      const id = 'free_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      // 페이지 중앙 근처에 200×200 박스로 배치 (페이지 폭 780)
      const offsetIdx = list.length;
      // 신규 추가는 콘텐츠(500)보다 위에서 시작 → 메인사진/카드 위에 보임
      // 기존 자유이미지보다도 위에 오도록 list.length 만큼 누적
      const newItem = {
        id,
        src,
        x: 290 + (offsetIdx % 4) * 20,  // 살짝 어긋나게 배치
        y: 100 + (offsetIdx % 4) * 20,
        w: 200,
        h: 200,
        crop: null,
        zIndex: 501 + list.length,
      };
      return { ...prev, [pageNum]: [...list, newItem] };
    });
  };

  // 자유 이미지 업데이트
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

    // 자유이미지 z-index 일괄 적용
    setFreeImages((prev) => {
      const list = (prev[pageNum] || []).map((it) => {
        const z = zMap[`free:${it.id}`];
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
    const free = (freeImages[pageNum] || []).map((it) => ({
      kind: 'free',
      id: it.id,
      zIndex: it.zIndex ?? 1,
    }));
    const mains = mainLayers.map((m) => ({
      kind: 'main',
      id: m.id,
      zIndex: imageOverrides[pageNum]?.[m.id]?.zIndex ?? m.defaultZ ?? 1,
    }));
    return [...mains, ...free].sort((a, b) => b.zIndex - a.zIndex);
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
    const savedModel = localStorage.getItem('openai_model');
    if (savedModel) setModel(savedModel);
  }, []);
  useEffect(() => { if (apiKey) localStorage.setItem('openai_api_key', apiKey); }, [apiKey]);
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
      textOverrides, imageOverrides, freeImages, layerNames, p5Version, revisionHistory,
    });
  }, [hydrated, brief, images, pages, currentPage, pageVariants,
      textOverrides, imageOverrides, freeImages, layerNames, p5Version, revisionHistory]);

  // 수동 내보내기 (JSON 파일로 다운로드)
  const handleExportProject = useCallback(() => {
    const productName = (brief.productName || 'project').trim().slice(0, 30).replace(/[^\w가-힣]/g, '_') || 'project';
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `coupang-${productName}-${stamp}.json`;
    downloadProjectJSON({
      brief, images, pages, currentPage, pageVariants,
      textOverrides, imageOverrides, freeImages, layerNames, p5Version, revisionHistory,
    }, filename);
  }, [brief, images, pages, currentPage, pageVariants, textOverrides, imageOverrides, freeImages, layerNames, p5Version, revisionHistory]);

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
    if (extractMode === 'paste' && pastedText.trim().length < 50) {
      setError('상품 페이지 내용을 복사해 붙여넣어주세요. (최소 50자)');
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

        // 배열 필드는 빈 슬롯만 채움
        if (Array.isArray(info.strengths) && info.strengths.length > 0) {
          const next3 = [...b.strengths];
          info.strengths.slice(0, 3).forEach((s, i) => {
            if (!next3[i]?.trim() && s?.trim()) next3[i] = s;
          });
          if (JSON.stringify(next3) !== JSON.stringify(b.strengths)) {
            next.strengths = next3;
            filled.push('strengths');
          }
        }
        // 주 고객층 3개 (배열) — 구버전 문자열 응답도 호환
        const tcArr = Array.isArray(info.targetCustomers)
          ? info.targetCustomers
          : info.targetCustomer
          ? [info.targetCustomer]
          : [];
        if (tcArr.length > 0) {
          const nextTc = [...b.targetCustomers];
          tcArr.slice(0, 3).forEach((c, i) => {
            if (!nextTc[i]?.trim() && c?.trim()) nextTc[i] = c;
          });
          if (JSON.stringify(nextTc) !== JSON.stringify(b.targetCustomers)) {
            next.targetCustomers = nextTc;
            filled.push('targetCustomers');
          }
        }
        if (Array.isArray(info.differences) && info.differences.length > 0) {
          const next4 = [...b.differences];
          info.differences.slice(0, 4).forEach((d, i) => {
            if (!next4[i]?.trim() && d?.trim()) next4[i] = d;
          });
          if (JSON.stringify(next4) !== JSON.stringify(b.differences)) {
            next.differences = next4;
            filled.push('differences');
          }
        }
        if (Array.isArray(info.usages) && info.usages.length > 0) {
          const next4 = [...b.usages];
          info.usages.slice(0, 4).forEach((u, i) => {
            if (!next4[i]?.trim() && u?.trim()) next4[i] = u;
          });
          if (JSON.stringify(next4) !== JSON.stringify(b.usages)) {
            next.usages = next4;
            filled.push('usages');
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
        {/* 좌측: 입력 + 페이지 컨트롤 (사이드바 고정 + 개별 스크롤) */}
        <aside
          className="space-y-4 xl:sticky xl:overflow-y-auto xl:pr-2"
          style={{ top: '72px', maxHeight: 'calc(100vh - 88px)' }}
        >
          <Section title="1. OpenAI 설정" emoji="🔑">
            <Field label="API Key" required>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="input" />
            </Field>
            <Field label="모델">
              <select value={model} onChange={(e) => setModel(e.target.value)} className="input">
                <option value="gpt-4o-mini">gpt-4o-mini (빠르고 저렴)</option>
                <option value="gpt-4o">gpt-4o (고품질)</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                <option value="gpt-4.1">gpt-4.1</option>
              </select>
            </Field>
          </Section>

          <Section title="톤앤매너 (색상 테마)" emoji="🎨">
            <div className="text-[11px] text-slate-500 mb-2 leading-relaxed">
              상품 분위기에 맞는 컬러 팔레트를 선택하세요.
              <br />모든 P1~P10 페이지에 즉시 적용됩니다.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(THEME_PRESETS).map((t) => {
                const active = brief.themeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => updateBrief({ themeId: t.id })}
                    className="p-2 rounded-lg border-2 text-left transition-all"
                    style={{
                      borderColor: active ? t.colors.main : '#e2ddd4',
                      backgroundColor: active ? t.colors.sub : '#fff',
                      boxShadow: active ? `0 0 0 2px ${t.colors.main}33` : 'none',
                    }}
                  >
                    <div className="flex gap-1 mb-1.5">
                      {t.swatch.map((c, i) => (
                        <div
                          key={i}
                          className="w-5 h-5 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: t.colors.text }}>
                      {t.name}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {t.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ─────────── 폰트 선택 (전체 페이지 일괄 적용) ─────────── */}
          <Section title="폰트 (전체 페이지 일괄 변경)" emoji="🔤">
            <div className="text-[11px] text-slate-500 mb-2 leading-relaxed">
              선택한 폰트가 P1~P10 모든 페이지에 즉시 적용됩니다.
              <br />5종 무료 상업용 한글 폰트 제공.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(FONT_PRESETS).map((f) => {
                const active = brief.fontId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => updateBrief({ fontId: f.id })}
                    className="p-2 rounded-lg border-2 text-left transition-all"
                    style={{
                      borderColor: active ? '#C8B6A6' : '#e2ddd4',
                      backgroundColor: active ? '#F7F3EE' : '#fff',
                      boxShadow: active ? `0 0 0 2px rgba(200,182,166,0.3)` : 'none',
                      fontFamily: f.family,
                    }}
                  >
                    <div
                      className="text-[15px] font-bold mb-1"
                      style={{ color: '#2F2A26', fontFamily: f.family }}
                    >
                      {f.sample}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: '#2F2A26' }}>
                      {f.name}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {f.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="2. 참조 자료로 자동 채우기" emoji="🔗">
            {/* 모드 탭 */}
            <div className="flex gap-1 mb-2 p-1 rounded-lg" style={{ backgroundColor: '#F7F3EE' }}>
              <button
                type="button"
                onClick={() => setExtractMode('url')}
                className="flex-1 py-1.5 text-xs font-bold rounded transition-all"
                style={{
                  backgroundColor: extractMode === 'url' ? '#C8B6A6' : 'transparent',
                  color: extractMode === 'url' ? '#fff' : '#6b635c',
                }}
              >
                🌐 URL 입력
              </button>
              <button
                type="button"
                onClick={() => setExtractMode('paste')}
                className="flex-1 py-1.5 text-xs font-bold rounded transition-all"
                style={{
                  backgroundColor: extractMode === 'paste' ? '#C8B6A6' : 'transparent',
                  color: extractMode === 'paste' ? '#fff' : '#6b635c',
                }}
              >
                📋 텍스트 붙여넣기
              </button>
            </div>

            {extractMode === 'url' ? (
              <>
                <div className="text-[11px] text-slate-500 mb-1 leading-relaxed">
                  쿠팡 · 네이버 등 <b>봇 차단이 약한 사이트</b>의 URL에 권장합니다.
                  <br />
                  <span style={{ color: '#C8B6A6' }}>※ 이미 입력된 칸은 덮어쓰지 않습니다.</span>
                  <br />
                  <span style={{ color: '#9a3412' }}>
                    ⚠️ 1688 · 타오바오 · aliprice는 봇 차단(Captcha) 때문에 실패할 수 있어요.
                    <br />→ 실패 시 위 <b>📋 텍스트 붙여넣기</b> 탭을 이용해주세요.
                  </span>
                </div>
                <Field label="참조 URL">
                  <input
                    type="url"
                    value={referenceUrl}
                    onChange={(e) => setReferenceUrl(e.target.value)}
                    placeholder="https://www.coupang.com/vp/products/... (1688은 붙여넣기 탭 권장)"
                    className="input"
                  />
                </Field>
              </>
            ) : (
              <>
                <div className="text-[11px] text-slate-500 mb-1 leading-relaxed">
                  <b>1688 · 타오바오 등 봇 차단 페이지용 대안입니다.</b>
                  <br />사용법:
                  <br />① 브라우저에서 상품 페이지 열기
                  <br />② <b>Ctrl+A → Ctrl+C</b>로 페이지 전체 복사
                  <br />③ 아래 칸에 <b>Ctrl+V</b>로 붙여넣기
                  <br />④ 아래 <b>✨ 내용 분석</b> 버튼 클릭
                  <br /><span style={{ color: '#C8B6A6' }}>※ 이미지는 복사 안되니 글 위주로 OK</span>
                </div>
                <Field label="페이지 내용 붙여넣기">
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="브라우저에서 상품 페이지 → Ctrl+A → Ctrl+C → 여기 Ctrl+V"
                    rows={10}
                    className="input font-mono text-[11px]"
                    style={{ resize: 'vertical', minHeight: '160px' }}
                  />
                </Field>
                <div className="text-[10px] text-slate-400 -mt-1">
                  현재 {pastedText.length.toLocaleString()}자 {pastedText.length >= 500 && '✓'}
                </div>
              </>
            )}

            {showPasteHint && extractMode === 'url' && (
              <div className="p-2 rounded text-[11px] font-bold" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                💡 봇 차단이 감지되었습니다. 위 <b>📋 텍스트 붙여넣기</b> 탭으로 전환해주세요.
              </div>
            )}

            <button
              onClick={handleAutoFillFromUrl}
              disabled={
                isExtracting ||
                (extractMode === 'url' && !referenceUrl.trim()) ||
                (extractMode === 'paste' && pastedText.trim().length < 50)
              }
              className="w-full py-2.5 rounded-lg text-white font-bold text-sm shadow disabled:opacity-50"
              style={{ backgroundColor: '#C8B6A6' }}
            >
              {isExtracting
                ? '🔍 분석 중...'
                : extractMode === 'url'
                ? '✨ URL 분석해서 자동 채우기'
                : '✨ 붙여넣은 내용 분석해서 자동 채우기'}
            </button>
            {extractResult && (
              <div
                className="p-3 rounded-lg border text-[11px] leading-relaxed space-y-1.5"
                style={{
                  backgroundColor: extractResult.filledFields.length === 0 ? '#fff7ed' : '#F7F3EE',
                  borderColor: extractResult.filledFields.length === 0 ? '#fdba74' : '#C8B6A6',
                  color: '#2F2A26',
                }}
              >
                {extractResult.normalizeNote && (
                  <div className="text-[10px] p-1.5 rounded" style={{ backgroundColor: '#fff', color: '#6b635c' }}>
                    {extractResult.normalizeNote}
                  </div>
                )}
                <div className="font-bold">
                  {extractResult.filledFields.length > 0 ? '✅' : '⚠️'} {extractResult.source}에서 {extractResult.contentLength?.toLocaleString() || 0}자 읽어와 {extractResult.filledFields.length}개 항목을 채웠습니다.
                </div>

                {extractResult.filledFields.length > 0 ? (
                  <div className="text-slate-600">
                    채워진 항목: <b>{extractResult.filledFields.join(', ')}</b>
                  </div>
                ) : (
                  <div className="space-y-1" style={{ color: '#9a3412' }}>
                    <div className="font-bold">페이지에서 제품 정보를 추출하지 못했습니다.</div>
                    <div className="text-[11px] leading-relaxed">
                      가능한 원인:
                      <br />• 중개·비교 사이트(aliprice 등)라 JS로만 로딩됨
                      <br />• 로그인·지역 차단된 페이지
                      <br />• 봇 차단이 강한 페이지
                    </div>
                    <div className="text-[11px] font-bold mt-1">
                      👉 해결 방법:
                      <br />1) 원본 1688/쿠팡 상품 페이지 URL을 직접 입력
                      <br />2) 페이지 내용을 복사해 아래 '제품 기본 정보' 칸에 직접 입력
                    </div>
                  </div>
                )}

                {extractResult.weakContent && extractResult.filledFields.length > 0 && (
                  <div className="text-[10px] p-1.5 rounded" style={{ backgroundColor: '#fef2f2', color: '#991b1b' }}>
                    ⚠️ 페이지 내용이 부족해 일부 정보만 추출되었을 수 있습니다. 결과를 확인해주세요.
                  </div>
                )}

                {extractResult.attempts && extractResult.attempts.length > 0 && (
                  <details className="mt-1">
                    <summary className="text-[10px] cursor-pointer text-slate-500">진단 정보</summary>
                    <div className="mt-1 text-[10px] text-slate-500 space-y-0.5">
                      {extractResult.finalUrl && (
                        <div>• 최종 URL: <code className="break-all">{extractResult.finalUrl}</code></div>
                      )}
                      {extractResult.attempts.map((a, i) => (
                        <div key={i}>• {a}</div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </Section>

          <Section title="3. 제품 기본 정보" emoji="🛍️">
            <Field label="제품명" required>
              <input value={brief.productName} onChange={(e) => updateBrief({ productName: e.target.value })} className="input" placeholder="예) 욕실용 실리콘 미끄럼방지 매트" />
            </Field>

            {/* ✨ AI 자동 채움 버튼 — 제품명만 있으면 나머지 전부 채움 */}
            <div className="mb-3 rounded-lg border-2 border-dashed p-3" style={{ borderColor: '#E87A2B', background: '#FFF8F0' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm font-bold" style={{ color: '#E87A2B' }}>
                    ✨ AI가 나머지 빈 칸 알아서 채우기
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    제품명만 입력하면 강점·고객층·리뷰·FAQ 등 모든 칸을 AI가 추론해 채워줍니다. 이후 직접 수정 가능.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAutoFillEmpty}
                  disabled={isAutoFilling || !brief.productName?.trim()}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 whitespace-nowrap"
                  style={{ background: '#E87A2B' }}
                >
                  {isAutoFilling ? '채우는 중…' : '🪄 빈 칸 채우기'}
                </button>
              </div>
              {autoFillMessage && (
                <div className="mt-2 text-xs font-medium" style={{ color: '#2F7A3F' }}>{autoFillMessage}</div>
              )}
            </div>

            <Field label="제품 유형">
              <select value={brief.productType} onChange={(e) => updateBrief({ productType: e.target.value })} className="input">
                <option value="">(선택)</option>
                {PRODUCT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="핵심 강점 3가지" required>
              {brief.strengths.map((s, i) => (
                <input key={i} value={s} onChange={(e) => updateArrayItem('strengths', i, e.target.value)} placeholder={`강점 ${i + 1}`} className="input mb-1.5" />
              ))}
            </Field>
            <Field label="주 고객층 3가지" required>
              {brief.targetCustomers.map((c, i) => (
                <input
                  key={i}
                  value={c}
                  onChange={(e) => updateArrayItem('targetCustomers', i, e.target.value)}
                  placeholder={
                    i === 0 ? '예) 좁은 주방 공간의 1인가구 30대 여성' :
                    i === 1 ? '예) 위생에 민감한 어린 자녀를 둔 부모' :
                              '예) 인테리어/수납에 관심 많은 신혼부부'
                  }
                  className="input mb-1.5"
                />
              ))}
            </Field>
            <Field label="소재">
              <input value={brief.material} onChange={(e) => updateBrief({ material: e.target.value })} placeholder="예) 식품 등급 실리콘, 스테인리스 304" className="input" />
            </Field>
            <Field label="사이즈/스펙" required={!brief.material}>
              <textarea rows={2} value={brief.sizeSpec} onChange={(e) => updateBrief({ sizeSpec: e.target.value })} placeholder="예) 가로 28cm × 세로 18cm × 높이 10cm / 1.2L" className="input resize-none" />
            </Field>
            <Field label="보유 사진 종류" required>
              <input value={brief.photoTypes} onChange={(e) => updateBrief({ photoTypes: e.target.value })} placeholder="예) 제품 단독컷, 디테일컷, 사용 장면컷, 라이프스타일컷" className="input" />
            </Field>

            {/* ─────────── 필수표기사항 (쿠팡 하단 필수 정보) ─────────── */}
            <div
              className="mt-4 p-3 rounded-lg border"
              style={{ backgroundColor: '#FFF8F0', borderColor: '#FDBA74' }}
            >
              <div className="text-sm font-extrabold mb-1" style={{ color: '#C2410C' }}>
                📋 상품 필수표기사항 (P10 하단에 자동 삽입)
              </div>
              <div className="text-[11px] mb-3" style={{ color: '#9A3412' }}>
                전자상거래법에 따른 필수 표기 정보입니다. 비우면 AI가 일반적인 값으로 자동 채웁니다.
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="품명 및 모델명">
                  <input
                    value={brief.compliance?.modelName || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, modelName: e.target.value } })}
                    placeholder="예) 주방선반 SK-100"
                    className="input"
                  />
                </Field>
                <Field label="크기/무게">
                  <input
                    value={brief.compliance?.sizeWeight || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, sizeWeight: e.target.value } })}
                    placeholder="예) 40×60×15cm / 1.2kg"
                    className="input"
                  />
                </Field>
                <Field label="색상">
                  <input
                    value={brief.compliance?.color || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, color: e.target.value } })}
                    placeholder="예) 실버, 화이트, 블랙"
                    className="input"
                  />
                </Field>
                <Field label="재질">
                  <input
                    value={brief.compliance?.material || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, material: e.target.value } })}
                    placeholder="예) 스테인리스 304"
                    className="input"
                  />
                </Field>
                <Field label="제조자/수입자">
                  <input
                    value={brief.compliance?.manufacturer || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, manufacturer: e.target.value } })}
                    placeholder="예) (주)○○기업"
                    className="input"
                  />
                </Field>
                <Field label="제조국">
                  <input
                    value={brief.compliance?.origin || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, origin: e.target.value } })}
                    placeholder="예) 대한민국 / 중국"
                    className="input"
                  />
                </Field>
                <div className="col-span-2">
                  <Field label="A/S 책임자 및 연락처">
                    <input
                      value={brief.compliance?.asContact || ''}
                      onChange={(e) => updateBrief({ compliance: { ...brief.compliance, asContact: e.target.value } })}
                      placeholder="예) 고객센터 1588-0000 (평일 10:00-17:00)"
                      className="input"
                    />
                  </Field>
                </div>
              </div>
            </div>
          </Section>

          <Section title="4. 제품 사진 업로드" emoji="📸" required>
            {/* 사진 개수 가이드 */}
            <div className="mb-2 p-2 rounded-lg text-[11px]" style={{
              backgroundColor: images.length >= 23 ? '#ECFDF5' : images.length >= 10 ? '#FFF8F0' : '#FEF2F2',
              borderLeft: `3px solid ${images.length >= 23 ? '#10B981' : images.length >= 10 ? '#E87A2B' : '#EF4444'}`,
            }}>
              <div className="font-bold mb-0.5">
                📸 현재 <span style={{ color: images.length >= 23 ? '#059669' : images.length >= 10 ? '#C2410C' : '#991B1B' }}>
                  {images.length}장
                </span> 업로드됨 {images.length >= 23 ? '✓ 모든 페이지에 다른 사진 배치 가능!' : `(이상적 23장, ${Math.max(0, 23 - images.length)}장 더 추가하면 완벽)`}
              </div>
              <div className="text-slate-600 leading-relaxed">
                각 페이지별 사진 할당: P1(1장)·P2(3장)·P3(1장)·P4(4장)·P5(1장)·P6(2장)·P7(3장)·P8(4장)·P9(3장)·P10(1장) = <b>총 23장</b>.
                {images.length < 23 && <span className="block mt-0.5">부족하면 처음부터 순환해서 재사용됩니다 (중복 발생).</span>}
              </div>
            </div>

            <label className="block">
              <div className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition" style={{ borderColor: '#C8B6A6' }}>
                <div className="text-xl mb-1">⬆️</div>
                <div className="text-sm font-semibold" style={{ color: '#2F2A26' }}>클릭해서 이미지 추가</div>
                <div className="text-[11px] text-slate-500 mt-1">여러 장 한번에 추가 가능 · 각 사진 아래 버튼으로 교체/삭제</div>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
              </div>
            </label>
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {images.map((src, idx) => {
                  // 사진 인덱스에 따른 페이지 할당 라벨
                  const pageLabel = (() => {
                    if (idx === 0) return 'P1';
                    if (idx >= 1 && idx <= 3) return 'P2';
                    if (idx === 4) return 'P3';
                    if (idx >= 5 && idx <= 8) return 'P4';
                    if (idx === 9) return 'P5';
                    if (idx >= 10 && idx <= 11) return 'P6';
                    if (idx >= 12 && idx <= 14) return 'P7';
                    if (idx >= 15 && idx <= 18) return 'P8';
                    if (idx >= 19 && idx <= 21) return 'P9';
                    if (idx === 22) return 'P10';
                    return '순환';
                  })();
                  return (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 border-2" style={{ borderColor: '#e2ddd4' }}>
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <div className="absolute top-1 left-1 bg-black/80 text-white text-[11px] font-bold px-1.5 py-0.5 rounded">
                        #{idx + 1}
                      </div>
                      {/* 페이지 할당 라벨 */}
                      <div className="absolute top-1 right-8 text-white text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                        backgroundColor: pageLabel === '순환' ? '#9CA3AF' : '#E87A2B',
                      }}>
                        {pageLabel}
                      </div>
                      {/* 항상 보이는 삭제 버튼 */}
                      <button
                        onClick={() => removeImage(idx)}
                        title="이 사진 삭제"
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm font-bold shadow-md flex items-center justify-center"
                      >
                        ×
                      </button>
                      {/* 교체 버튼 (하단 오버레이) */}
                      <label className="absolute bottom-0 left-0 right-0 bg-black/75 hover:bg-black/90 text-white text-[11px] font-semibold py-1 text-center cursor-pointer">
                        🔄 교체
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const newUrl = ev.target.result;
                              setImages((prev) => prev.map((s, i) => (i === idx ? newUrl : s)));
                            };
                            reader.readAsDataURL(file);
                            e.target.value = ''; // 같은 파일 재선택 가능하게
                          }}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-2 text-[11px] text-slate-500">
              💡 각 사진의 오렌지 라벨은 <b>해당 페이지에 배치될 순서</b>를 뜻합니다 (P1→P2→…→P10).
              23장 넘으면 "순환"으로 재사용됩니다.
            </div>
          </Section>

          <Section title="5. 리뷰 4개 (P4 필수)" emoji="⭐">
            {brief.reviews.map((r, i) => (
              <div key={i} className="space-y-1.5 mb-3 pb-3 border-b last:border-b-0" style={{ borderColor: '#e2ddd4' }}>
                <div className="text-[11px] font-bold text-slate-500">리뷰 {i + 1}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input placeholder="닉네임" value={r.nickname} onChange={(e) => updateObjectArrayItem('reviews', i, 'nickname', e.target.value)} className="input" />
                  <input placeholder="날짜 (예: 2024.08.12)" value={r.date} onChange={(e) => updateObjectArrayItem('reviews', i, 'date', e.target.value)} className="input" />
                </div>
                <textarea rows={2} placeholder="리뷰 내용 (60자 내외 권장)" value={r.body} onChange={(e) => updateObjectArrayItem('reviews', i, 'body', e.target.value)} className="input resize-none text-[13px]" />
              </div>
            ))}
          </Section>

          <Section title="6. P5 2지선다 비교표 (내 제품 vs 일반 제품)" emoji="⚖️">
            <div className="text-[11px] text-slate-500 mb-2 leading-relaxed">
              각 행에 <b>내 제품의 차별점</b>과 <b>일반 제품의 모습</b>을 함께 입력하세요.
              <br />비워두면 AI가 "일반적인 모습"을 추측해서 채웁니다.
            </div>
            <Field label="일반 제품 이름 (비교 대상)">
              <input
                value={brief.generalProductName}
                onChange={(e) => updateBrief({ generalProductName: e.target.value })}
                placeholder="예) 일반 주방선반, 기존 방식, 타사 제품"
                className="input"
              />
            </Field>
            <div className="space-y-2 mt-2">
              {brief.differences.map((d, i) => (
                <div
                  key={i}
                  className="p-2 rounded border"
                  style={{ backgroundColor: '#F7F3EE', borderColor: '#e2ddd4' }}
                >
                  <div className="text-[10px] font-bold text-slate-500 mb-1">
                    비교 항목 {i + 1}
                  </div>
                  <input
                    value={d}
                    onChange={(e) => updateArrayItem('differences', i, e.target.value)}
                    placeholder={`내 제품: 예) 두께 3mm로 튼튼함`}
                    className="input mb-1 text-[12px]"
                    style={{ borderColor: '#C8B6A6' }}
                  />
                  <input
                    value={brief.generalProductFeatures?.[i] || ''}
                    onChange={(e) => updateArrayItem('generalProductFeatures', i, e.target.value)}
                    placeholder={`일반 제품: 예) 두께 1mm로 잘 휘어짐`}
                    className="input text-[12px]"
                    style={{ borderColor: '#d4d0c9' }}
                  />
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs mt-2">
              <input type="checkbox" checked={brief.hasGeneralProductPhoto} onChange={(e) => updateBrief({ hasGeneralProductPhoto: e.target.checked })} />
              비교용 일반 제품 사진 있음
            </label>
          </Section>

          <Section title="7. 활용법 4가지 (P8 필수)" emoji="💡">
            {brief.usages.map((u, i) => (
              <input key={i} value={u} onChange={(e) => updateArrayItem('usages', i, e.target.value)} placeholder={`활용법 ${i + 1}`} className="input mb-1.5" />
            ))}
          </Section>

          <Section title="8. 사용 순서 3단계 (P9 필수)" emoji="🔢">
            {brief.usageSteps.map((s, i) => (
              <input key={i} value={s} onChange={(e) => updateArrayItem('usageSteps', i, e.target.value)} placeholder={`STEP ${i + 1}`} className="input mb-1.5" />
            ))}
          </Section>

          <Section title="9. FAQ 5개 (P10 필수)" emoji="❓">
            {brief.faqs.map((f, i) => (
              <div key={i} className="space-y-1.5 mb-2 pb-2 border-b last:border-b-0" style={{ borderColor: '#e2ddd4' }}>
                <input placeholder={`Q${i + 1}`} value={f.q} onChange={(e) => updateObjectArrayItem('faqs', i, 'q', e.target.value)} className="input" />
                <input placeholder={`A${i + 1}`} value={f.a} onChange={(e) => updateObjectArrayItem('faqs', i, 'a', e.target.value)} className="input" />
              </div>
            ))}
          </Section>
        </aside>

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
              <div className="flex gap-2">
                {currentPage === 'P5' && currentResult?.copy && (
                  <select value={p5Version} onChange={(e) => setP5Version(e.target.value)} className="input" style={{ width: 'auto', padding: '8px 10px' }}>
                    <option value="text">글 버전</option>
                    <option value="photo">사진 버전</option>
                  </select>
                )}
                <button
                  onClick={() => handleGenerate(currentPage)}
                  disabled={isLoading}
                  className="px-5 py-2.5 rounded-lg text-white font-bold text-sm shadow"
                  style={{ backgroundColor: isLoading ? '#a89b8f' : '#C8B6A6' }}
                >
                  {isLoading ? '생성 중...' : currentResult ? `${currentPage} 다시 생성` : `${currentPage} 생성`}
                </button>
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
                {/* 사용 사진 / 디자인 노트 / 확인 메시지 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <InfoCard title="📷 사용 사진" items={currentResult.usedPhotos} />
                  <InfoCard title="🎨 디자인/배치 지시" items={currentResult.designNotes} />
                </div>
                <div className="p-3 rounded-lg text-sm whitespace-pre-line mb-4" style={{ backgroundColor: '#F7F3EE', color: '#2F2A26', border: '1px solid #e2ddd4' }}>
                  {currentResult.confirmMessage}
                </div>

                <div className="flex gap-2 mb-4">
                  <button onClick={() => handleDownloadImage(currentPage)} className="px-4 py-2 rounded-lg text-white text-sm font-bold" style={{ backgroundColor: '#2F2A26' }}>
                    {currentPage} 이미지(PNG) 다운로드
                  </button>
                  <button onClick={() => handleDownloadHtml(currentPage)} className="px-4 py-2 rounded-lg text-sm font-bold border" style={{ borderColor: '#2F2A26', color: '#2F2A26' }}>
                    {currentPage} HTML 다운로드
                  </button>

                  {/* 다음 페이지 버튼 */}
                  {(() => {
                    const nextIdx = PAGE_LIST.indexOf(currentPage) + 1;
                    if (nextIdx < PAGE_LIST.length) {
                      const nextP = PAGE_LIST[nextIdx];
                      return (
                        <button
                          onClick={() => { setCurrentPage(nextP); handleGenerate(nextP); }}
                          disabled={isLoading}
                          className="ml-auto px-4 py-2 rounded-lg text-white text-sm font-bold shadow"
                          style={{ backgroundColor: '#C8B6A6' }}
                        >
                          다음 ({nextP}) 만들어줘 →
                        </button>
                      );
                    }
                    return null;
                  })()}
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
                  📷 <b>사진 교체</b>는 섹션 4 "제품 사진 업로드"에서 각 사진 하단 <b>🔄 교체</b> 버튼 → 사진 다시 반영은 페이지 <b>재생성</b> 필요<br />
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
                <div
                  className="text-[11px] font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: '#F7F3EE', color: '#6b635c' }}
                  title="쿠팡 상세페이지 업로드 규격"
                >
                  📐 가로 780px (쿠팡 규격)
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
            <div className="rounded-xl overflow-auto flex justify-center py-4" style={{ backgroundColor: '#f0ebe4', maxHeight: 'calc(100vh - 260px)' }}>
              {currentResult?.copy && !currentResult.needsMoreInfo ? (
                <PageRenderer
                  ref={pageRefs[currentPage]}
                  pageNumber={currentPage}
                  copy={currentResult.copy}
                  images={images}
                  version={p5Version}
                  variant={pageVariants[currentPage] || 0}
                  editMode={editMode}
                  overrides={textOverrides[currentPage] || {}}
                  onOverrideChange={(textId, partial) => updateTextOverride(currentPage, textId, partial)}
                  imageOverrides={imageOverrides[currentPage] || {}}
                  onImageOverrideChange={(imageId, partial) => updateImageOverride(currentPage, imageId, partial)}
                  freeImages={freeImages[currentPage] || []}
                  onAddFreeImage={(src) => addFreeImage(currentPage, src)}
                  onUpdateFreeImage={(id, partial) => updateFreeImage(currentPage, id, partial)}
                  onDeleteFreeImage={(id) => deleteFreeImage(currentPage, id)}
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
              ) : (
                <div className="text-xs text-slate-400 py-20 text-center">
                  {currentPage} 생성 후 이곳에 미리보기가 표시됩니다.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

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

function Section({ title, emoji, children }) {
  return (
    <div className="bg-white rounded-xl p-4 border" style={{ borderColor: '#e2ddd4' }}>
      <div className="flex items-center gap-2 pb-2 mb-3 border-b" style={{ borderColor: '#f0ebe4' }}>
        <span>{emoji}</span>
        <h3 className="text-sm font-bold" style={{ color: '#2F2A26' }}>{title}</h3>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <div className="text-[11px] font-bold mb-1" style={{ color: '#6b635c' }}>
        {label} {required && <span style={{ color: '#C8B6A6' }}>*</span>}
      </div>
      {children}
    </label>
  );
}

function InfoCard({ title, items }) {
  return (
    <div className="p-3 rounded-lg border text-xs" style={{ backgroundColor: '#fff', borderColor: '#e2ddd4' }}>
      <div className="font-bold mb-1.5" style={{ color: '#2F2A26' }}>{title}</div>
      {items?.length ? (
        <ul className="list-disc list-inside space-y-0.5" style={{ color: '#6b635c' }}>
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      ) : (
        <div className="text-slate-400">—</div>
      )}
    </div>
  );
}
