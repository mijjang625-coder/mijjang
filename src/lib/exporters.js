// 🚀 html-to-image lazy load — 사용자가 "내보내기" 클릭할 때만 로드
// 캐싱: 한 번 로드되면 재사용
//
// 🆕 (2026-05-02) html2canvas → html-to-image 라이브러리 교체.
//   이유: html2canvas는 한글 폰트의 baseline/ascent/descent 계산이 부정확해서
//        화면과 PNG의 텍스트 위치가 어긋남. 디버깅 결과 cloned DOM 좌표는
//        화면과 동일했음에도 (차이=0.0px) PNG 출력은 다르게 그려졌음.
//        → html2canvas 자체의 캔버스 렌더링 단계의 한계 확정.
//   해결: html-to-image는 SVG foreignObject 기반으로 렌더링 → 한글 처리 정확도가
//        훨씬 높음. 화면 = PNG가 거의 일치할 것으로 기대.
let _htmlToImage = null;
async function getHtmlToImage() {
  if (_htmlToImage) return _htmlToImage;
  const mod = await import('html-to-image');
  _htmlToImage = mod;
  return _htmlToImage;
}

let _agPsd = null;
async function getAgPsd() {
  if (_agPsd) return _agPsd;
  const mod = await import('ag-psd');
  _agPsd = mod;
  return _agPsd;
}

const NANUMSQUARE_CSS_URL =
  'https://cdn.jsdelivr.net/gh/moonspam/NanumSquare@2.0/nanumsquare.css';

// 🆕 캡처 직전 호출 — 폰트 로딩 + 추가 1프레임 대기
// document.fonts.ready를 기다리지 않으면 fallback 폰트로 캡처되어
// 한글 폰트의 ascent/descent가 달라지고 라벨/배지 텍스트가 위로/아래로 밀림.
async function prepareForCapture() {
  // 1) 모든 webfont 로딩 완료 대기
  if (document.fonts && typeof document.fonts.ready?.then === 'function') {
    try { await document.fonts.ready; } catch {}
  }
  // 2) 다음 프레임까지 대기 (layout 안정화)
  await new Promise((r) => requestAnimationFrame(() => r()));
  // 3) 한 프레임 더 (Safari 안전망)
  await new Promise((r) => requestAnimationFrame(() => r()));
}

// 🆕 (2026-05-03) 외부(CORS) stylesheet 임시 비활성화
// html-to-image는 옵션과 무관하게 모든 stylesheet의 cssRules에 접근하려 시도하며,
// 외부 도메인(CDN, fonts.googleapis.com 등)에서 로드된 CSS는 CORS 정책으로
// cssRules 접근이 차단되어 SecurityError 발생 → 각 stylesheet마다 try/catch
// 처리되지만 시간이 오래 걸리고 콘솔에 에러가 누적됨.
// 해결: 캡처 직전에 외부 stylesheet의 disabled = true로 설정하고, 캡처 후 복원.
// 이렇게 하면 라이브러리가 해당 stylesheet를 스킵해서 빠르고 깨끗하게 캡처됨.
function disableExternalStylesheets() {
  const disabled = [];
  const sameOrigin = window.location.origin;
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const href = sheet.href;
        if (!href) continue; // inline <style> — 동일 origin이므로 안전
        // 동일 origin이 아니면 외부 stylesheet
        if (!href.startsWith(sameOrigin)) {
          // cssRules 접근 시도 — SecurityError 나면 진짜 외부
          try {
            // eslint-disable-next-line no-unused-expressions
            sheet.cssRules;
          } catch {
            // CORS 차단된 stylesheet → 임시 비활성화
            if (!sheet.disabled) {
              sheet.disabled = true;
              disabled.push(sheet);
            }
          }
        }
      } catch {}
    }
  } catch {}
  // 복원 함수 반환
  return () => {
    for (const sheet of disabled) {
      try { sheet.disabled = false; } catch {}
    }
  };
}

// 🆕 캡처 시 텍스트 위치 보정용 클래스 일시 적용
// .coupang-page에 .pre-capture 추가
function applyCaptureClass(node) {
  node.classList.add('pre-capture');
  return () => node.classList.remove('pre-capture');
}

