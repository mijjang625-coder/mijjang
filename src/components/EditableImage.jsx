import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * EditableImage v3 — 박스/이미지 완전 분리
 *
 * A모드 (프레임 리사이즈): 8개 핸들로 박스 가로/세로/위치 조정
 *   - 기본: 가로세로 비율 잠금 ON (안전)
 *   - Shift 누른 채 드래그 → 자유 변형 (비율 잠금 해제)
 *   - 스냅: 부모 컨테이너 좌/우/중앙 가장자리 자동 정렬
 *
 * B모드 (크롭): 박스 크기 무관하게 내부 사진 자체를 변형
 *   - 사진 표시 크기를 절대 px로 저장 → 박스 크기 변경에 영향 안 받음
 *   - 슬라이더(50%~400%) 또는 Shift+휠로 확대/축소
 *   - 사진 드래그로 박스 안에서 이동
 *   - 더블클릭으로 즉시 진입
 *   - 🔄 사진 교체 버튼
 *
 * Override 데이터 구조:
 *   {
 *     frame: { width, height, x, y },          // A모드 (CSS px)
 *     crop:  { imgW, imgH, offsetX, offsetY }, // B모드: 사진 절대 크기 + 박스 중앙 기준 오프셋
 *     src:   string,                            // 사진 교체된 경우
 *     zIndex: number,
 *   }
 *
 *   - imgW/imgH가 없으면 cover 효과 (박스에 꽉 채우기)
 *   - imgW/imgH가 있으면 그 크기 그대로 박스 안에 그려짐 (박스가 커지든 작아지든 사진은 안 변함)
 */

const fallbackImg =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect fill="%23e8e5e1" width="400" height="400"/><text x="50%25" y="50%25" font-size="18" text-anchor="middle" fill="%238a8680" font-family="sans-serif" dy=".3em">사진이 필요합니다</text></svg>';

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

const SNAP_THRESHOLD = 8;
const MIN_FRAME_SIZE = 40;
const MIN_IMG_SCALE = 0.5;
const MAX_IMG_SCALE = 4.0;

/**
 * 박스 크기에 맞춰 cover하는 사진의 표시 크기 계산
 * (object-fit: cover 효과를 절대 px로 표현)
 *
 * @param {number} boxW - 박스 가로
 * @param {number} boxH - 박스 세로
 * @param {number} natW - 사진 원본 가로 비율값 (없으면 1)
 * @param {number} natH - 사진 원본 세로 비율값 (없으면 1)
 * @returns {{w, h}} 사진의 표시 크기
 */
