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
    pages.forEach((p) => {
      p.classList.add('pre-capture');
      // 🆕 캡처 시 마지막 자식의 margin-bottom이 잘리는 것을 방지
      // html2canvas는 collapsing margin을 누락하므로 명시적 padding-bottom 추가
      if (!p.dataset._capturePad) {
        p.style.paddingBottom = '8px';
        p.dataset._capturePad = '1';
      }
      // 🆕 (P1/P2 글씨 밀림 핵심 수정)
      // inline style에 fontFamily가 박혀 있는 요소들도 NanumSquare로 강제 변경.
      // !important CSS만으로는 안 잡히는 경우(인라인 style 우선순위)를 위해
      // JS에서 직접 inline style을 덮어씀.
      const all = p.querySelectorAll('*');
      const SAFE_FONT = "'NanumSquare', 'Nanum Square', 'Apple SD Gothic Neo', sans-serif";
      all.forEach((el) => {
        if (!el.style) return;
        // 1) 폰트 통일
        if (el.style.fontFamily) {
          el.style.fontFamily = SAFE_FONT;
        }
        // 2) letterSpacing 큰 음수 보정
        if (el.style.letterSpacing && el.style.letterSpacing.includes('em')) {
          const v = parseFloat(el.style.letterSpacing);
          if (v < -0.04) {
            el.style.letterSpacing = '-0.02em';
          }
        }
        // 3) 🆕 lineHeight 보정 — html2canvas는 작은 line-height에서 한글이 잘림.
        //    inline style.lineHeight가 1.4 미만이면 1.5로 끌어올림 (큰 제목/라벨 제외)
        const tag = el.tagName;
        const lh = el.style.lineHeight;
        if (lh) {
          const lhNum = parseFloat(lh);
          // 단위 없는 숫자 (1.2, 1.4 등) — 작은 값이면 1.5로
          if (!isNaN(lhNum) && !lh.includes('px') && !lh.includes('em') && lhNum < 1.5) {
            // h1~h4 같은 큰 제목은 1.3 유지 (1.5면 너무 벌어짐)
            if (['H1', 'H2', 'H3', 'H4'].includes(tag)) {
              el.style.lineHeight = Math.max(lhNum, 1.3) + '';
            } else {
              el.style.lineHeight = '1.5';
            }
          }
        } else if (el.textContent && el.textContent.trim() && !['BR', 'IMG', 'SVG', 'PATH', 'CIRCLE', 'RECT'].includes(tag)) {
          // lineHeight 명시 안 된 텍스트 요소엔 1.5 부여
          if (['SPAN', 'P', 'DIV'].includes(tag) && el.children.length === 0) {
            el.style.lineHeight = '1.5';
          }
        }
        // 4) 🆕 강조 카드(border-radius + backgroundColor) — padding-top 4px 추가
        //    P1 강점 카드처럼 글자가 박스 위쪽으로 잘리는 현상 방지
        const br = el.style.borderRadius;
        const bg = el.style.backgroundColor;
        if (br && bg && bg !== 'transparent' && bg !== 'none') {
          const brNum = parseFloat(br);
          // 12px 이상 둥근 박스 = 카드/강조 박스
          if (!isNaN(brNum) && brNum >= 12 && brNum < 100) {
            const curPt = parseFloat(el.style.paddingTop) || 0;
            // 이미 큰 padding이면 손대지 않음 (24px 이상은 충분)
            if (curPt < 20) {
              el.style.paddingTop = (curPt + 4) + 'px';
            }
          }
        }
        // 4-b) 🆕🆕 (2026-04-28) 알약/배지 라벨 — PNG 캡처 시 텍스트가 위로 밀리는 현상 해결
        //     화면에선 한글 폰트 ascent/descent로 자연스럽게 정중앙이지만,
        //     html2canvas는 line-box 계산이 달라서 텍스트가 박스 위쪽으로 잘려 보임.
        //     조건: 알약 모양 (borderRadius가 매우 큼: 50px+ or 999 등) → 강제 flex center
        if (br) {
          // "999px", "9999px", "100px", "50%" 등 알약/원형 후보
          const isPill =
            br === '999px' || br === '9999px' || br === '50%' ||
            (parseFloat(br) >= 50 && !isNaN(parseFloat(br)));
          // 텍스트가 들어 있는 작은 박스만 (큰 카드는 제외 — display:flex로 바꾸면 레이아웃 깨짐)
          const h = el.offsetHeight || 0;
          const hasText = el.textContent && el.textContent.trim().length > 0;
          // 자식이 텍스트 노드뿐이거나 1개의 inline 요소만 (= 라벨임)
          const childCount = el.children ? el.children.length : 0;
          if (isPill && hasText && h > 0 && h < 80 && childCount <= 2) {
            el.style.display = 'inline-flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.lineHeight = '1';
            // 박스 위쪽으로 밀리는 미세 보정: padding-top 1px만 더해줌
            const curPt = parseFloat(el.style.paddingTop) || 0;
            const curPb = parseFloat(el.style.paddingBottom) || 0;
            // 위/아래 padding이 다르면 균등하게 맞춰서 정중앙 보장
            if (Math.abs(curPt - curPb) > 0.5) {
              const avg = (curPt + curPb) / 2;
              el.style.paddingTop = avg + 'px';
              el.style.paddingBottom = avg + 'px';
            }
          }
        }

        // 5) 🆕🆕 (2026-04-28 사용자 가설 검증 — v2)
        //    "흰색이 글씨를 덮어서 잘려 보이는 것" → overflow:hidden + line-clamp 해제
        //    ⚠️ 단, 사진 박스의 overflow:hidden은 그대로 유지해야 함 (사진이 튀어나옴)
        //    조건: 자손에 <img> 없는 "텍스트 전용 박스"만 해제
        const ovf = el.style.overflow;
        const wlc = el.style.webkitLineClamp || el.style.WebkitLineClamp;
        const txOv = el.style.textOverflow;
        if (ovf === 'hidden') {
          // 자손 중 <img>가 있으면 사진 마스킹용 → 건드리지 않음
          // background-image가 있으면 배경 사진용 → 건드리지 않음
          const hasImg = el.querySelector && el.querySelector('img');
          const bgImg = el.style.backgroundImage;
          const hasBgImg = bgImg && bgImg !== 'none' && bgImg !== '';
          if (!hasImg && !hasBgImg) {
            el.style.overflow = 'visible';
          }
        }
        if (wlc) {
          el.style.webkitLineClamp = 'unset';
          el.style.WebkitLineClamp = 'unset';
          // -webkit-box → block로 풀어주기
          if (el.style.display === '-webkit-box' || el.style.display === '-webkit-inline-box') {
            el.style.display = 'block';
          }
        }
        if (txOv === 'ellipsis') {
          el.style.textOverflow = 'clip';
        }
      });
      // 페이지 자체에도 명시적 폰트 지정
      p.style.fontFamily = SAFE_FONT;
    });
  },
};

