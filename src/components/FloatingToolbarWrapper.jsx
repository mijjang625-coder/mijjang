import { useEffect, useState } from 'react';

/**
 * FloatingToolbarWrapper
 * 마우스 커서 근처(viewport fixed)에 떠있는 툴바 컨테이너.
 * - 화면 우측/하단 경계를 넘으면 자동으로 반대쪽으로 flip
 * - position: fixed + z-index: 9999
 *
 * Props:
 *   pos: { x, y }  (clientX, clientY — viewport 좌표)
 *   toolbarRef: 실제 툴바 DOM ref (크기 측정용)
 *   offset: 마우스 커서로부터 떨어질 여백 (기본 12)
 *   children: 툴바 내용
 */
export default function FloatingToolbarWrapper({ pos, toolbarRef, offset = 12, children }) {
  const [coord, setCoord] = useState({ left: pos.x + offset, top: pos.y + offset });

  useEffect(() => {
    // 다음 프레임에서 실제 크기 측정 후 보정
    const id = requestAnimationFrame(() => {
      const el = toolbarRef?.current;
      const tw = el?.offsetWidth || 320;
      const th = el?.offsetHeight || 36;
      const margin = offset;
      let left = pos.x + margin;
      let top = pos.y + margin;
      // 오른쪽 초과 → 마우스 왼쪽으로 flip
      if (left + tw + margin > window.innerWidth) {
        left = pos.x - tw - margin;
      }
      // 아래쪽 초과 → 마우스 위쪽으로 flip
      if (top + th + margin > window.innerHeight) {
        top = pos.y - th - margin;
      }
      // 화면 밖 최소값 보정
      left = Math.max(8, left);
      top = Math.max(8, top);
      setCoord({ left, top });
    });
    return () => cancelAnimationFrame(id);
  }, [pos.x, pos.y, toolbarRef, offset]);

  return (
    <div
      style={{
        position: 'fixed',
        left: coord.left,
        top: coord.top,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
    >
      {children}
    </div>
  );
}
