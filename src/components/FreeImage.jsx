import { useRef, useState, useEffect, useCallback } from 'react';
import { announceEditorSelection, useEditorSelectionListener } from '../lib/editorSelection.js';

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
const MIN_IMG_SCALE = 0.5;   // 50%까지 축소 가능 (EditableImage v4와 동일)
const MAX_IMG_SCALE = 4.0;   // 400%까지 확대
const FREE_RADIUS = 0;       // 자유 이미지 기본 모서리 각지게(전 페이지 통일)

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
  onDuplicate = () => {},  // Alt+드래그 / Ctrl+C→V 복제
  onDragStart = () => {},  // 드래그/리사이즈 시작 직전 — 히스토리 스냅샷용
  canvasWidth = 780,
  frameRadius = FREE_RADIUS,
  isActive = false,
  onActivate = () => {},
  // 다른 레이어가 활성화되어 있는지 (자기 자신은 제외) — true면 이 레이어는 클릭 통과
  hasActiveOther = false,
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
  // 🎨 색상/밝기/채도 조정 패널 (idle 모드에서)
  const [showAdjust, setShowAdjust] = useState(false);

  const { id, src, x = 0, y = 0, w = 200, h = 200, crop, zIndex = 100, adjust } = item;
  // 색상 조정 기본값
  const adj = {
    brightness: adjust?.brightness ?? 100,  // 0~200 (%)
    contrast:   adjust?.contrast   ?? 100,  // 0~200 (%)
    saturate:   adjust?.saturate   ?? 100,  // 0~200 (%)
    hue:        adjust?.hue        ?? 0,    // -180~180 (deg)
  };
  const cssFilter = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturate}%) hue-rotate(${adj.hue}deg)`;
  const isAdjusted =
    adj.brightness !== 100 || adj.contrast !== 100 || adj.saturate !== 100 || adj.hue !== 0;
  const cover = coverSize(w, h, imgNatural.w, imgNatural.h);
  // 크롭 모드에서는 50%까지 축소 허용, idle 모드에서는 cover 보장(>=1)
  const rawScale = crop?.scale ?? 1.0;
  const currentScale = Math.max(MIN_IMG_SCALE, Math.min(MAX_IMG_SCALE, rawScale));
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

  // ─── 위치 드래그 (3px 임계값으로 클릭/더블클릭과 구분) ──────────────────────
  const handlePosDragStart = (e) => {
    if (!editMode) return;
    if (mode === 'cropping') return;
    if (e.target.closest('[data-handle]')) return;
    if (e.target.closest('[data-free-toolbar]')) return;
    if (e.target.closest('[data-replace-panel]')) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    announceEditorSelection(`free-image:${id}`);
    setSelected(true);
    if (typeof onActivate === 'function') onActivate();
    setDraggingPos({
      startX: e.clientX, startY: e.clientY, sx: x, sy: y,
      active: false,
      isAlt: e.altKey,  // Alt 키 눌렸는지 기억
    });
  };

  // 🆕 다른 요소가 활성화되면 자기 선택/조정 패널 닫기
  const closeOnOtherSelect = useCallback(() => {
    setSelected(false);
    setShowAdjust(false);
    setMode('idle');
  }, []);
  useEditorSelectionListener(`free-image:${id}`, closeOnOtherSelect);

  // ⌨️ 화살표 미세 이동 — 활성 자유사진을 1px(Shift=10px) 단위로 이동
  useEffect(() => {
    if (!editMode || !isActive) return undefined;

    const handleKeydown = (e) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (e.metaKey || e.ctrlKey) return;

      const activeEl = document.activeElement;
      const tag = (activeEl?.tagName || '').toLowerCase();
      const isTypingTarget =
        !!activeEl?.isContentEditable ||
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        tag === 'button';
      if (isTypingTarget) return;

      e.preventDefault();
      e.stopPropagation();

      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      onUpdate({ x: Math.round(x + dx), y: Math.round(y + dy) });
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [editMode, isActive, x, y, onUpdate]);

  useEffect(() => {
    if (!draggingPos) return;
    const DRAG_THRESHOLD = 3; // 3px 이상 움직여야 실제 드래그로 인식
    let altDuplicated = false; // Alt+드래그: 복제 한 번만 실행
    const onMove = (e) => {
      const dx = e.clientX - draggingPos.startX;
      const dy = e.clientY - draggingPos.startY;
      // 임계값 미만이면 아직 드래그 아님
      if (!draggingPos.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!draggingPos.active) {
        setDraggingPos((p) => ({ ...p, active: true }));
        onDragStart(); // ← 드래그 확정 시점에 히스토리 스냅샷
        // ✨ Alt+드래그: 드래그 시작 시점에 복제본 생성 → 원본은 제자리 유지
        if (draggingPos.isAlt && !altDuplicated) {
          altDuplicated = true;
          onDuplicate(0, 0); // 원본 위치 그대로 복제 (이후 원본이 이동)
        }
      }
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
    onDragStart(); // ← 리사이즈 시작 시점에 히스토리 스냅샷
    // 🆕 (2026-05-03) 리사이즈 시작 시점의 사진 절대 크기/오프셋 기억
    // → Shift 단방향 리사이즈 시 사진 위치/크기를 유지하기 위해 사용
    const startCover = coverSize(w, h, imgNatural.w, imgNatural.h);
    const startScale = crop?.scale ?? 1.0;
    const startOffsetXR = crop?.offsetXR ?? 0;
    const startOffsetYR = crop?.offsetYR ?? 0;
    setResizing({
      handle: handleId,
      startX: e.clientX,
      startY: e.clientY,
      sw: w, sh: h, sx: x, sy: y,
      ar: w / h,
      // 🆕 사진 절대 크기/위치 보존용
      startImgW: startCover.w * startScale,
      startImgH: startCover.h * startScale,
      startScale,
      startOffsetX: startOffsetXR * w,  // 절대 px 오프셋
      startOffsetY: startOffsetYR * h,
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

      // 🆕 (2026-05-03) Shift(자유 변형) 리사이즈 시 사진 절대 크기/위치 유지
      // → 박스만 줄이고 내부 사진은 그대로 둠 (초점/위치 보존)
      const update = {
        w: Math.round(nw), h: Math.round(nh),
        x: Math.round(nx), y: Math.round(ny),
      };
      if (!ratioLock) {
        // 🆕 (2026-05-03) Shift 단방향 리사이즈 — 사진 절대 크기/위치 완전 고정
        // 사진 화면상 left/top과 width/height를 그대로 유지하도록
        // scale과 offset을 동시에 보정한다.
        const newCover = coverSize(nw, nh, imgNatural.w, imgNatural.h);
        if (newCover.w > 0 && newCover.h > 0) {
          // cover는 종횡비가 고정 → 한 축 기준 scale이면 양 축 모두 비례 유지
          const newScale = resizing.startImgW / newCover.w;
          const newImgW = newCover.w * newScale;
          const newImgH = newCover.h * newScale;
          // 기존 사진의 절대 left/top (박스 좌상단 기준 px)
          const oldImgLeft = (resizing.sw - resizing.startImgW) / 2 + resizing.startOffsetX;
          const oldImgTop  = (resizing.sh - resizing.startImgH) / 2 + resizing.startOffsetY;
          // 새 박스에서 사진 left/top을 그대로 유지하도록 offset 재계산
          const newOffsetX = oldImgLeft - (nw - newImgW) / 2;
          const newOffsetY = oldImgTop  - (nh - newImgH) / 2;
          const newOffsetXR = nw > 0 ? newOffsetX / nw : 0;
          const newOffsetYR = nh > 0 ? newOffsetY / nh : 0;
          update.crop = {
            scale: newScale,
            offsetXR: newOffsetXR,
            offsetYR: newOffsetYR,
          };
        }
      }
      onUpdate(update);
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

  // ─── 사진 교체 패널 ──────────────────────
  const [showReplace, setShowReplace] = useState(false);

  // 사진 교체 패널 외부 클릭 시 닫기
  useEffect(() => {
    if (!showReplace) return;
    const onDocClick = (e) => {
      if (e.target.closest('[data-replace-panel]')) return;
      if (e.target.closest('[data-replace-trigger]')) return;
      setShowReplace(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showReplace]);

  // ─── 렌더 ──────────────────────
  // 핸들/툴바는 "활성 레이어"일 때만 표시 (호버만 했다고 보이지 않음)
  // 단, 크롭모드는 이미 활성 상태로 들어온 것이므로 별도 처리
  const showHandles = editMode && isActive && mode === 'idle';
  const showToolbar = editMode && isActive && mode === 'idle';

  // 툴바 위치: 박스가 페이지 상단에 있으면 박스 아래에 표시
  const toolbarBelow = y < 50;

  return (
    <div
      ref={wrapRef}
      data-free-image="true"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onMouseDown={(e) => {
        // 활성 레이어로 등록 (레이어 패널과 연동)
        if (editMode) onActivate();
        handlePosDragStart(e);
      }}
      onDoubleClick={handleDoubleClick}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        overflow: 'visible',
        cursor: editMode
          ? (mode === 'cropping' ? (draggingCrop ? 'grabbing' : 'grab')
             : draggingPos ? 'grabbing' : 'move')
          : 'default',
        zIndex,
        userSelect: 'none',
        boxShadow: editMode && isActive ? '0 4px 14px rgba(59,130,246,0.25)' : 'none',
        // 항상 클릭 가능 — 레이어 순서(z-index)에 따라 위에 있는 이미지가 잡힌다.
        // (정렬 버튼 ▲▼ 또는 우측 레이어 패널로 원하는 이미지를 위로 올려서 선택)
        pointerEvents: 'auto',
      }}
    >
      {/* 내부 클리핑 컨테이너 (사진 자르기 + 둥근 모서리) */}
      {/* 외곽선은 활성 레이어이거나 크롭 모드일 때만 표시 — 화면 깔끔하게 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#e8e5e1',
          overflow: 'hidden',
          borderRadius: frameRadius,
          outline:
            mode === 'cropping' ? '2px solid #f97316'
            : (editMode && isActive) ? '2px solid #3b82f6'
            : 'none',
          outlineOffset: 1,
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
            // 🎨 색상/밝기/채도/색조 조정
            filter: cssFilter,
          }}
        />
      </div>

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

      {/* idle 툴바 — 메인사진 스타일과 통일 (텍스트 라벨 + 색상 구분) */}
      {showToolbar && (
        <div
          data-free-toolbar
          style={{
            position: 'absolute',
            left: 0,
            top: toolbarBelow ? h + 6 : -42,
            display: 'flex', gap: 6, alignItems: 'center',
            backgroundColor: '#1e293b',
            padding: '6px 10px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 100001,
            whiteSpace: 'nowrap',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setMode('cropping'); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={btnLabel('#3b82f6')} title="크롭 모드 (더블클릭으로도 진입)"
          >🔍 크롭</button>
          <span style={{ width: 1, height: 18, backgroundColor: '#475569' }} />
          <button
            onClick={(e) => { e.stopPropagation(); onChangeLayer('front'); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={btnLabel('#475569')} title="맨 앞으로"
          >▲▲ 맨앞</button>
          <button
            onClick={(e) => { e.stopPropagation(); onChangeLayer('forward'); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={btnLabel('#64748b')} title="한 단계 앞으로"
          >▲ 앞</button>
          <button
            onClick={(e) => { e.stopPropagation(); onChangeLayer('backward'); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={btnLabel('#64748b')} title="한 단계 뒤로"
          >▼ 뒤</button>
          <button
            onClick={(e) => { e.stopPropagation(); onChangeLayer('back'); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={btnLabel('#475569')} title="맨 뒤로"
          >▼▼ 맨뒤</button>
          <span style={{
            backgroundColor: '#fbbf24', color: '#1e293b',
            padding: '2px 6px', borderRadius: 4,
            fontSize: 10, fontWeight: 900,
          }}>z{zIndex}</span>
          <span style={{ width: 1, height: 18, backgroundColor: '#475569' }} />
          <button
            onClick={(e) => { e.stopPropagation(); setShowAdjust((s) => !s); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              ...btnLabel(showAdjust ? '#7c3aed' : (isAdjusted ? '#a855f7' : '#475569')),
            }}
            title="색상·밝기·채도 조정"
          >🎨 색상{isAdjusted ? ' •' : ''}</button>
          <span style={{ width: 1, height: 18, backgroundColor: '#475569' }} />
          <button
            onClick={(e) => { e.stopPropagation(); if (window.confirm('이 사진을 삭제할까요?')) onDelete(); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={btnLabel('#dc2626')} title="삭제"
          >🗑 삭제</button>
        </div>
      )}

      {/* 🎨 색상 조정 패널 — idle 모드 + showAdjust ON 일 때 */}
      {showToolbar && showAdjust && (
        <div
          data-free-toolbar
          style={{
            position: 'absolute',
            left: 0,
            top: toolbarBelow ? h + 52 : -250,
            width: 280,
            backgroundColor: '#fff',
            border: '1px solid #e2ddd4',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 12,
            zIndex: 100002,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2F2A26' }}>🎨 색상 조정</div>
            <button
              onClick={() => setShowAdjust(false)}
              style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 14, cursor: 'pointer', padding: 0 }}
              title="닫기"
            >✕</button>
          </div>

          {/* 슬라이더 4종 */}
          <AdjustSlider
            label="🌞 밝기"  unit="%"  min={0} max={200} step={1}
            value={adj.brightness}  defaultValue={100}
            onChange={(v) => onUpdate({ adjust: { ...adj, brightness: v } })}
            color="#f59e0b"
          />
          <AdjustSlider
            label="◐ 대비" unit="%" min={0} max={200} step={1}
            value={adj.contrast} defaultValue={100}
            onChange={(v) => onUpdate({ adjust: { ...adj, contrast: v } })}
            color="#475569"
          />
          <AdjustSlider
            label="🎨 채도" unit="%" min={0} max={200} step={1}
            value={adj.saturate} defaultValue={100}
            onChange={(v) => onUpdate({ adjust: { ...adj, saturate: v } })}
            color="#ec4899"
          />
          <AdjustSlider
            label="🌈 색조" unit="°" min={-180} max={180} step={1}
            value={adj.hue} defaultValue={0}
            onChange={(v) => onUpdate({ adjust: { ...adj, hue: v } })}
            color="#8b5cf6"
          />

          {/* 프리셋 */}
          <div style={{ marginTop: 8, marginBottom: 6, fontSize: 10, fontWeight: 700, color: '#64748b' }}>
            ✨ 프리셋
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            <PresetBtn label="원본" onClick={() => onUpdate({ adjust: null })} />
            <PresetBtn label="선명하게"
              onClick={() => onUpdate({ adjust: { brightness: 105, contrast: 115, saturate: 120, hue: 0 } })} />
            <PresetBtn label="밝게"
              onClick={() => onUpdate({ adjust: { brightness: 120, contrast: 100, saturate: 105, hue: 0 } })} />
            <PresetBtn label="어둡게"
              onClick={() => onUpdate({ adjust: { brightness: 85, contrast: 110, saturate: 100, hue: 0 } })} />
            <PresetBtn label="흑백"
              onClick={() => onUpdate({ adjust: { brightness: 100, contrast: 110, saturate: 0, hue: 0 } })} />
            <PresetBtn label="따뜻하게"
              onClick={() => onUpdate({ adjust: { brightness: 105, contrast: 100, saturate: 115, hue: -10 } })} />
            <PresetBtn label="차갑게"
              onClick={() => onUpdate({ adjust: { brightness: 100, contrast: 100, saturate: 110, hue: 15 } })} />
            <PresetBtn label="빈티지"
              onClick={() => onUpdate({ adjust: { brightness: 95, contrast: 90, saturate: 80, hue: 10 } })} />
            <PresetBtn label="비비드"
              onClick={() => onUpdate({ adjust: { brightness: 100, contrast: 120, saturate: 145, hue: 0 } })} />
          </div>
        </div>
      )}

      {/* 크기 표시 */}
      {showHandles && (
        <div
          data-edit-ui="size-label"
          style={{
            position: 'absolute', right: 4, top: 4,
            backgroundColor: 'rgba(30,41,59,0.85)', color: '#fff',
            padding: '2px 5px', borderRadius: 4, fontSize: 10, fontWeight: 800,
            zIndex: 30, pointerEvents: 'none',
          }}
        >
          {Math.round(w)}×{Math.round(h)}
        </div>
      )}

      {/* B모드 툴바 — 메인사진 스타일과 통일 */}
      {mode === 'cropping' && (
        <div
          data-free-toolbar
          style={{
            position: 'absolute',
            left: 0,
            top: toolbarBelow ? h + 6 : -50,
            display: 'flex', gap: 8, alignItems: 'center',
            backgroundColor: '#1e293b', padding: '8px 12px',
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 100001,
            whiteSpace: 'nowrap',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>확대:</span>
          <input
            type="range" min={MIN_IMG_SCALE} max={MAX_IMG_SCALE} step="0.05"
            value={currentScale}
            onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
            style={{ width: 130, accentColor: '#f97316' }}
            onMouseDown={(e) => e.stopPropagation()}
            title="50% ~ 400%"
          />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, minWidth: 40 }}>
            {Math.round(currentScale * 100)}%
          </span>
          <span style={{ width: 1, height: 18, backgroundColor: '#475569' }} />
          <button
            data-replace-trigger
            onClick={(e) => { e.stopPropagation(); setShowReplace((s) => !s); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={btnLabel('#0ea5e9')} title="다른 사진으로 교체"
          >🔄 사진 교체</button>
          <button
            onClick={(e) => { e.stopPropagation(); onUpdate({ crop: null }); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={btnLabel('#7c2d12')} title="크롭 초기화 (사진 위치/확대만 리셋)"
          >↺ 크롭만</button>
          <button
            onClick={(e) => { e.stopPropagation(); setMode('idle'); setShowReplace(false); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={btnLabel('#16a34a')} title="크롭 모드 종료 (ESC)"
          >✓ 완료</button>
        </div>
      )}

      {/* 사진 교체 패널 — 크롭모드에서만, 박스 우측 또는 아래쪽으로 floating */}
      {mode === 'cropping' && showReplace && (
        <div
          data-replace-panel
          style={{
            position: 'absolute',
            left: w + 12,
            top: 0,
            width: 280,
            maxHeight: 360,
            overflow: 'auto',
            backgroundColor: '#fff',
            border: '1px solid #e2ddd4',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 12,
            zIndex: 100002,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2F2A26' }}>🔄 사진 교체</div>
            <button
              onClick={() => setShowReplace(false)}
              style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 14, cursor: 'pointer' }}
            >✕</button>
          </div>
          <label
            style={{
              display: 'block', border: '2px dashed #93c5fd', backgroundColor: '#eff6ff',
              borderRadius: 8, padding: '10px 8px', textAlign: 'center', fontSize: 11,
              fontWeight: 700, color: '#1d4ed8', cursor: 'pointer', marginBottom: 8,
            }}
          >
            ⬆️ 내 컴퓨터에서 업로드
            <input
              type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  if (ev.target?.result) {
                    onUpdate({ src: ev.target.result, crop: null });
                    setShowReplace(false);
                  }
                };
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />
          </label>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>또는 갤러리에서 선택</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
            {(item.galleryImages || []).filter(Boolean).map((gsrc, gi) => (
              <button
                key={gi}
                onClick={() => { onUpdate({ src: gsrc, crop: null }); setShowReplace(false); }}
                style={{
                  border: gsrc === src ? '2px solid #3b82f6' : '1px solid #e2ddd4',
                  borderRadius: 6, padding: 0, overflow: 'hidden', cursor: 'pointer',
                  aspectRatio: '1 / 1', backgroundColor: '#f3f4f6',
                }}
                title={`사진 ${gi + 1}로 교체`}
              >
                <img src={gsrc} alt="" crossOrigin="anonymous"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
          {(!item.galleryImages || item.galleryImages.filter(Boolean).length === 0) && (
            <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '6px 0' }}>
              (생성된 사진이 없습니다)
            </div>
          )}
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

// 메인사진 스타일과 통일된 라벨 버튼 (텍스트 포함)
function btnLabel(color) {
  return {
    backgroundColor: color,
    color: '#fff',
    border: 'none',
    padding: '6px 10px',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  };
}

// 색상 조정용 슬라이더 (라벨 + 값표시 + 더블클릭 리셋)
function AdjustSlider({ label, unit, min, max, step, value, defaultValue, onChange, color }) {
  const isModified = value !== defaultValue;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 2,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{label}</span>
        <button
          onClick={() => onChange(defaultValue)}
          style={{
            border: 'none', background: 'transparent',
            color: isModified ? color : '#9ca3af',
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
            padding: '0 4px',
          }}
          title="기본값으로 초기화"
        >
          {value}{unit} {isModified ? '↺' : ''}
        </button>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => onChange(defaultValue)}
        style={{ width: '100%', accentColor: color, cursor: 'pointer' }}
        title="더블클릭으로 초기화"
      />
    </div>
  );
}

// 색상 프리셋 작은 버튼
function PresetBtn({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        backgroundColor: '#f3f4f6',
        color: '#374151',
        border: '1px solid #e5e7eb',
        padding: '5px 4px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
    >
      {label}
    </button>
  );
}
