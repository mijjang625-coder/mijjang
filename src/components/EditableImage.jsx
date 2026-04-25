import { useEffect, useRef, useState } from 'react';

/**
 * EditableImage — editMode일 때 이미지 크기 조절 가능
 *
 * Props:
 *   - id: 고유 식별자 (예: "P1.heroImage")
 *   - src: 이미지 URL
 *   - aspect: 가로:세로 비율 (예: "1 / 1", "4 / 3")
 *   - radius: border-radius (px)
 *   - editMode: 편집 모드 여부
 *   - override: { scale } — 사용자가 조정한 스케일 (1.0 = 100%)
 *   - onChange: (partial) => void — override 병합
 */
const fallbackImg =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect fill="%23e8e5e1" width="400" height="400"/><text x="50%25" y="50%25" font-size="18" text-anchor="middle" fill="%238a8680" font-family="sans-serif" dy=".3em">사진이 필요합니다</text></svg>';

export default function EditableImage({
  id,
  src,
  aspect = '1 / 1',
  radius = 0,
  editMode = false,
  override = {},
  onChange = () => {},
  alt = '',
}) {
  const containerRef = useRef(null);
  const [hovering, setHovering] = useState(false);
  const [resizing, setResizing] = useState(false);
  const startData = useRef({ x: 0, baseScale: 1, startWidth: 0 });

  // 사용자 조정 스케일 (기본 1.0 = 원본 100%)
  const scale = override?.scale ?? 1.0;

  // 리사이즈 핸들 mousedown
  const handleResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    startData.current = {
      x: e.clientX,
      baseScale: scale,
      startWidth: rect.width / scale, // 원본 너비 (스케일 1.0 기준)
    };
    setResizing(true);
  };

  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e) => {
      const dx = e.clientX - startData.current.x;
      const newWidth = startData.current.startWidth * startData.current.baseScale + dx;
      const newScale = newWidth / startData.current.startWidth;
      const clamped = Math.max(0.3, Math.min(2.0, newScale)); // 30% ~ 200%
      onChange({ scale: clamped });
    };
    const handleUp = () => setResizing(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  // 편집모드 아니면 단순 렌더
  if (!editMode) {
    return (
      <div
        style={{
          width: `${scale * 100}%`,
          aspectRatio: aspect,
          margin: scale !== 1.0 ? '0 auto' : undefined,
          backgroundColor: '#e8e5e1',
          borderRadius: radius,
          overflow: 'hidden',
        }}
      >
        <img
          src={src || fallbackImg}
          alt={alt}
          crossOrigin="anonymous"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  // 편집모드: hover/리사이즈 시 핸들 표시
  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: 'relative',
        width: `${scale * 100}%`,
        aspectRatio: aspect,
        margin: scale !== 1.0 ? '0 auto' : undefined,
        backgroundColor: '#e8e5e1',
        borderRadius: radius,
        overflow: 'hidden',
        outline: hovering || resizing ? '2px dashed #3b82f6' : '1px dashed rgba(96,165,250,0.45)',
        outlineOffset: 2,
        transition: 'outline-color 0.15s',
      }}
    >
      <img
        src={src || fallbackImg}
        alt={alt}
        crossOrigin="anonymous"
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          userSelect: 'none',
        }}
      />

      {/* 우하단 리사이즈 핸들 — hover 또는 리사이즈 중일 때 표시 */}
      {(hovering || resizing) && (
        <div
          onMouseDown={handleResizeStart}
          title="드래그해서 사진 크기 조절"
          style={{
            position: 'absolute',
            right: -8,
            bottom: -8,
            width: 26,
            height: 26,
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            border: '3px solid #fff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            cursor: 'nwse-resize',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 13,
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          ⤡
        </div>
      )}

      {/* 현재 크기 배지 */}
      {(hovering || resizing) && scale !== 1.0 && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            backgroundColor: 'rgba(30, 41, 59, 0.85)',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 800,
            zIndex: 10,
          }}
        >
          {Math.round(scale * 100)}%
        </div>
      )}

      {/* 100% 리셋 버튼 */}
      {(hovering || resizing) && scale !== 1.0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChange({ scale: 1.0 });
          }}
          title="원본 크기로 되돌리기"
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            backgroundColor: 'rgba(124, 45, 18, 0.9)',
            color: '#fff',
            border: 'none',
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          ↺ 100%
        </button>
      )}
    </div>
  );
}