// 🆕 노드의 실제 콘텐츠 높이를 정확히 측정 (margin 포함)
// html2canvas는 자체 측정이 종종 마지막 자식의 margin-bottom을 누락시킴 →
// scrollHeight + 자식 마지막 margin을 더해서 안전한 높이를 반환
function getCaptureHeight(node) {
  if (!node) return 0;
  // 1) 기본 scrollHeight (대부분 정확)
  let h = node.scrollHeight || node.offsetHeight || 0;
  // 2) 마지막 자식의 margin-bottom 보정 (collapsing margin 누락 방지)
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

// 🆕 캡처 직전, 노드에 명시적 height를 설정해서 html2canvas가
// 정확한 영역을 캡처하도록 함. 캡처 후 원래대로 복원.
function lockHeightForCapture(node) {
  if (!node) return () => {};
  const h = getCaptureHeight(node);
  const prev = {
    height: node.style.height,
    minHeight: node.style.minHeight,
  };
  // .coupang-page 내부 첫 div(.position:relative)에는 손대지 않고,
  // ref 래퍼(=node)에만 높이를 명시
  node.style.minHeight = h + 'px';
  return () => {
    node.style.height = prev.height;
    node.style.minHeight = prev.minHeight;
  };
}

/* ───────── 단일 페이지 ───────── */

/** Render a DOM node to a PNG image and trigger download. */
export async function downloadAsImage(node, filename = 'coupang-detail.png') {
  if (!node) throw new Error('렌더링할 노드가 없습니다.');
  await waitForImages(node);
  await prepareForCapture();
  const removeClass = applyCaptureClass(node);
  const restoreHeight = lockHeightForCapture(node);
  try {
    const html2canvas = await getHtml2Canvas();
    // 🆕 명시적 height 전달 — html2canvas가 마지막 콘텐츠를 잘리지 않게 보장
    const captureH = getCaptureHeight(node);
    const canvas = await html2canvas(node, {
      ...CAPTURE_OPTIONS,
      height: captureH,
      windowHeight: captureH,
    });
    await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve();
        const url = URL.createObjectURL(blob);
        triggerDownload(url, filename);
        setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 1000);
      }, 'image/png');
    });
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
  const canvases = [];
  const html2canvas = await getHtml2Canvas();
  // 🆕 모든 페이지에 캡처 클래스 적용 (한 번에) + 폰트 로딩
  await prepareForCapture();
  const cleanups = pages.map(({ node }) => applyCaptureClass(node));
  const heightRestores = [];
  try {
    for (let i = 0; i < pages.length; i++) {
      const { key, node } = pages[i];
      onProgress?.({ done: i, total, label: `${key} 캡처 중...` });
      await waitForImages(node);
      // 🆕 명시적 height 전달 — 마지막 콘텐츠 잘림 방지
      const restoreH = lockHeightForCapture(node);
      heightRestores.push(restoreH);
      const captureH = getCaptureHeight(node);
      const c = await html2canvas(node, {
        ...CAPTURE_OPTIONS,
        height: captureH,
        windowHeight: captureH,
      });
      canvases.push(c);
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
    const restoreH = lockHeightForCapture(node);
    let canvas;
    try {
      const captureH = getCaptureHeight(node);
      canvas = await html2canvas(node, {
        ...CAPTURE_OPTIONS,
        height: captureH,
        windowHeight: captureH,
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