// 🆕 (2026-05-03) 가장 확실한 편집 가이드 제거 — DOM 직접 조작
// CSS !important 로도 inline style 의 outline/border 가 캡처에 그대로 찍히는
// 경우가 있어, 캡처 직전에 DOM 의 element.style 을 직접 비우고
// 캡처 후 원래 값으로 복원한다.
//
// 처리 대상:
//   1) [data-editable]      — EditableText (글박스 점선)
//   2) [data-edit-image]    — EditableImage (메인 사진 프레임 점선)
//   3) [data-free-image]    — FreeImage (자유 사진 점선)
//   4) [data-shape]         — ShapeLayer (도형 점선)
//   5) [data-edit-ui]       — 크기 라벨 등 편집 보조 UI → 완전히 숨김
//   6) [data-handle], [data-shape-handle] — 리사이즈 핸들 → 완전히 숨김
//   7) [data-toolbar] 등    — 편집 툴바/패널 → 완전히 숨김 (filter 외 안전망)
//
// 반환값: 원상복구 함수
function stripEditingChrome(rootNode) {
  if (!rootNode) return () => {};
  const restored = []; // {el, prop, value} 또는 {el, attr:'data-prev-display', value}

  // 1) outline/border 제거 대상 셀렉터
  //    🆕 (2026-05-03) 자식 요소까지 포괄 — EditableText의 frame 모드는
  //       wrapper(span[data-editable]) > inner span > Tag[data-editable] 구조라
  //       wrapper 만 제거하면 내부 Tag 의 inline outline 이 남아서 점선이 그대로 보임.
  //       자식 요소까지 모두 outline 제거.
  const outlineSelectors = [
    '[data-editable]',
    '[data-editable] *',
    '[data-edit-image]',
    '[data-edit-image] *',
    '[data-free-image]',
    '[data-free-image] *',
    '[data-shape]',
    '[data-shape] *',
  ];
  // 2) 완전 숨김 대상 셀렉터
  const hideSelectors = [
    '[data-edit-ui]',
    '[data-handle]',
    '[data-shape-handle]',
    '[data-toolbar]',
    '[data-inline-toolbar]',
    '[data-free-toolbar]',
    '[data-shape-toolbar]',
    '[data-replace-panel]',
    '[data-replace-trigger]',
  ];

  try {
    // outline/border 제거
    const outlineNodes = rootNode.querySelectorAll(outlineSelectors.join(','));
    outlineNodes.forEach((el) => {
      const s = el.style;
      // outline 계열
      if (s.outline) {
        restored.push({ el, prop: 'outline', value: s.outline });
        s.outline = 'none';
      }
      if (s.outlineWidth) {
        restored.push({ el, prop: 'outlineWidth', value: s.outlineWidth });
        s.outlineWidth = '0';
      }
      if (s.outlineStyle) {
        restored.push({ el, prop: 'outlineStyle', value: s.outlineStyle });
        s.outlineStyle = 'none';
      }
      if (s.outlineColor) {
        restored.push({ el, prop: 'outlineColor', value: s.outlineColor });
        s.outlineColor = 'transparent';
      }
      // border 가 점선/대시인 경우만 제거 (실선 콘텐츠 테두리는 보존)
      const cs = window.getComputedStyle(el);
      const bs = cs.borderStyle || '';
      if (bs.includes('dashed') || bs.includes('dotted')) {
        if (s.border) {
          restored.push({ el, prop: 'border', value: s.border });
          s.border = 'none';
        }
        if (s.borderStyle) {
          restored.push({ el, prop: 'borderStyle', value: s.borderStyle });
          s.borderStyle = 'none';
        }
      }
      // boxShadow 가 편집 강조용으로 사용된 경우는 inline 에 남아있지만,
      // 콘텐츠용 shadow 와 구분이 어려워 그대로 둠.
    });

    // 편집 보조 UI 완전 숨김
    const hideNodes = rootNode.querySelectorAll(hideSelectors.join(','));
    hideNodes.forEach((el) => {
      // 슬롯 끼워넣기 버튼은 "공간 유지 + 텍스트만 숨김" 처리
      // (display:none 으로 접으면 본문이 위로 당겨져 PNG 레이아웃이 달라질 수 있음)
      if (el.hasAttribute('data-slot-insert-button')) {
        const prevVisibility = el.style.visibility;
        const prevPointerEvents = el.style.pointerEvents;
        restored.push({ el, prop: 'visibility', value: prevVisibility });
        restored.push({ el, prop: 'pointerEvents', value: prevPointerEvents });
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
        return;
      }

      const prevDisplay = el.style.display;
      restored.push({ el, prop: 'display', value: prevDisplay });
      el.style.display = 'none';
    });
  } catch (err) {
    console.warn('[PNG] stripEditingChrome 실패:', err);
  }

  // 원상복구 함수
  return () => {
    for (const r of restored) {
      try {
        r.el.style[r.prop] = r.value;
      } catch {}
    }
  };
}

