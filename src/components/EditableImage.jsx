import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * EditableImage v2 — 피그마식 A/B 통합 편집
 *
 * A모드 (프레임 리사이즈): 8개 핸들로 박스 가로/세로/위치 조정
 * B모드 (크롭): 박스 크기 고정, 내부 사진만 확대/이동/교체
 *
 * 추가 기능:
 *   - Shift 키 누른 채 리사이즈 → 비율 잠금
 *   - 스냅: 다른 요소(부모 컨테이너) 가장자리에 가까이 가면 자동 정렬
 *   - 더블클릭 → B모드 즉시 진입
 *   - B모드에서 [🔄 사진 교체] 버튼으로 다른 이미지로 변경
 *
 * Props:
 *   - id: 고유 식별자 (예: "P1.heroImage")
 *   - src: 이미지 URL (기본)
 *   - aspect: 기본 가로:세로 비율 (예: "1 / 1") — 첫 렌더 박스 크기 산출용
 *   - radius: border-radius (px)
 *   - editMode: 편집 모드 여부
 *   - override: {
 *       frame: { width, height, x, y },     // A모드: 프레임 크기/위치 (CSS px)
 *       crop:  { scale, offsetX, offsetY }, // B모드: 내부 사진 변형
 *       src:   string,                      // 사진 교체된 경우
 *       zIndex: number,
 *     }
 *   - onChange: (partial) => void — override 병합
 *   - availableImages?: string[] — 사진 교체 시 보여줄 후보들
 */

const fallbackImg =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect fill="%23e8e5e1" width="400" height="400"/><text x="50%25" y="50%25" font-size="18" text-anchor="middle" fill="%238a8680" font-family="sans-serif" dy=".3em">사진이 필요합니다</text></svg>';

// 핸들 위치 정의 (8방향)
const HANDLES = [
  { id: 'nw', cursor: 'nwse-resize', top: -6, left: -6 },
  { id: 'n',  cursor: 'ns-resize',   top: -6, left: '50%' },
  { id: 'ne', cursor: 'nesw-resize', top: -6, right: -6 },
  { id: 'e',  cursor: 'ew-resize',   top: '50%', right: -6 },
  { id: 'se', cursor: 'nwse-resize', bottom: -6, right: -6 },
  { id: 's',  cursor: 'ns-resize',   bottom: -6, left: '50%' },
  { id: 'sw', cursor: 'nesw-resize', bottom: -6, left: -6 },
  { id: 'w',  cursor: 'ew-resize',   top: '50%', left: -6 },
];

const SNAP_THRESHOLD = 8; // 8px 이내일 때 스냅

