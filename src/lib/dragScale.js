// src/lib/dragScale.js
// 🎯 드래그/리사이즈 시 transform: scale 보정 유틸
//
// 문제:
//   페이지 컨테이너에 transform: scale(0.46) 같은 축소가 적용되면,
//   브라우저 mousemove 이벤트의 e.clientX 변화량(화면 픽셀)과
//   페이지 좌표(원본 780px 기준)의 변화량 비율이 어긋남.
//   → 화면에서 1px 움직여도 페이지 좌표는 ~2.16px씩 점프 → "한 칸씩 끊김"
//
// 해결:
//   드래그 시작 시 컨테이너의 실제 화면 너비를 측정하고,
//   페이지 원본 너비(780)와의 비율로 scale을 계산해서 마우스 변화량을 보정.
//
// 사용:
//   const scale = getCurrentPageScale(elementRef.current);
//   const dx = (e.clientX - startX) / scale;  // 페이지 좌표 변화량
//   const dy = (e.clientY - startY) / scale;

const PAGE_WIDTH = 780;

/**
 * 주어진 DOM 요소를 감싸는 가장 가까운 .coupang-page 의 현재 scale을 반환.
 * - .coupang-page 는 width:780 + transform:scale(...) 으로 축소될 수 있음
 * - 모바일 미리보기 모드에서 scale 적용
 * - PC 미리보기에서는 1.0
 *
 * @param {HTMLElement | null} el - 측정할 요소(보통 드래그 핸들 자신)
 * @returns {number} scale 값 (0보다 큼). 측정 실패 시 1.0
 */
export function getCurrentPageScale(el) {
  if (!el) return 1;
  // 가장 가까운 .coupang-page 찾기
  const page = el.closest?.('.coupang-page');
  if (!page) return 1;
  const rect = page.getBoundingClientRect();
  // 화면 너비가 너무 작으면(렌더 안 된 경우 등) 1.0 fallback
  if (rect.width < 10) return 1;
  const scale = rect.width / PAGE_WIDTH;
  // 비정상 값(NaN, 0)은 1로 안전 처리
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return scale;
}

/**
 * 드래그 시작점과 현재 마우스 위치로부터, scale 보정된 페이지 좌표 변화량 반환.
 *
 * @param {{startX:number, startY:number}} start - 시작 화면 좌표
 * @param {{clientX:number, clientY:number}} ev - 현재 마우스 이벤트
 * @param {HTMLElement} el - 보정 기준 요소
 * @returns {{dx:number, dy:number, scale:number}}
 */
export function getScaledDelta(start, ev, el) {
  const scale = getCurrentPageScale(el);
  return {
    dx: (ev.clientX - start.startX) / scale,
    dy: (ev.clientY - start.startY) / scale,
    scale,
  };
}