// 🆕 공통 html-to-image 옵션
// - pixelRatio: 2 (기존 html2canvas의 scale: 2와 동일한 효과 — 고해상도 PNG)
// - cacheBust: true (이미지 CORS/캐시 문제 회피)
// - skipFonts: true (🚨 2026-05-03 수정: 외부 CSS의 cssRules 접근 시
//                    SecurityError 발생 → PNG 생성 실패. 폰트 임베드 스킵하고
//                    페이지에 이미 로드된 시스템/웹폰트로 렌더링.)
// - filter: 캡처에서 제외할 노드 (편집 UI 툴바)
const CAPTURE_OPTIONS = {
  pixelRatio: 2,
  cacheBust: true,
  backgroundColor: '#ffffff',
  skipFonts: true,
  // 🆕 (2026-05-03) 편집용 툴바/패널 제외 — z-index 100000+ 영역
  filter: (node) => {
    if (!node || !node.getAttribute) return true;
    // 편집 툴바/인라인 툴바 제외
    if (node.hasAttribute?.('data-toolbar')) return false;
    if (node.hasAttribute?.('data-inline-toolbar')) return false;
    if (node.hasAttribute?.('data-free-toolbar')) return false;
    if (node.hasAttribute?.('data-shape-toolbar')) return false;
    if (node.hasAttribute?.('data-replace-panel')) return false;
    if (node.hasAttribute?.('data-handle')) return false;
    if (node.hasAttribute?.('data-replace-trigger')) return false;
    return true;
  },
  // 🆕 (2026-05-02) html-to-image는 SVG foreignObject로 렌더링하므로
  //   원본 DOM에 직접 영향을 주지 않음. onclone 콜백은 없으나,
  //   캡처 직전에 우리가 직접 DOM을 일시 수정하고 복원하는 방식 사용.
};

// 🆕 노드의 실제 콘텐츠 높이를 정확히 측정 (margin 포함)
function getCaptureHeight(node) {
  if (!node) return 0;
  let h = node.scrollHeight || node.offsetHeight || 0;
  try {
    const last = node.lastElementChild;
    if (last) {
      const cs = window.getComputedStyle(last);
      const mb = parseFloat(cs.marginBottom) || 0;
      if (mb > 0) h += mb;
    }
  } catch {}
  return Math.ceil(h);
}

// 🆕 캡처 직전, 노드에 명시적 height를 설정해서 라이브러리가
// 정확한 영역을 캡처하도록 함. 캡처 후 원래대로 복원.
function lockHeightForCapture(node) {
  if (!node) return () => {};
  const h = getCaptureHeight(node);
  const prev = {
    height: node.style.height,
    minHeight: node.style.minHeight,
  };
  node.style.minHeight = h + 'px';
  return () => {
    node.style.height = prev.height;
    node.style.minHeight = prev.minHeight;
  };
}

// 🆕 노드 너비 측정 (PNG 출력 크기 결정용)
function getCaptureWidth(node) {
  if (!node) return 0;
  return Math.ceil(node.scrollWidth || node.offsetWidth || 780);
}

function parseCssColorToRgb(css = '') {
  const s = String(css || '').trim();
  if (!s) return { r: 47, g: 42, b: 38 };

  const hexMatch = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }

  const rgbMatch = s.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const nums = rgbMatch[1].split(',').map((v) => parseFloat(v.trim()));
    return {
      r: Number.isFinite(nums[0]) ? Math.max(0, Math.min(255, Math.round(nums[0]))) : 47,
      g: Number.isFinite(nums[1]) ? Math.max(0, Math.min(255, Math.round(nums[1]))) : 42,
      b: Number.isFinite(nums[2]) ? Math.max(0, Math.min(255, Math.round(nums[2]))) : 38,
    };
  }

  return { r: 47, g: 42, b: 38 };
}

