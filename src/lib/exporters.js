import html2canvas from 'html2canvas';

const NANUMSQUARE_CSS_URL =
  'https://cdn.jsdelivr.net/gh/moonspam/NanumSquare@2.0/nanumsquare.css';

/** Render a DOM node to a PNG image and trigger download. */
export async function downloadAsImage(node, filename = 'coupang-detail.png') {
  if (!node) throw new Error('렌더링할 노드가 없습니다.');
  // 이미지 로딩 완료 대기
  const imgs = Array.from(node.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
    ),
  );

  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
  });
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

/** Build a standalone HTML document and download it. */
export function downloadAsHtml(node, filename = 'coupang-detail.html') {
  if (!node) throw new Error('렌더링할 노드가 없습니다.');
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>쿠팡 상세페이지 (780px)</title>
<link rel="stylesheet" href="${NANUMSQUARE_CSS_URL}" />
<style>
  /* 쿠팡 상세페이지 규격: 가로 780px 고정 */
  body { margin:0; background:#f0ebe4; font-family:'NanumSquare','나눔스퀘어',system-ui,-apple-system,sans-serif; }
  .page-wrapper { display:flex; justify-content:center; padding: 20px 12px; }
  .coupang-page { width: 780px !important; }
</style>
</head>
<body>
  <!-- 쿠팡 등록 규격: 가로 780px, HTML 소스 그대로 복붙 가능 -->
  <div class="page-wrapper">
    ${node.outerHTML}
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
