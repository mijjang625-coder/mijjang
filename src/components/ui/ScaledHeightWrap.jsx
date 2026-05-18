import { useEffect, useRef, useState } from 'react';

/**
 * 📱 모바일 미리보기용 스케일 래퍼
 * CSS transform: scale 은 시각만 축소하고 box width/height 는 원본(780)을 유지하므로,
 * 부모 컨테이너에 빈 공간이 생긴다. 자식 height 를 측정해서 자체 height 에
 * scale 곱한 값을 부여하여 실제 차지하는 공간도 비례 축소되도록 한다.
 * width 는 base(780) * scale 로 고정 — 모바일 폰 프레임 안에 정확히 들어맞도록.
 *
 * @param {ReactNode} children  미리보기 페이지 콘텐츠
 * @param {number}    scale     0~1 사이 스케일 (예: 모바일 360/780 ≈ 0.46)
 * @param {number}    baseWidth 원본 너비 (기본 780)
 * @param {boolean}   scrollable true 면 외부 div의 overflow:hidden / height 제한을 제거.
 *                               부모(MobileFrame viewport)가 직접 스크롤 담당.
 *                               mobileFull 전체보기(P1~P10)처럼 콘텐츠가
 *                               MobileFrame 720px 을 크게 초과할 때 사용.
 */
export default function ScaledHeightWrap({ children, scale, baseWidth = 780, scrollable = false }) {
  const innerRef = useRef(null);
  const [innerH, setInnerH] = useState(0);
  useEffect(() => {
    if (!innerRef.current) return;
    const el = innerRef.current;
    const update = () => setInnerH(el.scrollHeight || el.offsetHeight || 0);
    update();
    // 콘텐츠가 동적으로 자라는 경우 대응 (이미지 로드/추가 등)
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);
  return (
    <div style={
      scrollable
        ? {
            // scrollable 모드: 높이/overflow 제한 없음 → 부모가 스크롤
            width: baseWidth * scale,
          }
        : {
            width: baseWidth * scale,
            height: innerH * scale,
            overflow: 'hidden',
          }
    }>
      <div
        ref={innerRef}
        style={{
          width: baseWidth,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}