function toPsdFontName(fontFamily = '', fontWeight = 400) {
  const rawFirst = String(fontFamily || '').split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || '';
  const normalized = rawFirst.toLowerCase();

  // PSD 호환성 우선: NanumSquare는 사용자 환경(Photoshop)에 없는 경우가 많아
  // 열자마자 경고/깨진 글리프가 발생할 수 있음.
  // 한글 호환 폰트명으로 안전 매핑.
  if (normalized.includes('nanumsquare') || normalized.includes('나눔스퀘어')) {
    return Number(fontWeight) >= 700 ? 'MalgunGothicBold' : 'MalgunGothic';
  }

  if (normalized.includes('malgun')) return Number(fontWeight) >= 700 ? 'MalgunGothicBold' : 'MalgunGothic';
  if (normalized.includes('apple sd gothic')) return 'AppleSDGothicNeo-Regular';
  if (normalized.includes('arial')) return 'ArialMT';
  if (normalized.includes('helvetica')) return 'Helvetica';

  // 알 수 없는 폰트는 한글 지원이 비교적 안정적인 MalgunGothic으로 폴백
  return 'MalgunGothic';
}

function toPsdJustification(textAlign = '') {
  const a = String(textAlign || '').toLowerCase();
  if (a === 'center') return 'center';
  if (a === 'right' || a === 'end') return 'right';
  return 'left';
}

function isDisplayHidden(el) {
  try {
    const cs = window.getComputedStyle(el);
    if (!cs) return false;
    if (cs.display === 'none') return true;
    if (cs.visibility === 'hidden') return true;
    return false;
  } catch {
    return false;
  }
}

function extractTextSource(el) {
  if (el?.matches?.('[data-free-text="true"]')) {
    return el.querySelector('[contenteditable]') || el;
  }
  return el;
}

function toCanvasTextAlign(textAlign = '') {
  const a = String(textAlign || '').toLowerCase();
  if (a === 'center') return 'center';
  if (a === 'right' || a === 'end') return 'right';
  return 'left';
}

function parseLineHeight(lineHeightCss = '', fontSize = 22) {
  const lh = parseFloat(String(lineHeightCss || ''));
  if (Number.isFinite(lh) && lh > 0) return lh;
  return Math.max(1, fontSize * 1.35);
}

function createTextLayerCanvas({ rawText, rect, cs, fontSize, fontWeight }) {
  const pad = 2;
  const width = Math.max(1, Math.ceil(rect.width) + pad * 2);
  const height = Math.max(1, Math.ceil(rect.height) + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas: null, pad };

  const lineHeight = parseLineHeight(cs.lineHeight, fontSize);
  const textAlign = toCanvasTextAlign(cs.textAlign);

  ctx.clearRect(0, 0, width, height);
  ctx.textBaseline = 'top';
  ctx.textAlign = textAlign;
  ctx.fillStyle = cs.color || '#2F2A26';
  ctx.font = `${Number(fontWeight) >= 700 ? '700' : '400'} ${fontSize}px ${cs.fontFamily || 'sans-serif'}`;

  const lines = String(rawText || '').split('\n');
  const x = textAlign === 'center' ? Math.round(width / 2) : textAlign === 'right' ? width - pad : pad;

  for (let i = 0; i < lines.length; i++) {
    const y = pad + i * lineHeight;
    if (y > height) break;
    const line = lines[i] && lines[i].length ? lines[i] : ' ';
    ctx.fillText(line, x, y, Math.max(1, width - pad * 2));
  }

  return { canvas, pad };
}

