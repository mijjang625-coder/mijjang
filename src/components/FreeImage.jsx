import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * FreeImage — 자유 배치 이미지 (페이지 캠버스 위에서 절대 위치)
 *
 * 페이지 안 어디에든 절대 좌표로 떠 있는 이미지. 사용자가 추가한 사진이며,
 * EditableImage와 비슷한 A모드(프레임 리사이즈)/B모드(크롭) 기능을 제공한다.
 * 추가로 위치 자유 이동, 삭제, 레이어 순서 변경 버튼을 가진다.
 *
 * Props:
 *   - item: { id, src, x, y, w, h, crop, zIndex }
 *   - editMode: boolean
 *   - availableImages: string[] — 사진 교체 후보 (추후 확장)
 *   - onUpdate: (partial) => void — 위치/크기/크롭 변경
 *   - onDelete: () => void
 *   - onChangeLayer: (action) => void — 'front'|'back'|'forward'|'backward'
 *   - canvasWidth: number — 부모 캠버스 가로 (스냅 기준, 보통 780)
 */

const HANDLES = [
  { id: 'nw', cursor: 'nwse-resize' },
  { id: 'n',  cursor: 'ns-resize' },
  { id: 'ne', cursor: 'nesw-resize' },
  { id: 'e',  cursor: 'ew-resize' },
  { id: 'se', cursor: 'nwse-resize' },
  { id: 's',  cursor: 'ns-resize' },
  { id: 'sw', cursor: 'nesw-resize' },
  { id: 'w',  cursor: 'ew-resize' },
];

const SNAP_THRESHOLD = 8;
const MIN_SIZE = 40;
const MIN_IMG_SCALE = 1.0;
const MAX_IMG_SCALE = 4.0;

function coverSize(boxW, boxH, natW = 1, natH = 1) {
  const boxRatio = boxW / boxH;
  const imgRatio = natW / natH;
  if (imgRatio > boxRatio) return { w: boxH * imgRatio, h: boxH };
  return { w: boxW, h: boxW / imgRatio };
}

