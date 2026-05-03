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

// 🆕 캡처 시 텍스트 위치 보정용 클래스 일시 적용
// .coupang-page에 .pre-capture 추가
function applyCaptureClass(node) {
  node.classList.add('pre-capture');
  return () => node.classList.remove('pre-capture');
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

/* ───────── 단일 페이지 ───────── */

/** Render a DOM node to a PNG image and trigger download. */
export async function downloadAsImage(node, filename = 'coupang-detail.png') {
  if (!node) throw new Error('렌더링할 노드가 없습니다.');
  console.log('[PNG] 시작:', filename, 'node:', node);
  await waitForImages(node);
  await prepareForCapture();
  const removeClass = applyCaptureClass(node);
  const restoreHeight = lockHeightForCapture(node);
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
      console.log('[PNG] blob 생성 완료, 크기:', blob.size, 'bytes');
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
  try {
    for (let i = 0; i < pages.length; i++) {
      const { key, node } = pages[i];
      onProgress?.({ done: i, total, label: `${key} 캡처 중...` });
      await waitForImages(node);
      const restoreH = lockHeightForCapture(node);
      heightRestores.push(restoreH);
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
  for (let i = 0; i < pages.length; i++) {
    const { key, node } = pages[i];
    onProgress?.({ done: i, total: pages.length + 2, label: `${key} → PNG` });
    await waitForImages(node);
    const removeClass = applyCaptureClass(node);
    const restoreH = lockHeightForCapture(node);
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