function coverSize(boxW, boxH, natW = 1, natH = 1) {
  const boxRatio = boxW / boxH;
  const imgRatio = natW / natH;
  if (imgRatio > boxRatio) {
    // 사진이 더 가로로 넓음 → 높이 맞추고 가로 넘치게
    return { w: boxH * imgRatio, h: boxH };
  } else {
    // 사진이 더 세로로 김 → 가로 맞추고 세로 넘치게
    return { w: boxW, h: boxW / imgRatio };
  }
}

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
  const wrapperRef = useRef(null);
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const [hovering, setHovering] = useState(false);
  const [mode, setMode] = useState('idle'); // 'idle' | 'cropping'
  const [resizing, setResizing] = useState(null);
  const [draggingFrame, setDraggingFrame] = useState(null);
  const [draggingCrop, setDraggingCrop] = useState(null);
  const [showSwapPanel, setShowSwapPanel] = useState(false);
  const [snapLines, setSnapLines] = useState({ v: null, h: null });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });    // wrapper 측정값
  const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });      // 이미지 원본 비율

  const frame = override?.frame || null;
  const crop = override?.crop || null; // null이면 cover 효과
  const currentSrc = override?.src || src;

  // wrapper 초기 크기 측정
  useEffect(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    if (rect.width > 0 && naturalSize.w === 0) {
      let h = rect.width;
      try {
        const [aw, ah] = aspect.split('/').map((s) => parseFloat(s.trim()));
        if (aw && ah) h = (rect.width * ah) / aw;
      } catch {}
      setNaturalSize({ w: rect.width, h });
    }
  }, [aspect, naturalSize.w]);

  // 이미지 원본 비율 측정
  const handleImgLoad = (e) => {
    const w = e.target.naturalWidth || 1;
    const h = e.target.naturalHeight || 1;
    setImgNatural({ w, h });
  };

  const getParentRect = () => wrapperRef.current?.parentElement?.getBoundingClientRect() || null;

  // 현재 박스 크기 (frame 우선, 없으면 wrapper)
  const boxW = frame ? frame.width : naturalSize.w;
  const boxH = frame ? frame.height : naturalSize.h;

  // 현재 사진 표시 크기 (crop 우선, 없으면 cover 자동)
  const cover = boxW > 0 && boxH > 0 ? coverSize(boxW, boxH, imgNatural.w, imgNatural.h) : { w: 0, h: 0 };
  const imgW = crop?.imgW ?? cover.w;
  const imgH = crop?.imgH ?? cover.h;
  const offsetX = crop?.offsetX ?? 0;
  const offsetY = crop?.offsetY ?? 0;

  // 현재 스케일 (UI 표시용) — cover 기준 대비 배율
  const currentScale = cover.w > 0 ? imgW / cover.w : 1;

  // ─── A모드: 프레임 리사이즈 ──────────────────────
  const handleResizeStart = (e, handleId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
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
      aspectRatio: w / h,
    });
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      // 기본: 비율 잠금 ON / Shift: 자유 변형
      const ratioLock = !e.shiftKey;
      let { startW, startH, startFx, startFy } = resizing;
      let w = startW, h = startH, fx = startFx, fy = startFy;
      const ar = resizing.aspectRatio;
      const handle = resizing.handle;

      if (handle.includes('e')) w = startW + dx;
      if (handle.includes('w')) { w = startW - dx; fx = startFx + dx; }
      if (handle.includes('s')) h = startH + dy;
      if (handle.includes('n')) { h = startH - dy; fy = startFy + dy; }

      if (ratioLock) {
        if (handle === 'n' || handle === 's') w = h * ar;
        else if (handle === 'e' || handle === 'w') h = w / ar;
        else {
          // 코너 — 큰 변화량 우선
          if (Math.abs(dx) > Math.abs(dy)) h = w / ar;
          else w = h * ar;
        }
        // 비율 잠금 시 위/왼쪽 핸들이면 fx/fy 보정
        if (handle.includes('w') && (handle === 'nw' || handle === 'sw')) {
          fx = startFx + (startW - w);
        }
        if (handle.includes('n') && (handle === 'nw' || handle === 'ne')) {
          fy = startFy + (startH - h);
        }
        if (handle === 'n') fy = startFy + (startH - h);
        if (handle === 'w') fx = startFx + (startW - w);
      }

      w = Math.max(MIN_FRAME_SIZE, w);
      h = Math.max(MIN_FRAME_SIZE, h);

      // 스냅
      const parent = getParentRect();
      let snapV = null;
      if (parent && wrapperRef.current) {
        const wrapperRect = wrapperRef.current.getBoundingClientRect();
        const availRight = parent.right - wrapperRect.left;
        const wrapperCenter = parent.width / 2 - (wrapperRect.left - parent.left);
        if (Math.abs(fx - 0) < SNAP_THRESHOLD) { fx = 0; snapV = 'left'; }
        if (Math.abs(fx + w - availRight) < SNAP_THRESHOLD) {
          if (handle.includes('w')) fx = availRight - w;
          else w = availRight - fx;
          snapV = 'right';
        }
        if (Math.abs(fx + w / 2 - wrapperCenter) < SNAP_THRESHOLD) {
          fx = wrapperCenter - w / 2;
          snapV = 'center';
        }
      }
      setSnapLines({ v: snapV, h: null });

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

  // ─── A모드: 프레임 위치 이동 ──────────────────────
  const handleFrameDragStart = (e) => {
    if (mode === 'cropping') return;
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

      const parent = getParentRect();
      let snapV = null;
      if (parent && wrapperRef.current) {
        const wrapperRect = wrapperRef.current.getBoundingClientRect();
        const fw = frame?.width ?? naturalSize.w;
        const availRight = parent.right - wrapperRect.left;
        const wrapperCenter = parent.width / 2 - (wrapperRect.left - parent.left);
        if (Math.abs(nx) < SNAP_THRESHOLD) { nx = 0; snapV = 'left'; }
        if (Math.abs(nx + fw - availRight) < SNAP_THRESHOLD) { nx = availRight - fw; snapV = 'right'; }
        if (Math.abs(nx + fw / 2 - wrapperCenter) < SNAP_THRESHOLD) { nx = wrapperCenter - fw / 2; snapV = 'center'; }
      }
      setSnapLines({ v: snapV, h: null });

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

  // ─── B모드: 크롭 (사진 이동) ──────────────────────
  const handleCropDragStart = (e) => {
    if (mode !== 'cropping') return;
    if (e.target.closest('[data-toolbar]')) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingCrop({
      startX: e.clientX,
      startY: e.clientY,
      startOx: offsetX,
      startOy: offsetY,
    });
  };

  useEffect(() => {
    if (!draggingCrop) return;
    const onMove = (e) => {
      const dx = e.clientX - draggingCrop.startX;
      const dy = e.clientY - draggingCrop.startY;
      onChange({
        crop: {
          imgW, imgH,
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
  }, [draggingCrop, imgW, imgH, onChange]);

  // 휠 확대/축소 (Shift 키 필요 — 페이지 스크롤과 충돌 방지)
  const handleWheel = useCallback((e) => {
    if (mode !== 'cropping') return;
    if (!e.shiftKey) return; // Shift 안 누르면 정상 스크롤
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(MIN_IMG_SCALE, Math.min(MAX_IMG_SCALE, currentScale + delta));
    onChange({
      crop: {
        imgW: Math.round(cover.w * newScale),
        imgH: Math.round(cover.h * newScale),
        offsetX, offsetY,
      },
    });
  }, [mode, currentScale, cover.w, cover.h, offsetX, offsetY, onChange]);

  // 슬라이더 onChange
  const handleScaleChange = (newScale) => {
    onChange({
      crop: {
        imgW: Math.round(cover.w * newScale),
        imgH: Math.round(cover.h * newScale),
        offsetX, offsetY,
      },
    });
  };

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

  // ─── 편집모드 OFF: 단순 렌더 ──────────────────────
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
            ref={imgRef}
            src={currentSrc || fallbackImg}
            alt={alt}
            crossOrigin="anonymous"
            draggable={false}
            onLoad={handleImgLoad}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: imgW || '100%',
              height: imgH || '100%',
              maxWidth: 'none',
              transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
              objectFit: imgW ? 'fill' : 'cover',
              display: 'block',
              userSelect: 'none',
            }}
          />
        </div>
      </div>
    );
  }

  // ─── 편집모드 ON ──────────────────────────────────────────
  const hasFrame = !!frame;
  const fw = hasFrame ? frame.width : naturalSize.w || 0;
  const fh = hasFrame ? frame.height : naturalSize.h || 0;
  const fx = hasFrame ? frame.x : 0;
  const fy = hasFrame ? frame.y : 0;
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
          width: hasFrame ? fw : '100%',
          height: hasFrame ? fh : undefined,
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
          ref={imgRef}
          src={currentSrc || fallbackImg}
          alt={alt}
          crossOrigin="anonymous"
          draggable={false}
          onLoad={handleImgLoad}
          onMouseDown={mode === 'cropping' ? handleCropDragStart : undefined}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: imgW > 0 ? imgW : '100%',
            height: imgH > 0 ? imgH : '100%',
            maxWidth: 'none',
            transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
            objectFit: imgW > 0 ? 'fill' : 'cover',
            display: 'block',
            userSelect: 'none',
            pointerEvents: mode === 'cropping' ? 'auto' : 'none',
          }}
        />

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

      {/* A모드 핸들 */}
      {mode === 'idle' && (hovering || resizing || draggingFrame) &&
        HANDLES.map((h) => {
          const style = {
            position: 'absolute',
            width: 12,
            height: 12,
            backgroundColor: '#3b82f6',
            border: '2px solid #fff',
            borderRadius: 3,
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            cursor: h.cursor,
            zIndex: 20,
          };
          // 좌표 계산
          if (typeof h.left === 'number') style.left = fx + h.left;
          else if (h.left === '50%') style.left = fx + (fw / 2) - 6;
          if (h.right !== undefined) style.left = fx + fw + h.right - 6;
          if (typeof h.top === 'number') style.top = fy + h.top;
          else if (h.top === '50%') style.top = fy + (fh / 2) - 6;
          if (h.bottom !== undefined) style.top = fy + fh + h.bottom - 6;

          return (
            <div
              key={h.id}
              data-handle
              onMouseDown={(e) => handleResizeStart(e, h.id)}
              title={`드래그=비율유지 / Shift+드래그=자유변형 (${h.id})`}
              style={style}
            />
          );
        })}

      {/* 좌상단 툴바 (idle) */}
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
            title="크롭 모드 (사진 안쪽만 조정) — 더블클릭으로도 진입"
            style={toolbarBtnStyle('#3b82f6')}
          >
            🔍 크롭
          </button>
          {hasFrame && (
            <button
              onClick={(e) => { e.stopPropagation(); onChange({ frame: null }); }}
              title="프레임 크기/위치 초기화"
              style={toolbarBtnStyle('#7c2d12')}
            >
              ↺ 프레임
            </button>
          )}
          {crop && (
            <button
              onClick={(e) => { e.stopPropagation(); onChange({ crop: null }); }}
              title="크롭 초기화 (자동 cover로 복원)"
              style={toolbarBtnStyle('#7c2d12')}
            >
              ↺ 크롭
            </button>
          )}
        </div>
      )}

      {/* 크기 표시 */}
      {mode === 'idle' && hasFrame && (hovering || resizing || draggingFrame) && (
        <div
          style={{
            position: 'absolute',
            left: fx + fw - 90,
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
          {Math.round(fw)} × {Math.round(fh)}
        </div>
      )}

      {/* B모드 툴바 */}
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
            min={MIN_IMG_SCALE}
            max={MAX_IMG_SCALE}
            step="0.05"
            value={currentScale}
            onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
            style={{ width: 130, accentColor: '#f97316' }}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, minWidth: 40 }}>
            {Math.round(currentScale * 100)}%
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
            onClick={(e) => { e.stopPropagation(); onChange({ crop: null }); }}
            title="크롭 초기화 (자동 cover)"
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

      {/* 사진 교체 패널 */}
      {mode === 'cropping' && showSwapPanel && (
        <div
          data-toolbar
          style={{
            position: 'absolute',
            left: fx,
            top: fy + fh + 8,
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
                onChange({ src: imgUrl, crop: null }); // 교체 시 크롭 자동 리셋
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

      {/* 스냅 가이드라인 */}
      {snapLines.v && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left:
              snapLines.v === 'left' ? fx :
              snapLines.v === 'right' ? fx + fw :
              fx + fw / 2,
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