export default function EditableImage({
  id,
  src,
  aspect = '1 / 1',
  radius = 0,
  editMode = false,
  override = {},
  onChange = () => {},
  availableImages = [],
  alt = '',
}) {
  const wrapperRef = useRef(null);  // 외곽 컨테이너 (페이지 흐름상 위치)
  const frameRef = useRef(null);    // 실제 프레임 박스 (절대 위치)
  const [hovering, setHovering] = useState(false);
  const [mode, setMode] = useState('idle'); // 'idle' | 'cropping'
  const [resizing, setResizing] = useState(null); // { handle, startX, startY, startW, startH, startFx, startFy, shiftLock, aspectRatio }
  const [draggingFrame, setDraggingFrame] = useState(null); // { startX, startY, startFx, startFy }
  const [draggingCrop, setDraggingCrop] = useState(null);   // { startX, startY, startOx, startOy }
  const [showSwapPanel, setShowSwapPanel] = useState(false);
  const [snapLines, setSnapLines] = useState({ v: null, h: null });

  // 측정된 기본 크기 (스케일 1.0 / 미오버라이드 시 초기 박스 크기)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  const frame = override?.frame || null; // null이면 기본 흐름 (width 100%)
  const crop = override?.crop || { scale: 1, offsetX: 0, offsetY: 0 };
  const currentSrc = override?.src || src;

  // 초기 1회 측정
  useEffect(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    if (rect.width > 0 && naturalSize.w === 0) {
      // aspect 파싱
      let h = rect.width;
      try {
        const [aw, ah] = aspect.split('/').map((s) => parseFloat(s.trim()));
        if (aw && ah) h = (rect.width * ah) / aw;
      } catch {}
      setNaturalSize({ w: rect.width, h });
    }
  }, [aspect, naturalSize.w]);

  // 부모 페이지(컨테이너) 너비를 추적하여 스냅 기준 계산
  const getParentRect = () => {
    const parent = wrapperRef.current?.parentElement;
    return parent?.getBoundingClientRect() || null;
  };

  // ─── A모드: 프레임 리사이즈 ──────────────────────
  const handleResizeStart = (e, handleId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    const w = frame?.width ?? rect.width;
    const h = frame?.height ?? rect.height;
    const fx = frame?.x ?? 0;
    const fy = frame?.y ?? 0;
    setResizing({
      handle: handleId,
      startX: e.clientX,
      startY: e.clientY,
      startW: w,
      startH: h,
      startFx: fx,
      startFy: fy,
      shiftLock: e.shiftKey,
      aspectRatio: w / h,
    });
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      const shiftLock = e.shiftKey || resizing.shiftLock;
      let { startW: w, startH: h, startFx: fx, startFy: fy } = resizing;
      const ar = resizing.aspectRatio;
      const handle = resizing.handle;

      // 핸들별 변경 (px)
      if (handle.includes('e')) w = resizing.startW + dx;
      if (handle.includes('w')) { w = resizing.startW - dx; fx = resizing.startFx + dx; }
      if (handle.includes('s')) h = resizing.startH + dy;
      if (handle.includes('n')) { h = resizing.startH - dy; fy = resizing.startFy + dy; }

      // 비율 잠금 (Shift)
      if (shiftLock) {
        if (handle === 'n' || handle === 's') w = h * ar;
        else if (handle === 'e' || handle === 'w') h = w / ar;
        else {
          // 코너 — 둘 중 변화량 큰 쪽 우선
          if (Math.abs(dx) > Math.abs(dy)) h = w / ar;
          else w = h * ar;
        }
      }

      // 최소 크기 제한
      w = Math.max(40, w);
      h = Math.max(40, h);

      // 스냅: 부모 컨테이너 좌/우/중앙
      const parent = getParentRect();
      let snapV = null, snapH = null;
      if (parent && wrapperRef.current) {
        const wrapperRect = wrapperRef.current.getBoundingClientRect();
        const pageInnerW = parent.width;
        const left = fx; // wrapper 좌측 기준 frame.x
        const right = fx + w;
        const centerX = fx + w / 2;
        const wrapperCenter = pageInnerW / 2 - (wrapperRect.left - parent.left);
        // 좌측 0
        if (Math.abs(left - 0) < SNAP_THRESHOLD) { fx = 0; snapV = 'left'; }
        // 우측: wrapper의 좌측 기준 가용 너비
        const availRight = parent.right - wrapperRect.left;
        if (Math.abs(right - availRight) < SNAP_THRESHOLD) {
          // 핸들이 우측이면 w 조정, 좌측이면 fx 조정
          if (handle.includes('w')) fx = availRight - w;
          else w = availRight - fx;
          snapV = 'right';
        }
        // 중앙
        if (Math.abs(centerX - wrapperCenter) < SNAP_THRESHOLD) {
          fx = wrapperCenter - w / 2;
          snapV = 'center';
        }
      }
      setSnapLines({ v: snapV, h: snapH });

      onChange({
        frame: { width: Math.round(w), height: Math.round(h), x: Math.round(fx), y: Math.round(fy) },
      });
    };
    const onUp = () => { setResizing(null); setSnapLines({ v: null, h: null }); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, onChange]);

  // ─── A모드: 프레임 이동 (본체 드래그) ──────────────────────
  const handleFrameDragStart = (e) => {
    if (mode === 'cropping') return; // 크롭 모드면 드래그=내부 사진
    if (e.target.closest('[data-handle]')) return;
    if (e.target.closest('[data-toolbar]')) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingFrame({
      startX: e.clientX,
      startY: e.clientY,
      startFx: frame?.x ?? 0,
      startFy: frame?.y ?? 0,
    });
  };

  useEffect(() => {
    if (!draggingFrame) return;
    const onMove = (e) => {
      const dx = e.clientX - draggingFrame.startX;
      const dy = e.clientY - draggingFrame.startY;
      let nx = draggingFrame.startFx + dx;
      let ny = draggingFrame.startFy + dy;

      // 스냅
      const parent = getParentRect();
      let snapV = null, snapH = null;
      if (parent && wrapperRef.current && frameRef.current) {
        const wrapperRect = wrapperRef.current.getBoundingClientRect();
        const fw = frame?.width ?? naturalSize.w;
        const availRight = parent.right - wrapperRect.left;
        const wrapperCenter = parent.width / 2 - (wrapperRect.left - parent.left);
        if (Math.abs(nx) < SNAP_THRESHOLD) { nx = 0; snapV = 'left'; }
        if (Math.abs(nx + fw - availRight) < SNAP_THRESHOLD) { nx = availRight - fw; snapV = 'right'; }
        if (Math.abs(nx + fw / 2 - wrapperCenter) < SNAP_THRESHOLD) { nx = wrapperCenter - fw / 2; snapV = 'center'; }
      }
      setSnapLines({ v: snapV, h: snapH });

      onChange({
        frame: {
          width: frame?.width ?? naturalSize.w,
          height: frame?.height ?? naturalSize.h,
          x: Math.round(nx),
          y: Math.round(ny),
        },
      });
    };
    const onUp = () => { setDraggingFrame(null); setSnapLines({ v: null, h: null }); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingFrame, frame, naturalSize, onChange]);

  // ─── B모드: 크롭 (내부 사진 이동) ──────────────────────
  const handleCropDragStart = (e) => {
    if (mode !== 'cropping') return;
    if (e.target.closest('[data-toolbar]')) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingCrop({
      startX: e.clientX,
      startY: e.clientY,
      startOx: crop.offsetX || 0,
      startOy: crop.offsetY || 0,
    });
  };

  useEffect(() => {
    if (!draggingCrop) return;
    const onMove = (e) => {
      const dx = e.clientX - draggingCrop.startX;
      const dy = e.clientY - draggingCrop.startY;
      onChange({
        crop: {
          ...crop,
          offsetX: Math.round(draggingCrop.startOx + dx),
          offsetY: Math.round(draggingCrop.startOy + dy),
        },
      });
    };
    const onUp = () => setDraggingCrop(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingCrop, crop, onChange]);

  // B모드: 휠 스크롤로 확대/축소
  const handleWheel = useCallback((e) => {
    if (mode !== 'cropping') return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(1.0, Math.min(3.0, (crop.scale || 1) + delta));
    onChange({ crop: { ...crop, scale: newScale } });
  }, [mode, crop, onChange]);

  // 더블클릭 → B모드 진입
  const handleDoubleClick = (e) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    setMode('cropping');
  };

  // ESC로 크롭 모드 탈출
  useEffect(() => {
    if (mode !== 'cropping') return;
    const onKey = (e) => {
      if (e.key === 'Escape') setMode('idle');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // ─── 편집모드 OFF: 단순 렌더 (override 적용) ──────────────────────
  if (!editMode) {
    const hasFrame = !!frame;
    return (
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: hasFrame ? undefined : aspect,
          minHeight: hasFrame ? frame.height + Math.max(0, frame.y) + 20 : undefined,
        }}
      >
        <div
          style={{
            position: hasFrame ? 'absolute' : 'relative',
            left: hasFrame ? frame.x : 0,
            top: hasFrame ? frame.y : 0,
            width: hasFrame ? frame.width : '100%',
            height: hasFrame ? frame.height : undefined,
            aspectRatio: hasFrame ? undefined : aspect,
            backgroundColor: '#e8e5e1',
            borderRadius: radius,
            overflow: 'hidden',
            zIndex: override?.zIndex || 'auto',
          }}
        >
          <img
            src={currentSrc || fallbackImg}
            alt={alt}
            crossOrigin="anonymous"
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              transform: `scale(${crop.scale || 1}) translate(${(crop.offsetX || 0) / (crop.scale || 1)}px, ${(crop.offsetY || 0) / (crop.scale || 1)}px)`,
              transformOrigin: 'center center',
            }}
          />
        </div>
      </div>
    );
  }

  // ─── 편집모드 ON ──────────────────────────────────────────
  const hasFrame = !!frame;
  const fw = hasFrame ? frame.width : naturalSize.w || '100%';
  const fh = hasFrame ? frame.height : naturalSize.h || undefined;
  const fx = hasFrame ? frame.x : 0;
  const fy = hasFrame ? frame.y : 0;

  // 프레임 영역만큼 wrapper 높이 확보
  const wrapperMinHeight = hasFrame ? frame.height + Math.max(0, frame.y) + 20 : (naturalSize.h || undefined);

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: hasFrame ? undefined : aspect,
        minHeight: wrapperMinHeight,
      }}
    >
      {/* 프레임 박스 */}
      <div
        ref={frameRef}
        onMouseDown={handleFrameDragStart}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        style={{
          position: hasFrame ? 'absolute' : 'relative',
          left: fx,
          top: fy,
          width: fw,
          height: fh,
          aspectRatio: hasFrame ? undefined : aspect,
          backgroundColor: '#e8e5e1',
          borderRadius: radius,
          overflow: 'hidden',
          outline:
            mode === 'cropping'
              ? '2px solid #f97316'
              : hovering || resizing || draggingFrame
              ? '2px dashed #3b82f6'
              : '1px dashed rgba(96,165,250,0.45)',
          outlineOffset: 2,
          cursor:
            mode === 'cropping'
              ? draggingCrop ? 'grabbing' : 'grab'
              : draggingFrame ? 'grabbing' : 'move',
          userSelect: 'none',
          zIndex: override?.zIndex || 'auto',
          transition: resizing || draggingFrame || draggingCrop ? 'none' : 'outline-color 0.15s',
        }}
      >
        <img
          src={currentSrc || fallbackImg}
          alt={alt}
          crossOrigin="anonymous"
          draggable={false}
          onMouseDown={mode === 'cropping' ? handleCropDragStart : undefined}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            userSelect: 'none',
            pointerEvents: mode === 'cropping' ? 'auto' : 'none',
            transform: `scale(${crop.scale || 1}) translate(${(crop.offsetX || 0) / (crop.scale || 1)}px, ${(crop.offsetY || 0) / (crop.scale || 1)}px)`,
            transformOrigin: 'center center',
          }}
        />

        {/* 크롭모드 안내 오버레이 */}
        {mode === 'cropping' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              border: '2px dashed rgba(255,255,255,0.6)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {/* ── A모드 핸들 (8개) — idle + hover일 때 ── */}
      {mode === 'idle' && (hovering || resizing || draggingFrame) &&
        HANDLES.map((h) => (
          <div
            key={h.id}
            data-handle
            onMouseDown={(e) => handleResizeStart(e, h.id)}
            title={`드래그=크기조정 / Shift=비율잠금 (${h.id})`}
            style={{
              position: 'absolute',
              left: typeof h.left === 'number' ? fx + h.left : h.left === '50%' ? fx + (typeof fw === 'number' ? fw / 2 : 0) - 6 : undefined,
              right: h.right !== undefined ? `calc(100% - ${fx + (typeof fw === 'number' ? fw : 0)}px + ${h.right}px)` : undefined,
              top: typeof h.top === 'number' ? fy + h.top : h.top === '50%' ? fy + (typeof fh === 'number' ? fh / 2 : 0) - 6 : undefined,
              bottom: h.bottom !== undefined ? `calc(100% - ${fy + (typeof fh === 'number' ? fh : 0)}px + ${h.bottom}px)` : undefined,
              width: 12,
              height: 12,
              backgroundColor: '#3b82f6',
              border: '2px solid #fff',
              borderRadius: 3,
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              cursor: h.cursor,
              zIndex: 20,
            }}
          />
        ))}

      {/* ── 좌상단 툴바 (idle 모드) ── */}
      {mode === 'idle' && (hovering || resizing || draggingFrame) && (
        <div
          data-toolbar
          style={{
            position: 'absolute',
            left: fx,
            top: fy - 36,
            display: 'flex',
            gap: 4,
            zIndex: 30,
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setMode('cropping'); }}
            title="크롭 모드 (사진 안쪽만 조정) — 더블클릭으로도 진입 가능"
            style={toolbarBtnStyle('#3b82f6')}
          >
            🔍 크롭
          </button>
          {hasFrame && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChange({ frame: null });
              }}
              title="프레임 크기/위치 초기화"
              style={toolbarBtnStyle('#7c2d12')}
            >
              ↺ 프레임
            </button>
          )}
          {(crop.scale > 1 || crop.offsetX || crop.offsetY) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChange({ crop: { scale: 1, offsetX: 0, offsetY: 0 } });
              }}
              title="크롭 초기화"
              style={toolbarBtnStyle('#7c2d12')}
            >
              ↺ 크롭
            </button>
          )}
        </div>
      )}

      {/* ── 우상단 크기 표시 ── */}
      {mode === 'idle' && hasFrame && (hovering || resizing || draggingFrame) && (
        <div
          style={{
            position: 'absolute',
            left: fx + (typeof fw === 'number' ? fw : 0) - 90,
            top: fy + 6,
            backgroundColor: 'rgba(30, 41, 59, 0.85)',
            color: '#fff',
            padding: '3px 6px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 800,
            zIndex: 30,
            pointerEvents: 'none',
          }}
        >
          {Math.round(typeof fw === 'number' ? fw : 0)} × {Math.round(typeof fh === 'number' ? fh : 0)}
        </div>
      )}

      {/* ── B모드 (크롭) 툴바 ── */}
      {mode === 'cropping' && (
        <div
          data-toolbar
          style={{
            position: 'absolute',
            left: fx,
            top: fy - 50,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            backgroundColor: '#1e293b',
            padding: '8px 12px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 40,
          }}
        >
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>확대:</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={crop.scale || 1}
            onChange={(e) => onChange({ crop: { ...crop, scale: parseFloat(e.target.value) } })}
            style={{ width: 110, accentColor: '#f97316' }}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, minWidth: 34 }}>
            {Math.round((crop.scale || 1) * 100)}%
          </span>
          <div style={{ width: 1, height: 18, backgroundColor: '#475569' }} />
          {availableImages.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowSwapPanel((v) => !v); }}
              title="다른 사진으로 교체"
              style={toolbarBtnStyle('#0ea5e9')}
            >
              🔄 사진 교체
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange({ crop: { scale: 1, offsetX: 0, offsetY: 0 } });
            }}
            title="크롭 초기화"
            style={toolbarBtnStyle('#7c2d12')}
          >
            ↺ 초기화
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMode('idle'); setShowSwapPanel(false); }}
            title="크롭 모드 종료 (ESC)"
            style={toolbarBtnStyle('#16a34a')}
          >
            ✓ 완료
          </button>
        </div>
      )}

      {/* ── 사진 교체 패널 ── */}
      {mode === 'cropping' && showSwapPanel && (
        <div
          data-toolbar
          style={{
            position: 'absolute',
            left: fx,
            top: fy + (typeof fh === 'number' ? fh : 0) + 8,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 80px)',
            gap: 6,
            padding: 10,
            backgroundColor: '#1e293b',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            maxWidth: 360,
            zIndex: 40,
          }}
        >
          {availableImages.map((imgUrl, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                onChange({ src: imgUrl, crop: { scale: 1, offsetX: 0, offsetY: 0 } });
                setShowSwapPanel(false);
              }}
              style={{
                width: 80,
                height: 80,
                padding: 0,
                border: imgUrl === currentSrc ? '3px solid #f97316' : '2px solid transparent',
                borderRadius: 6,
                overflow: 'hidden',
                cursor: 'pointer',
                background: '#000',
              }}
            >
              <img
                src={imgUrl}
                alt=""
                crossOrigin="anonymous"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}

      {/* ── 스냅 가이드라인 ── */}
      {snapLines.v && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left:
              snapLines.v === 'left' ? fx :
              snapLines.v === 'right' ? fx + (typeof fw === 'number' ? fw : 0) :
              fx + (typeof fw === 'number' ? fw / 2 : 0),
            width: 1,
            backgroundColor: '#ec4899',
            pointerEvents: 'none',
            zIndex: 50,
          }}
        />
      )}
    </div>
  );
}

function toolbarBtnStyle(color) {
  return {
    backgroundColor: color,
    color: '#fff',
    border: 'none',
    padding: '5px 10px',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
    whiteSpace: 'nowrap',
  };
}
