// 🚀 html2canvas는 lazy load — 사용자가 "내보내기" 클릭할 때만 로드 (~200KB 절약)
// 캐싱: 한 번 로드되면 재사용
let _html2canvas = null;
async function getHtml2Canvas() {
  if (_html2canvas) return _html2canvas;
  const mod = await import('html2canvas');
  _html2canvas = mod.default || mod;
  return _html2canvas;
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
// .coupang-page에 .pre-capture 추가 → CSS가 라벨/배지 line-height/align을 강제 통일
function applyCaptureClass(node) {
  node.classList.add('pre-capture');
  return () => node.classList.remove('pre-capture');
}

// 🆕 공통 html2canvas 옵션 — 텍스트 어긋남을 최소화하는 설정
// - foreignObjectRendering: false (true면 SVG로 렌더해서 폰트 metric이 또 달라짐)
// - letterRendering: true → 글자 단위로 위치 측정 (한글 정렬 정확도 향상)
// - imageTimeout: 0 → 이미지 로딩 무한 대기 (이미 waitForImages로 보장됨)
const CAPTURE_OPTIONS = {
  scale: 2,
  useCORS: true,
  allowTaint: true,
  backgroundColor: '#ffffff',
  logging: false,
  letterRendering: true,
  foreignObjectRendering: false,
  imageTimeout: 0,
  // onclone: 캡처 직전 cloned DOM을 추가 보정
  onclone: (clonedDoc) => {
    // cloned 문서에서도 .pre-capture 클래스가 적용되도록 보장
    const pages = clonedDoc.querySelectorAll('.coupang-page');
    pages.forEach((p) => p.classList.add('pre-capture'));
  },
};

/* ───────── 단일 페이지 ───────── */

/** Render a DOM node to a PNG image and trigger download. */
export async function downloadAsImage(node, filename = 'coupang-detail.png') {
  if (!node) throw new Error('렌더링할 노드가 없습니다.');
  await waitForImages(node);
  await prepareForCapture();
  const removeClass = applyCaptureClass(node);
  try {
    const html2canvas = await getHtml2Canvas();
    const canvas = await html2canvas(node, CAPTURE_OPTIONS);
    await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve();
        const url = URL.createObjectURL(blob);
        triggerDownload(url, filename);
        setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 1000);
      }, 'image/png');
    });
  } finally {
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
  const canvases = [];
  const html2canvas = await getHtml2Canvas();
  // 🆕 모든 페이지에 캡처 클래스 적용 (한 번에) + 폰트 로딩
  await prepareForCapture();
  const cleanups = pages.map(({ node }) => applyCaptureClass(node));
  try {
    for (let i = 0; i < pages.length; i++) {
      const { key, node } = pages[i];
      onProgress?.({ done: i, total, label: `${key} 캡처 중...` });
      await waitForImages(node);
      const c = await html2canvas(node, CAPTURE_OPTIONS);
      canvases.push(c);
    }
  } finally {
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
 * Figma 가져오기용 JSON. Figma 플러그인 "html.to.design" 또는
 * "Figma to HTML/HTML to Figma"에서 사용 가능한 두 가지 포맷을 지원.
 *
 * 가장 단순/안정적인 워크플로우:
 *  1) 각 페이지를 PNG로 캡처
 *  2) 각 PNG를 base64로 인코딩
 *  3) Figma 플러그인 (예: "Image to Figma", "html.to.design")이 읽을 수 있는
 *     JSON 매니페스트 + ZIP 형태로 내보내기
 *
 * 여기서는 가장 호환성 높은 방식: **각 페이지 PNG + 매니페스트 JSON**을
 * 한 번에 다운로드. 사용자는 Figma 캠버스에 PNG들을 드래그앤드롭하면 됨.
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
  const html2canvas = await getHtml2Canvas();
  await prepareForCapture();
  for (let i = 0; i < pages.length; i++) {
    const { key, node } = pages[i];
    onProgress?.({ done: i, total: pages.length + 2, label: `${key} → PNG` });
    await waitForImages(node);
    const removeClass = applyCaptureClass(node);
    let canvas;
    try {
      canvas = await html2canvas(node, CAPTURE_OPTIONS);
    } finally {
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
      width: Math.round(canvas.width / 2),  // scale=2이므로 원본 px
      height: Math.round(canvas.height / 2),
      y: i === 0 ? 0 : null,  // y는 사용자가 Figma에서 자동 정렬
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