export default function FreeImage({
  item,
  editMode = false,
  onUpdate = () => {},
  onDelete = () => {},
  onChangeLayer = () => {},
  canvasWidth = 780,
}) {
  const wrapRef = useRef(null);
  const [hovering, setHovering] = useState(false);
  const [selected, setSelected] = useState(false);
  const [mode, setMode] = useState('idle'); // 'idle' | 'cropping'
  const [draggingPos, setDraggingPos] = useState(null);   // 위치 이동
  const [resizing, setResizing] = useState(null);         // 리사이즈
  const [draggingCrop, setDraggingCrop] = useState(null); // 크롭 모드 사진 이동
  const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });
  const [snapV, setSnapV] = useState(null);

  const { id, src, x = 0, y = 0, w = 200, h = 200, crop, zIndex = 100 } = item;
  const cover = coverSize(w, h, imgNatural.w, imgNatural.h);
  const currentScale = Math.max(MIN_IMG_SCALE, crop?.scale ?? 1.0);
  const imgW = cover.w * currentScale;
  const imgH = cover.h * currentScale;
  const offsetX = (crop?.offsetXR ?? 0) * w;
  const offsetY = (crop?.offsetYR ?? 0) * h;

  const handleImgLoad = (e) => {
    setImgNatural({ w: e.target.naturalWidth || 1, h: e.target.naturalHeight || 1 });
  };

  // 편집모드 OFF 시 선택 해제
  useEffect(() => {
    if (!editMode) {
      setSelected(false);
      setMode('idle');
    }
  }, [editMode]);

  // 클릭 외부 시 선택 해제
  useEffect(() => {
    if (!selected) return;
    const onDocClick = (e) => {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target)) return;
      if (e.target.closest('[data-free-toolbar]')) return;
      setSelected(false);
      setMode('idle');
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [selected]);

  // ─── 위치 드래그 ──────────────────────
  const handlePosDragStart = (e) => {
    if (!editMode) return;
    if (mode === 'cropping') return;
    if (e.target.closest('[data-handle]')) return;
    if (e.target.closest('[data-free-toolbar]')) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(true);
    setDraggingPos({ startX: e.clientX, startY: e.clientY, sx: x, sy: y });
  };

  useEffect(() => {
    if (!draggingPos) return;
    const onMove = (e) => {
      const dx = e.clientX - draggingPos.startX;
      const dy = e.clientY - draggingPos.startY;
      let nx = draggingPos.sx + dx;
      let ny = draggingPos.sy + dy;

      // 스냅: 캠버스 좌/우/중앙
      let sV = null;
      if (Math.abs(nx) < SNAP_THRESHOLD) { nx = 0; sV = 'left'; }
      if (Math.abs(nx + w - canvasWidth) < SNAP_THRESHOLD) { nx = canvasWidth - w; sV = 'right'; }
      if (Math.abs(nx + w / 2 - canvasWidth / 2) < SNAP_THRESHOLD) { nx = canvasWidth / 2 - w / 2; sV = 'center'; }
      setSnapV(sV);

      onUpdate({ x: Math.round(nx), y: Math.round(ny) });
    };
    const onUp = () => { setDraggingPos(null); setSnapV(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingPos, w, canvasWidth, onUpdate]);

  // ─── 리사이즈 ──────────────────────
  const handleResizeStart = (e, handleId) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(true);
    setResizing({
      handle: handleId,
      startX: e.clientX,
      startY: e.clientY,
      sw: w, sh: h, sx: x, sy: y,
      ar: w / h,
    });
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      const ratioLock = !e.shiftKey;
      let { sw, sh, sx, sy, handle, ar } = resizing;
      let nw = sw, nh = sh, nx = sx, ny = sy;

      if (handle.includes('e')) nw = sw + dx;
      if (handle.includes('w')) { nw = sw - dx; nx = sx + dx; }
      if (handle.includes('s')) nh = sh + dy;
      if (handle.includes('n')) { nh = sh - dy; ny = sy + dy; }

      if (ratioLock) {
        if (handle === 'n' || handle === 's') nw = nh * ar;
        else if (handle === 'e' || handle === 'w') nh = nw / ar;
        else {
          if (Math.abs(dx) > Math.abs(dy)) nh = nw / ar;
          else nw = nh * ar;
        }
        if (handle === 'nw' || handle === 'sw') nx = sx + (sw - nw);
        if (handle === 'nw' || handle === 'ne') ny = sy + (sh - nh);
        if (handle === 'n') ny = sy + (sh - nh);
        if (handle === 'w') nx = sx + (sw - nw);
      }

      nw = Math.max(MIN_SIZE, nw);
      nh = Math.max(MIN_SIZE, nh);
      onUpdate({
        w: Math.round(nw), h: Math.round(nh),
        x: Math.round(nx), y: Math.round(ny),
      });
    };
    const onUp = () => setResizing(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, onUpdate]);

  // ─── 크롭 (사진 위치) ──────────────────────
  const handleCropDragStart = (e) => {
    if (mode !== 'cropping') return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingCrop({
      startX: e.clientX,
      startY: e.clientY,
      sox: offsetX,
      soy: offsetY,
    });
  };

  const clampOffset = (ox, oy, _imgW = imgW, _imgH = imgH) => {
    const maxOx = Math.max(0, (_imgW - w) / 2);
    const maxOy = Math.max(0, (_imgH - h) / 2);
    return {
      x: Math.max(-maxOx, Math.min(maxOx, ox)),
      y: Math.max(-maxOy, Math.min(maxOy, oy)),
    };
  };

  useEffect(() => {
    if (!draggingCrop) return;
    const onMove = (e) => {
      const dx = e.clientX - draggingCrop.startX;
      const dy = e.clientY - draggingCrop.startY;
      const c = clampOffset(draggingCrop.sox + dx, draggingCrop.soy + dy);
      onUpdate({
        crop: {
          scale: currentScale,
          offsetXR: w > 0 ? c.x / w : 0,
          offsetYR: h > 0 ? c.y / h : 0,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingCrop, w, h, currentScale, imgW, imgH]);

  const handleScaleChange = (newScale) => {
    const newImgW = cover.w * newScale;
    const newImgH = cover.h * newScale;
    const c = clampOffset(offsetX, offsetY, newImgW, newImgH);
    onUpdate({
      crop: {
        scale: newScale,
        offsetXR: w > 0 ? c.x / w : 0,
        offsetYR: h > 0 ? c.y / h : 0,
      },
    });
  };

  const handleDoubleClick = (e) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(true);
    setMode('cropping');
  };

  // ESC: 크롭 모드 종료
  useEffect(() => {
    if (mode !== 'cropping') return;
    const onKey = (e) => { if (e.key === 'Escape') setMode('idle'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // ─── 렌더 ──────────────────────
  const showHandles = editMode && (selected || hovering || resizing) && mode === 'idle';
  const showToolbar = editMode && (selected || hovering) && mode === 'idle';

  return (
    <div
      ref={wrapRef}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onMouseDown={handlePosDragStart}
      onDoubleClick={handleDoubleClick}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        backgroundColor: '#e8e5e1',
        overflow: 'hidden',
        outline:
          mode === 'cropping' ? '2px solid #f97316'
          : selected ? '2px solid #3b82f6'
          : (hovering && editMode) ? '2px dashed #3b82f6'
          : editMode ? '1px dashed rgba(96,165,250,0.5)'
          : 'none',
        outlineOffset: 1,
        cursor: editMode
          ? (mode === 'cropping' ? (draggingCrop ? 'grabbing' : 'grab')
             : draggingPos ? 'grabbing' : 'move')
          : 'default',
        zIndex,
        userSelect: 'none',
        boxShadow: editMode && selected ? '0 4px 14px rgba(59,130,246,0.25)' : 'none',
      }}
    >
      <img
        src={src}
        alt=""
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
          objectFit: 'cover',
          display: 'block',
          userSelect: 'none',
          pointerEvents: mode === 'cropping' ? 'auto' : 'none',
        }}
      />

      {/* A모드 핸들 */}
      {showHandles && HANDLES.map((handle) => {
        const s = { position: 'absolute', width: 12, height: 12, backgroundColor: '#3b82f6',
          border: '2px solid #fff', borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          cursor: handle.cursor, zIndex: 20 };
        if (handle.id.includes('w')) s.left = -6;
        else if (handle.id.includes('e')) s.right = -6;
        else { s.left = '50%'; s.marginLeft = -6; }
        if (handle.id.includes('n')) s.top = -6;
        else if (handle.id.includes('s')) s.bottom = -6;
        else { s.top = '50%'; s.marginTop = -6; }
        return (
          <div key={handle.id} data-handle
            onMouseDown={(e) => handleResizeStart(e, handle.id)}
            style={s}
            title={`드래그=비율유지 / Shift=자유변형`}
          />
        );
      })}

      {/* idle 툴바 (좌상단) */}
      {showToolbar && (
        <div
          data-free-toolbar
          style={{
            position: 'absolute',
            left: 0,
            top: -36,
            display: 'flex',
            gap: 3,
            zIndex: 30,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button onClick={() => setMode('cropping')} style={btn('#3b82f6')} title="크롭 모드 (더블클릭으로도 진입)">🔍 크롭</button>
          <button onClick={() => onChangeLayer('front')} style={btn('#475569')} title="맨 앞으로">▲▲</button>
          <button onClick={() => onChangeLayer('forward')} style={btn('#64748b')} title="한 단계 앞으로">▲</button>
          <button onClick={() => onChangeLayer('backward')} style={btn('#64748b')} title="한 단계 뒤로">▼</button>
          <button onClick={() => onChangeLayer('back')} style={btn('#475569')} title="맨 뒤로">▼▼</button>
          <button onClick={() => { if (window.confirm('이 사진을 삭제할까요?')) onDelete(); }} style={btn('#dc2626')} title="삭제">🗑</button>
        </div>
      )}

      {/* 크기 표시 */}
      {showHandles && (
        <div style={{
          position: 'absolute', right: 4, top: 4,
          backgroundColor: 'rgba(30,41,59,0.85)', color: '#fff',
          padding: '2px 5px', borderRadius: 4, fontSize: 10, fontWeight: 800,
          zIndex: 30, pointerEvents: 'none',
        }}>
          {Math.round(w)}×{Math.round(h)} · z{zIndex}
        </div>
      )}

      {/* B모드 툴바 */}
      {mode === 'cropping' && (
        <div
          data-free-toolbar
          style={{
            position: 'absolute', left: 0, top: -50,
            display: 'flex', gap: 6, alignItems: 'center',
            backgroundColor: '#1e293b', padding: '8px 12px',
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 40,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>확대:</span>
          <input
            type="range" min={MIN_IMG_SCALE} max={MAX_IMG_SCALE} step="0.05"
            value={currentScale}
            onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
            style={{ width: 110, accentColor: '#f97316' }}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, minWidth: 36 }}>
            {Math.round(currentScale * 100)}%
          </span>
          <button onClick={() => onUpdate({ crop: null })} style={btn('#7c2d12')} title="크롭 초기화">↺</button>
          <button onClick={() => setMode('idle')} style={btn('#16a34a')} title="완료 (ESC)">✓</button>
        </div>
      )}

      {/* 스냅 가이드 */}
      {snapV && (
        <div style={{
          position: 'absolute',
          left: snapV === 'left' ? 0 : snapV === 'right' ? w - 1 : w / 2,
          top: -1000, height: 3000, width: 1,
          backgroundColor: '#ec4899',
          pointerEvents: 'none', zIndex: 100,
        }} />
      )}
    </div>
  );
}

function btn(color) {
  return {
    backgroundColor: color,
    color: '#fff',
    border: 'none',
    padding: '5px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    minWidth: 28,
  };
}