function extractEditableTextLayers(pageNode) {
  if (!pageNode) return [];
  const pageRect = pageNode.getBoundingClientRect();

  // nested data-editable 중 가장 바깥(top-level)만 사용해 좌표 기준을 안정화
  const editableEls = Array.from(pageNode.querySelectorAll('[data-editable="true"]'))
    .filter((el) => !el.parentElement?.closest?.('[data-editable="true"]'));

  const dedupe = new Set();

  return editableEls
    .map((el, idx) => {
      if (!el || isDisplayHidden(el)) return null;

      const source = extractTextSource(el);
      if (!source || isDisplayHidden(source)) return null;

      const rawText = String(source.innerText || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n?/g, '\n')
        .replace(/\s+$/g, '');

      if (!rawText.trim()) return null;

      const rect = source.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return null;

      // 동일 위치/동일 텍스트 중복 제거
      const sig = [
        Math.round(rect.left - pageRect.left),
        Math.round(rect.top - pageRect.top),
        Math.round(rect.width),
        Math.round(rect.height),
        rawText,
      ].join('|');
      if (dedupe.has(sig)) return null;
      dedupe.add(sig);

      const cs = window.getComputedStyle(source);
      const fontSize = parseFloat(cs.fontSize) || 22;
      const fontWeight = parseFloat(cs.fontWeight) || 400;
      const zIndex = Number.isFinite(Number(cs.zIndex)) ? Number(cs.zIndex) : 0;

      const { canvas: textCanvas, pad } = createTextLayerCanvas({ rawText, rect, cs, fontSize, fontWeight });
      const layerLeft = Math.round(rect.left - pageRect.left) - pad;
      const layerTop = Math.round(rect.top - pageRect.top) - pad;

      return {
        order: idx,
        zIndex,
        layer: {
          name: `Text ${String(idx + 1).padStart(2, '0')}`,
          left: layerLeft,
          top: layerTop,
          ...(textCanvas ? { canvas: textCanvas } : {}),
          text: {
            text: rawText,
            transform: [
              1, 0, 0, 1,
              Math.round(rect.left - pageRect.left),
              Math.round(rect.top - pageRect.top),
            ],
            style: {
              font: { name: toPsdFontName(cs.fontFamily, fontWeight) },
              fontSize: Math.max(1, Math.round(fontSize * 100) / 100),
              fillColor: parseCssColorToRgb(cs.color),
            },
            paragraphStyle: {
              justification: toPsdJustification(cs.textAlign),
            },
          },
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.zIndex - b.zIndex) || (a.order - b.order))
    .map((it) => it.layer);
}

function hideEditableTextsForBackground(rootNode) {
  if (!rootNode) return () => {};
  const restored = [];
  try {
    const nodes = rootNode.querySelectorAll('[data-editable="true"]');
    nodes.forEach((el) => {
      const prevVisibility = el.style.visibility;
      const prevPointerEvents = el.style.pointerEvents;
      restored.push({ el, prop: 'visibility', value: prevVisibility });
      restored.push({ el, prop: 'pointerEvents', value: prevPointerEvents });
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
    });
  } catch {}

  return () => {
    for (const r of restored) {
      try { r.el.style[r.prop] = r.value; } catch {}
    }
  };
}

async function captureNodeCanvas(node, customOptions = {}, extraOptions = {}) {
  const htmlToImage = await getHtmlToImage();
  await waitForImages(node);

  const removeClass = applyCaptureClass(node);
  const restoreHeight = lockHeightForCapture(node);
  const restoreChrome = stripEditingChrome(node);
  const restoreEditableTexts = extraOptions?.hideEditableTexts ? hideEditableTextsForBackground(node) : () => {};

  await new Promise((r) => requestAnimationFrame(() => r()));

  try {
    const captureH = getCaptureHeight(node);
    const captureW = getCaptureWidth(node);
    const canvas = await htmlToImage.toCanvas(node, {
      ...CAPTURE_OPTIONS,
      ...customOptions,
      width: captureW,
      height: captureH,
      style: {
        width: `${captureW}px`,
        height: `${captureH}px`,
      },
    });
    return canvas;
  } finally {
    restoreEditableTexts();
    restoreChrome();
    restoreHeight();
    removeClass();
  }
}

/* ───────── 단일 페이지 ───────── */

/** Render a DOM node to a PNG image and trigger download. */
export async function downloadAsImage(node, filename = 'coupang-detail.png') {
  if (!node) throw new Error('렌더링할 노드가 없습니다.');
  const t0 = performance.now();
  console.log('[PNG] 시작:', filename);
  await waitForImages(node);
  await prepareForCapture();
  const removeClass = applyCaptureClass(node);
  const restoreHeight = lockHeightForCapture(node);
  // 🆕 (2026-05-03) 편집 가이드(점선/border/크기라벨/핸들) DOM 직접 제거
  const restoreChrome = stripEditingChrome(node);
  // 🆕 외부 CORS stylesheet 임시 비활성화 (SecurityError 방지 + 속도 개선)
  const restoreStylesheets = disableExternalStylesheets();
  // DOM 변경이 화면에 반영되도록 한 프레임 대기
  await new Promise((r) => requestAnimationFrame(() => r()));
  try {
    const htmlToImage = await getHtmlToImage();
    const captureH = getCaptureHeight(node);
    const captureW = getCaptureWidth(node);
    console.log('[PNG] 캡처 크기:', captureW, 'x', captureH);
    const blob = await htmlToImage.toBlob(node, {
      ...CAPTURE_OPTIONS,
      width: captureW,
      height: captureH,
      style: {
        // 캡처 시 노드의 width/height를 명시 (라이브러리가 정확히 캡처하도록)
        width: captureW + 'px',
        height: captureH + 'px',
      },
    });
    if (blob) {
      const elapsed = Math.round(performance.now() - t0);
      console.log(`[PNG] blob 생성 완료, 크기: ${blob.size} bytes, 소요시간: ${elapsed}ms`);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      console.error('[PNG] blob이 null입니다.');
      throw new Error('PNG 생성에 실패했습니다 (blob=null).');
    }
  } catch (err) {
    console.error('[PNG] 캡처 실패:', err);
    throw err;
  } finally {
    restoreStylesheets();
    restoreChrome();
    restoreHeight();
    removeClass();
  }
}

/** Build a standalone HTML document and download it. */
export function downloadAsHtml(node, filename = 'coupang-detail.html') {
  if (!node) throw new Error('렌더링할 노드가 없습니다.');
  const html = wrapHtml(node.outerHTML, '쿠팡 상세페이지 (780px)');
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ───────── P1~P10 전체 내보내기 ───────── */

/**
 * 여러 페이지 노드를 세로로 이어붙인 단일 PNG로 내보내기.
 * @param {Array<{key:string, node:HTMLElement}>} pages
 * @param {string} filename
 * @param {(progress:{done:number,total:number,label:string})=>void} [onProgress]
 */
export async function downloadAllAsSinglePng(pages, filename = 'coupang-all.png', onProgress) {
  if (!pages?.length) throw new Error('내보낼 페이지가 없습니다.');
  const total = pages.length;
  const canvases = [];  // {width, height, dataUrl} 배열로 저장
  const htmlToImage = await getHtmlToImage();
  await prepareForCapture();
  const cleanups = pages.map(({ node }) => applyCaptureClass(node));
  const heightRestores = [];
  const chromeRestores = [];
  // 🆕 외부 CORS stylesheet 임시 비활성화
  const restoreStylesheets = disableExternalStylesheets();
  try {
    for (let i = 0; i < pages.length; i++) {
      const { key, node } = pages[i];
      onProgress?.({ done: i, total, label: `${key} 캡처 중...` });
      await waitForImages(node);
      const restoreH = lockHeightForCapture(node);
      heightRestores.push(restoreH);
      // 🆕 (2026-05-03) 편집 가이드(점선/border/크기라벨/핸들) DOM 직접 제거
      const restoreCh = stripEditingChrome(node);
      chromeRestores.push(restoreCh);
      // DOM 변경이 화면에 반영되도록 한 프레임 대기
      await new Promise((r) => requestAnimationFrame(() => r()));
      const captureH = getCaptureHeight(node);
      const captureW = getCaptureWidth(node);
      // html-to-image는 직접 canvas를 반환하는 toCanvas 메서드 제공
      const canvas = await htmlToImage.toCanvas(node, {
        ...CAPTURE_OPTIONS,
        width: captureW,
        height: captureH,
        style: {
          width: captureW + 'px',
          height: captureH + 'px',
        },
      });
      canvases.push(canvas);
    }
  } finally {
    restoreStylesheets();
    chromeRestores.forEach((fn) => fn());
    heightRestores.forEach((fn) => fn());
    cleanups.forEach((fn) => fn());
  }
  onProgress?.({ done: total, total, label: '이미지 합치는 중...' });
  const width = Math.max(...canvases.map((c) => c.width));
  const height = canvases.reduce((s, c) => s + c.height, 0);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const c of canvases) {
    ctx.drawImage(c, Math.floor((width - c.width) / 2), y);
    y += c.height;
  }
  await new Promise((resolve) => {
    out.toBlob((blob) => {
      if (!blob) return resolve();
      const url = URL.createObjectURL(blob);
      triggerDownload(url, filename);
      setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 1000);
    }, 'image/png');
  });
}

/**
 * 여러 페이지를 페이지별 PNG로 내보낸 뒤 ZIP으로 묶기 (별도 라이브러리 없이 PNG 여러 장 다운로드).
 * 단순 구현: 각 페이지를 따로 다운로드 (브라우저가 묶음 다운로드 가능).
 */
export async function downloadAllAsSeparatePngs(pages, productName = 'product', onProgress) {
  if (!pages?.length) throw new Error('내보낼 페이지가 없습니다.');
  for (let i = 0; i < pages.length; i++) {
    const { key, node } = pages[i];
    onProgress?.({ done: i, total: pages.length, label: `${key} 저장 중...` });
    await downloadAsImage(node, `${productName}-${key}.png`);
    // 브라우저가 동시 다운로드 차단 안 하도록 약간 대기
    await new Promise((r) => setTimeout(r, 250));
  }
  onProgress?.({ done: pages.length, total: pages.length, label: '완료' });
}

/**
 * 페이지별 PSD 내보내기 (텍스트 레이어 editable 우선)
 * - 배경: 페이지 전체를 캔버스로 래스터화
 * - 텍스트: [data-editable] 요소를 PSD 텍스트 레이어로 추가
 */
export async function downloadAllAsSeparatePsds(pages, productName = 'product', onProgress) {
  if (!pages?.length) throw new Error('내보낼 페이지가 없습니다.');
  const { writePsdUint8Array } = await getAgPsd();

  await prepareForCapture();
  const restoreStylesheets = disableExternalStylesheets();

  try {
    for (let i = 0; i < pages.length; i++) {
      const { key, node } = pages[i];
      onProgress?.({ done: i, total: pages.length, label: `${key} PSD 생성 중...` });

      // 배경에는 editable 텍스트를 숨겨 "배경 텍스트 + 텍스트 레이어" 이중 노출 방지
      const backgroundCanvas = await captureNodeCanvas(node, { pixelRatio: 1 }, { hideEditableTexts: true });
      const textLayers = extractEditableTextLayers(node);

      const psd = {
        width: backgroundCanvas.width,
        height: backgroundCanvas.height,
        children: [
          {
            name: `${key} Background`,
            canvas: backgroundCanvas,
          },
          ...textLayers,
        ],
      };

      const psdBytes = writePsdUint8Array(psd, { invalidateTextLayers: true });
      const blob = new Blob([psdBytes], { type: 'image/vnd.adobe.photoshop' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${productName}-${key}.psd`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      // 브라우저 다운로드 차단 방지 대기
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    restoreStylesheets();
  }

  onProgress?.({ done: pages.length, total: pages.length, label: '완료' });
}

/** P1~P10 전체를 하나의 HTML 문서로 내보내기 */
export function downloadAllAsHtml(pages, filename = 'coupang-all.html') {
  if (!pages?.length) throw new Error('내보낼 페이지가 없습니다.');
  const inner = pages
    .map(({ key, node }) => `<!-- ${key} -->\n<div class="page-block">${node.outerHTML}</div>`)
    .join('\n');
  const html = wrapHtml(inner, '쿠팡 상세페이지 P1~P10');
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ───────── Figma 내보내기 ───────── */

/**
 * Figma 가져오기용 PNG + 매니페스트 JSON. 사용자는 Figma 캠버스에 PNG들을
 * 드래그앤드롭하면 됨.
 */
export async function downloadForFigma(pages, productName = 'product', onProgress) {
  if (!pages?.length) throw new Error('내보낼 페이지가 없습니다.');
  const manifest = {
    name: productName,
    exportedAt: new Date().toISOString(),
    canvasWidth: 780,
    pages: [],
    instructions: [
      '1. 다운로드된 PNG 파일들을 Figma 캠버스에 한꺼번에 드래그하세요.',
      '2. Figma가 자동으로 각 PNG를 프레임으로 변환합니다.',
      '3. 가로 정렬: 모두 선택 → 우측 정렬 패널에서 "Vertical / 0px gap".',
      '4. 또는 Figma 플러그인 "html.to.design"에서 함께 다운로드된 figma-pages.html 파일을 import 하세요.',
    ],
  };

  // 각 페이지 PNG로 다운로드
  const htmlToImage = await getHtmlToImage();
  await prepareForCapture();
  // 🆕 외부 CORS stylesheet 임시 비활성화 (전체 루프 동안)
  const restoreStylesheets = disableExternalStylesheets();
  try {
  for (let i = 0; i < pages.length; i++) {
    const { key, node } = pages[i];
    onProgress?.({ done: i, total: pages.length + 2, label: `${key} → PNG` });
    await waitForImages(node);
    const removeClass = applyCaptureClass(node);
    const restoreH = lockHeightForCapture(node);
    // 🆕 (2026-05-03) 편집 가이드 DOM 직접 제거
    const restoreCh = stripEditingChrome(node);
    await new Promise((r) => requestAnimationFrame(() => r()));
    let canvas;
    try {
      const captureH = getCaptureHeight(node);
      const captureW = getCaptureWidth(node);
      canvas = await htmlToImage.toCanvas(node, {
        ...CAPTURE_OPTIONS,
        width: captureW,
        height: captureH,
        style: {
          width: captureW + 'px',
          height: captureH + 'px',
        },
      });
    } finally {
      restoreCh();
      restoreH();
      removeClass();
    }
    const pngName = `${productName}-${key}.png`;
    await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve();
        const url = URL.createObjectURL(blob);
        triggerDownload(url, pngName);
        setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 1000);
      }, 'image/png');
    });
    manifest.pages.push({
      key,
      file: pngName,
      width: Math.round(canvas.width / 2),  // pixelRatio=2이므로 원본 px
      height: Math.round(canvas.height / 2),
      y: i === 0 ? 0 : null,
    });
    await new Promise((r) => setTimeout(r, 250));
  }
  } finally {
    restoreStylesheets();
  }

  // figma-pages.html — html.to.design 플러그인 import용
  onProgress?.({ done: pages.length, total: pages.length + 2, label: 'figma-pages.html 생성' });
  const inner = pages
    .map(({ key, node }) => `<!-- ${key} -->\n<div class="page-block" data-page="${key}">${node.outerHTML}</div>`)
    .join('\n');
  const html = wrapHtml(inner, `Figma Import — ${productName}`);
  const htmlBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const htmlUrl = URL.createObjectURL(htmlBlob);
  triggerDownload(htmlUrl, `${productName}-figma.html`);
  setTimeout(() => URL.revokeObjectURL(htmlUrl), 1000);
  await new Promise((r) => setTimeout(r, 250));

  // manifest.json
  onProgress?.({ done: pages.length + 1, total: pages.length + 2, label: 'manifest.json' });
  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  const manifestUrl = URL.createObjectURL(manifestBlob);
  triggerDownload(manifestUrl, `${productName}-figma-manifest.json`);
  setTimeout(() => URL.revokeObjectURL(manifestUrl), 1000);

  onProgress?.({ done: pages.length + 2, total: pages.length + 2, label: '완료' });
}

/* ───────── 공통 유틸 ───────── */

async function waitForImages(node) {
  const imgs = Array.from(node.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            // 안전망 — 5초 타임아웃
            setTimeout(resolve, 5000);
          }
        }),
    ),
  );
}

function wrapHtml(innerHtml, title) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${NANUMSQUARE_CSS_URL}" />
<style>
  body { margin:0; background:#f0ebe4; font-family:'NanumSquare','나눔스퀘어',system-ui,-apple-system,sans-serif; }
  .page-wrapper { display:flex; flex-direction:column; align-items:center; gap:0; padding: 20px 12px; }
  .page-block { width: 780px; }
  .coupang-page { width: 780px !important; }
</style>
</head>
<body>
  <div class="page-wrapper">
    ${innerHtml}
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
