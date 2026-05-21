import { useEffect, useRef, useState, useCallback } from 'react';
import { announceEditorSelection, useEditorSelectionListener } from '../lib/editorSelection.js';

/**
 * ShapeLayer — 페이지 위에 자유롭게 그릴 수 있는 도형 레이어
 *
 * 지원 도형: rect, circle, line, arrow, highlight
 *
 * 페이지 컴포넌트에서 사용 예:
 *   <ShapeLayer
 *     shapes={shapes}
 *     editMode={editMode}
 *     onAddShape={onAddShape}
 *     onUpdateShape={onUpdateShape}
 *     onDeleteShape={onDeleteShape}
 *     activeLayerId={activeLayerId}
 *     onSetActiveLayer={onSetActiveLayer}
 *   />
 *
 * 항상 absolute 로 배치되며, 페이지 위에 떠 있다.
 */

const SHAPE_TYPES = [
  { id: 'rect',      label: '⬜ 사각형',  desc: '네모 박스 테두리' },
  { id: 'circle',    label: '⭕ 원/타원', desc: '동그란 원' },
  { id: 'line',      label: '➖ 선',      desc: '얇은 가로선' },
  { id: 'arrow',     label: '➡️ 화살표', desc: '오른쪽 방향 화살표' },
  { id: 'highlight', label: '🟨 하이라이트', desc: '반투명 강조 박스' },
];

const COLORS = [
  '#ef4444', '#f97316', '#facc15', '#22c55e',
  '#06b6d4', '#3b82f6', '#a855f7', '#ec4899',
  '#1f2937', '#9ca3af', '#ffffff', '#000000',
];

// 과거 버그로 저장된 유령 선/사각형(얇은 테두리 아티팩트) 필터
function isLegacyGhostShape(shape) {
  if (!shape) return false;
  const type = String(shape.type || '').toLowerCase();
  if (type !== 'rect' && type !== 'line') return false;

  const w = Math.abs(Number(shape.w) || 0);
  const h = Math.abs(Number(shape.h) || 0);
  const strokeWidth = Number(shape.strokeWidth ?? 1);
  const fill = String(shape.fill ?? 'none').toLowerCase();
  const transparentFill = fill === 'none' || fill === 'transparent';

  // 정상 도형을 최대한 건드리지 않도록 "긴 + 매우 얇은" 케이스만 제거
  const veryThinHorizontal = w >= 500 && h <= 14;
  const veryThinVertical = h >= 180 && w <= 16;

  return transparentFill && strokeWidth <= 2 && (veryThinHorizontal || veryThinVertical);
}

export default function ShapeLayer({
  shapes = [],
  editMode = false,
  onAddShape = () => {},
  onUpdateShape = () => {},
  onDeleteShape = () => {},
  onDuplicateShape = () => {},  // Ctrl+C→V / Alt+드래그 복제
  onDragStartShape = () => {},  // 드래그/리사이즈 시작 직전 — 히스토리 스냅샷용
  activeLayerId = null,
  onSetActiveLayer = () => {},
  // 레이어 순서 변경 (도형도 레이어 시스템에 통합)
  onChangeShapeLayer = () => {},  // (shapeId, action: 'front'|'forward'|'backward'|'back')
}) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef(null);

  // 🆕 Drag-to-Draw 상태
  // drawingType: null | 'rect' | 'circle' | 'line' | 'arrow' | 'highlight'
  const [drawingType, setDrawingType] = useState(null);
  // 현재 드래그 중인 미리보기 도형 (없으면 null)
  // { x, y, w, h }  — 페이지 좌표 (780px 기준)
  const [previewBox, setPreviewBox] = useState(null);
  const drawStartRef = useRef(null); // { x, y } 페이지 좌표

  const sanitizedShapes = (shapes || []).filter((shape) => !isLegacyGhostShape(shape));

  // 외부 클릭 시 picker 닫기
  useEffect(() => {
    if (!showPicker) return;
    const onDoc = (e) => { if (!pickerRef.current?.contains(e.target)) setShowPicker(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showPicker]);

  // ESC로 그리기 취소
  useEffect(() => {
    if (!drawingType) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDrawingType(null);
        setPreviewBox(null);
        drawStartRef.current = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawingType]);

  // 도형 버튼 클릭 — 즉시 생성하지 말고 drawingType만 설정
  const handlePickShape = (type) => {
    setDrawingType(type);
    setShowPicker(false);
    setPreviewBox(null);
    drawStartRef.current = null;
  };

  return (
    <>
      {/* 🆕 Drag-to-Draw 오버레이 — 페이지 전체를 덮어서 pointer 이벤트를 받음
          페이지 좌표(780px 기준)로 변환하여 도형을 그린다.
          PageFrame이 position:relative + width:780이므로,
          이 오버레이도 absolute + inset:0 + width:100% (= 780px)로 페이지를 그대로 덮음.
          getBoundingClientRect()로 실제 화면 크기를 측정하여 scale을 자동 보정.
      */}
      {editMode && drawingType && (
        <DrawOverlay
          drawingType={drawingType}
          previewBox={previewBox}
          onPointerDown={(pos) => {
            drawStartRef.current = pos;
            setPreviewBox({ x: pos.x, y: pos.y, w: 0, h: 0 });
          }}
          onPointerMove={(pos, shiftKey) => {
            if (!drawStartRef.current) return;
            const sx = drawStartRef.current.x;
            const sy = drawStartRef.current.y;
            let dx = pos.x - sx;
            let dy = pos.y - sy;
            // Shift: 1:1 비율 (정사각형/정원형)
            if (shiftKey) {
              const m = Math.max(Math.abs(dx), Math.abs(dy));
              dx = dx < 0 ? -m : m;
              dy = dy < 0 ? -m : m;
            }
            setPreviewBox({
              x: Math.min(sx, sx + dx),
              y: Math.min(sy, sy + dy),
              w: Math.abs(dx),
              h: Math.abs(dy),
            });
          }}
          onPointerUp={() => {
            const box = previewBox;
            const type = drawingType;
            // 상태 정리는 무조건
            setDrawingType(null);
            setPreviewBox(null);
            drawStartRef.current = null;
            // 5px 미만이면 생성 안 함 (실수 클릭 방지)
            if (!box || box.w < 5 || box.h < 5) return;
            onAddShape(type, box);
          }}
          onCancel={() => {
            setDrawingType(null);
            setPreviewBox(null);
            drawStartRef.current = null;
          }}
        />
      )}

      {/* 도형 렌더 */}
      {sanitizedShapes.map((shape) => {
        // 🆕 (2026-05-03) 가시성 토글 — visibility:hidden (PNG 캡처에도 반영)
        if (shape.hidden) {
          return (
            <div key={shape.id} aria-hidden="true" style={{ visibility: 'hidden' }}>
              <Shape
                shape={shape}
                editMode={false}
                isActive={false}
                onUpdate={() => {}}
                onDelete={() => {}}
                onChangeLayer={() => {}}
              />
            </div>
          );
        }
        return (
          <Shape
            key={shape.id}
            shape={shape}
            editMode={editMode}
            isActive={activeLayerId === `shape:${shape.id}`}
            onActivate={() => onSetActiveLayer(`shape:${shape.id}`)}
            onDragStart={() => onDragStartShape(shape.id)}
            onUpdate={(partial) => onUpdateShape(shape.id, partial)}
            onDelete={() => onDeleteShape(shape.id)}
            onDuplicate={() => onDuplicateShape(shape)}
            onChangeLayer={(action) => onChangeShapeLayer(shape.id, action)}
          />
        );
      })}

      {/* 🟦 도형 추가 버튼 + 패널 — 편집모드에서만 (fixed 로 화면 우측에 고정) */}
      {editMode && (
        <div ref={pickerRef} style={{
          position: 'fixed',
          right: 8, top: 220,
          zIndex: 100000,
        }}>
          <button
            onClick={() => setShowPicker((s) => !s)}
            style={{
              backgroundColor: showPicker ? '#7c3aed' : '#a855f7', color: '#fff',
              border: '2px solid #fff', padding: '8px 12px', borderRadius: 12,
              fontSize: 15, fontWeight: 800, lineHeight: 1.2, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(168,85,247,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 96, height: 44,
            }}
            title="페이지에 도형(사각형, 원, 화살표 등)을 그립니다 (스크롤해도 따라다님)"
          >
            <span style={{ position: 'relative' }}>
              도형 추가
              {sanitizedShapes.length > 0 && (
                <span style={{
                  position: 'absolute', top: -10, right: -14,
                  backgroundColor: '#fbbf24', color: '#1e293b', borderRadius: 999,
                  padding: '1px 5px', fontSize: 10, fontWeight: 900,
                  lineHeight: 1, pointerEvents: 'none',
                }}>{sanitizedShapes.length}</span>
              )}
            </span>
          </button>
          {showPicker && (
            <div
              style={{
                position: 'absolute', right: '110%', top: 0,
                width: 240,
                backgroundColor: '#fff', border: '1px solid #e2ddd4',
                borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
                padding: 10,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: '#2F2A26', marginBottom: 8 }}>
                도형 종류 선택
              </div>
              {SHAPE_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handlePickShape(t.id)}
                  style={{
                    width: '100%', display: 'block',
                    padding: '8px 10px', marginBottom: 4,
                    border: '1px solid #e5e7eb', backgroundColor: '#f9fafb',
                    borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#2F2A26' }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: '#6b7280' }}>{t.desc}</div>
                </button>
              ))}
              <div style={{ marginTop: 6, fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>
                💡 도형 선택 후 페이지에서 드래그하여 그립니다 (Shift = 정사각형/정원, ESC = 취소)
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🆕 그리는 중 안내 토스트 — 화면 하단 중앙 (fixed) */}
      {editMode && drawingType && (
        <div style={{
          position: 'fixed',
          bottom: 30, left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#1f2937', color: '#fff',
          padding: '10px 20px', borderRadius: 999,
          fontSize: 13, fontWeight: 700,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          zIndex: 99999,
          display: 'flex', alignItems: 'center', gap: 10,
          pointerEvents: 'none', // 토스트가 클릭 막지 않도록
        }}>
          <span style={{
            backgroundColor: '#a855f7', borderRadius: 999,
            padding: '2px 8px', fontSize: 11,
          }}>
            {SHAPE_TYPES.find((t) => t.id === drawingType)?.label || drawingType}
          </span>
          <span>페이지에서 드래그하여 그리세요</span>
          <span style={{ color: '#9ca3af', fontSize: 11 }}>
            · Shift = 1:1 비율 · ESC = 취소
          </span>
        </div>
      )}
    </>
  );
}

// ─── 🆕 Drag-to-Draw 오버레이 ─────────────────────────────
// PageFrame(width:780, position:relative) 안에 absolute로 위치하여
// 페이지 전체를 덮고 pointer 이벤트를 받음.
// getBoundingClientRect()로 실제 화면 픽셀을 측정해 scale을 자동 보정한다.
function DrawOverlay({ drawingType, previewBox, onPointerDown, onPointerMove, onPointerUp, onCancel }) {
  const overlayRef = useRef(null);

  // 화면 좌표 → 페이지 좌표 변환
  // 페이지 내부 좌표는 항상 780px 기준 (transform:scale 보정)
  const toPageCoords = (clientX, clientY) => {
    const el = overlayRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    // rect.width 가 실제 화면상 픽셀(예: 780 또는 360 등),
    // 우리는 페이지 좌표(원본 780 기준)로 변환
    const PAGE_W = 780;
    const scale = rect.width / PAGE_W;
    const safe = scale > 0 ? scale : 1;
    return {
      x: (clientX - rect.left) / safe,
      y: (clientY - rect.top) / safe,
    };
  };

  const handlePointerDown = (e) => {
    if (e.button !== 0) return; // 좌클릭만
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const pos = toPageCoords(e.clientX, e.clientY);
    onPointerDown(pos);
  };

  const handlePointerMove = (e) => {
    e.preventDefault();
    const pos = toPageCoords(e.clientX, e.clientY);
    onPointerMove(pos, e.shiftKey);
  };

  const handlePointerUp = (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
    onPointerUp();
  };

  // 미리보기 도형 렌더 (드래그 중에만)
  const showPreview = previewBox && (previewBox.w > 0 || previewBox.h > 0);

  return (
    <div
      ref={overlayRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={onCancel}
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        // PageFrame이 minHeight를 쓰기 때문에 height:100%가 부족할 수 있음 → inset:0 + height:100%
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        zIndex: 9000, // 도형(700~)보다 위, 도형 추가 패널(9999)보다 아래
        // 반투명 마스크 (그리기 모드 시각적 표시)
        backgroundColor: 'rgba(168, 85, 247, 0.05)',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {showPreview && (
        <PreviewShape type={drawingType} box={previewBox} />
      )}
    </div>
  );
}

// 미리보기 도형 (점선 테두리)
function PreviewShape({ type, box }) {
  const baseStyle = {
    position: 'absolute',
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    pointerEvents: 'none',
  };

  if (type === 'circle') {
    return (
      <div style={{
        ...baseStyle,
        border: '2px dashed #a855f7',
        borderRadius: '50%',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
      }} />
    );
  }
  if (type === 'highlight') {
    return (
      <div style={{
        ...baseStyle,
        border: '2px dashed #fbbf24',
        backgroundColor: 'rgba(253, 224, 71, 0.4)',
      }} />
    );
  }
  if (type === 'line' || type === 'arrow') {
    // 선/화살표는 가로선만 표시 (drag 영역 시각화)
    return (
      <div style={{
        ...baseStyle,
        border: '2px dashed #1f2937',
        backgroundColor: 'rgba(31, 41, 55, 0.05)',
      }}>
        <div style={{
          position: 'absolute',
          left: 0, right: 0, top: '50%',
          height: 2, backgroundColor: '#1f2937',
          transform: 'translateY(-50%)',
        }} />
        {type === 'arrow' && (
          <div style={{
            position: 'absolute',
            right: 0, top: '50%',
            transform: 'translate(0, -50%)',
            color: '#1f2937', fontSize: 18, fontWeight: 900,
          }}>▶</div>
        )}
      </div>
    );
  }
  // rect (default)
  return (
    <div style={{
      ...baseStyle,
      border: '2px dashed #ef4444',
      backgroundColor: 'rgba(239, 68, 68, 0.08)',
    }}>
      {/* 크기 라벨 */}
      <div
        data-edit-ui="size-label"
        style={{
          position: 'absolute',
          bottom: -22, right: 0,
          backgroundColor: '#1f2937', color: '#fff',
          fontSize: 10, fontWeight: 700,
          padding: '2px 6px', borderRadius: 4,
          whiteSpace: 'nowrap',
        }}
      >
        {Math.round(box.w)} × {Math.round(box.h)}
      </div>
    </div>
  );
}

// ─── 개별 도형 컴포넌트 ────────────────────────────────
function Shape({ shape, editMode, isActive, onActivate, onUpdate, onDelete, onChangeLayer = () => {}, onDragStart = () => {} }) {
  const wrapRef = useRef(null);
  const [draggingPos, setDraggingPos] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [showStyle, setShowStyle] = useState(false);
  const [toolbarRect, setToolbarRect] = useState(null);

  // 활성화될 때마다 wrapRef의 화면 좌표 갱신 → 툴바/패널을 fixed로 띄우기 위해
  useEffect(() => {
    if (!isActive || !wrapRef.current) { setToolbarRect(null); return; }
    const update = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (r) setToolbarRect(r);
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isActive, draggingPos, resizing]);

  const {
    id, type, x = 0, y = 0, w = 200, h = 100,
    stroke = '#ef4444', strokeWidth = 4,
    fill = 'none', opacity = 1, zIndex = 700,
  } = shape;

  // 외부 클릭 시 스타일 패널 닫기
  useEffect(() => {
    if (!showStyle) return;
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setShowStyle(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showStyle]);

  // 위치 드래그
  const handlePosDragStart = (e) => {
    if (!editMode) return;
    if (e.target.closest('[data-shape-handle]')) return;
    if (e.target.closest('[data-shape-toolbar]')) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    // 🆕 다른 요소 옵션바 닫기
    announceEditorSelection(`shape:${id}`);
    onActivate();
    onDragStart(); // ← 드래그 시작 직전 히스토리 스냅샷
    setDraggingPos({ startX: e.clientX, startY: e.clientY, sx: x, sy: y });
  };

  // 🆕 다른 요소가 활성화되면 자기 스타일 패널 닫기
  const closeOnOtherSelect = useCallback(() => {
    setShowStyle(false);
  }, []);
  useEditorSelectionListener(`shape:${id}`, closeOnOtherSelect);

  useEffect(() => {
    if (!draggingPos) return;
    const onMove = (e) => {
      onUpdate({
        x: Math.round(draggingPos.sx + (e.clientX - draggingPos.startX)),
        y: Math.round(draggingPos.sy + (e.clientY - draggingPos.startY)),
      });
    };
    const onUp = () => setDraggingPos(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingPos, onUpdate]);

  // 리사이즈
  const handleResizeStart = (e, edge) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStart(); // ← 리사이즈 시작 직전 히스토리 스냅샷
    setResizing({ edge, startX: e.clientX, startY: e.clientY, sw: w, sh: h, sx: x, sy: y });
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      let nw = resizing.sw, nh = resizing.sh, nx = resizing.sx, ny = resizing.sy;
      const edge = resizing.edge;
      if (edge.includes('e')) nw = resizing.sw + dx;
      if (edge.includes('w')) { nw = resizing.sw - dx; nx = resizing.sx + dx; }
      if (edge.includes('s')) nh = resizing.sh + dy;
      if (edge.includes('n')) { nh = resizing.sh - dy; ny = resizing.sy + dy; }
      // line 은 가로 두께만 의미 → 높이는 strokeWidth 이상으로 유지
      const minH = type === 'line' ? Math.max(2, strokeWidth) : 20;
      const minW = 20;
      nw = Math.max(minW, nw);
      nh = Math.max(minH, nh);
      onUpdate({ x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) });
    };
    const onUp = () => setResizing(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, type, strokeWidth, onUpdate]);

  // SVG 도형 렌더
  const renderShape = () => {
    const sw = strokeWidth;
    const half = sw / 2;
    const innerW = Math.max(0, w - sw);
    const innerH = Math.max(0, h - sw);
    switch (type) {
      case 'rect':
        return (
          <svg width={w} height={h} style={{ display: 'block' }}>
            <rect
              x={half} y={half} width={innerW} height={innerH}
              fill={fill === 'none' ? 'transparent' : fill}
              stroke={stroke === 'none' ? 'transparent' : stroke}
              strokeWidth={sw}
              rx={6} ry={6}
            />
          </svg>
        );
      case 'circle':
        return (
          <svg width={w} height={h} style={{ display: 'block' }}>
            <ellipse
              cx={w / 2} cy={h / 2}
              rx={Math.max(0, (w - sw) / 2)} ry={Math.max(0, (h - sw) / 2)}
              fill={fill === 'none' ? 'transparent' : fill}
              stroke={stroke === 'none' ? 'transparent' : stroke}
              strokeWidth={sw}
            />
          </svg>
        );
      case 'line':
        return (
          <svg width={w} height={h} style={{ display: 'block' }}>
            <line
              x1={0} y1={h / 2} x2={w} y2={h / 2}
              stroke={stroke} strokeWidth={sw} strokeLinecap="round"
            />
          </svg>
        );
      case 'arrow': {
        const arrowSize = Math.max(8, sw * 3);
        return (
          <svg width={w} height={h} style={{ display: 'block' }}>
            <defs>
              <marker
                id={`arrowhead-${id}`}
                viewBox="0 0 10 10"
                refX="8" refY="5"
                markerWidth={arrowSize} markerHeight={arrowSize}
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
              </marker>
            </defs>
            <line
              x1={4} y1={h / 2} x2={w - arrowSize - 2} y2={h / 2}
              stroke={stroke} strokeWidth={sw} strokeLinecap="round"
              markerEnd={`url(#arrowhead-${id})`}
            />
          </svg>
        );
      }
      case 'highlight':
        return (
          <div style={{
            width: '100%', height: '100%',
            backgroundColor: fill === 'none' ? '#fde047' : fill,
            borderRadius: 6,
          }} />
        );
      default:
        return null;
    }
  };

  // 핸들 위치 (코너 4개)
  const HANDLES = [
    { id: 'nw', cursor: 'nwse-resize', style: { left: -6, top: -6 } },
    { id: 'ne', cursor: 'nesw-resize', style: { right: -6, top: -6 } },
    { id: 'sw', cursor: 'nesw-resize', style: { left: -6, bottom: -6 } },
    { id: 'se', cursor: 'nwse-resize', style: { right: -6, bottom: -6 } },
  ];

  return (
    <div
      ref={wrapRef}
      data-shape="true"
      onMouseDown={handlePosDragStart}
      style={{
        position: 'absolute',
        left: x, top: y, width: w, height: h,
        zIndex,
        opacity,
        cursor: editMode ? (draggingPos ? 'grabbing' : 'move') : 'default',
        outline: editMode && isActive ? '2px dashed #a855f7' : 'none',
        outlineOffset: 4,
        pointerEvents: editMode ? 'auto' : 'none',
      }}
    >
      {renderShape()}

      {/* 리사이즈 핸들 */}
      {editMode && isActive && HANDLES.map((hd) => (
        <div
          key={hd.id}
          data-shape-handle
          onMouseDown={(e) => handleResizeStart(e, hd.id)}
          style={{
            position: 'absolute',
            ...hd.style,
            width: 12, height: 12,
            backgroundColor: '#a855f7',
            border: '2px solid #fff',
            borderRadius: 3,
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            cursor: hd.cursor,
            zIndex: 30,
          }}
        />
      ))}

      {/* 툴바 — position:fixed로 항상 최상위 */}
      {editMode && isActive && toolbarRect && (
        <div
          data-shape-toolbar
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: toolbarRect.left,
            top: Math.max(4, toolbarRect.top - 44),
            display: 'flex', gap: 4, alignItems: 'center',
            backgroundColor: '#1e293b', padding: '6px 10px',
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 2147483647, whiteSpace: 'nowrap',
          }}
        >
          {/* 레이어 순서 (FreeImage / InlineFreeImage 와 동일) */}
          <button onClick={() => onChangeLayer('front')}
            style={btn('#475569')} title="맨 앞으로">▲▲</button>
          <button onClick={() => onChangeLayer('forward')}
            style={btn('#64748b')} title="한 단계 앞으로">▲</button>
          <button onClick={() => onChangeLayer('backward')}
            style={btn('#64748b')} title="한 단계 뒤로">▼</button>
          <button onClick={() => onChangeLayer('back')}
            style={btn('#475569')} title="맨 뒤로">▼▼</button>
          <span style={{
            backgroundColor: '#fbbf24', color: '#1e293b',
            padding: '2px 6px', borderRadius: 4,
            fontSize: 10, fontWeight: 900,
          }}>z{zIndex}</span>
          <span style={sep} />

          {/* 색상 토글 */}
          <button onClick={() => setShowStyle((s) => !s)}
            style={{
              ...btn(showStyle ? '#7c3aed' : '#475569'),
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            title="색상·두께">
            <span style={{
              display: 'inline-block', width: 12, height: 12,
              backgroundColor: stroke === 'none' ? fill : stroke,
              border: '1px solid #fff', borderRadius: 2,
            }} />
            🎨
          </button>
          <span style={sep} />
          {/* 두께 조절 */}
          {type !== 'highlight' && (
            <>
              <button onClick={() => onUpdate({ strokeWidth: Math.max(1, strokeWidth - 1) })}
                style={btn('#475569')} title="얇게">−</button>
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 800, minWidth: 18, textAlign: 'center' }}>
                {strokeWidth}
              </span>
              <button onClick={() => onUpdate({ strokeWidth: Math.min(20, strokeWidth + 1) })}
                style={btn('#475569')} title="굵게">＋</button>
              <span style={sep} />
            </>
          )}
          {/* 투명도 */}
          <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>α</span>
          <input
            type="range" min={0.1} max={1} step={0.05}
            value={opacity}
            onChange={(e) => onUpdate({ opacity: parseFloat(e.target.value) })}
            style={{ width: 60, accentColor: '#a855f7' }}
            title="투명도"
          />
          <span style={sep} />
          {/* 삭제 */}
          <button onClick={() => { if (window.confirm('이 도형을 삭제할까요?')) onDelete(); }}
            style={btn('#dc2626')} title="삭제">🗑</button>
        </div>
      )}

      {/* 색상 패널 — position:fixed로 항상 최상위 */}
      {editMode && isActive && showStyle && toolbarRect && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: toolbarRect.left,
            top: Math.max(4, toolbarRect.top - 284),
            width: 240,
            backgroundColor: '#fff', border: '1px solid #e2ddd4',
            borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 10, zIndex: 2147483647,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2F2A26' }}>🎨 색상</div>
            <button onClick={() => setShowStyle(false)}
              style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>✕</button>
          </div>

          {/* 테두리 색 (line/arrow/rect/circle) */}
          {(type === 'rect' || type === 'circle' || type === 'line' || type === 'arrow') && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                {type === 'line' || type === 'arrow' ? '선 색' : '테두리 색'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {COLORS.map((c) => (
                  <ColorBtn key={c} color={c} active={stroke === c}
                    onClick={() => onUpdate({ stroke: c })} />
                ))}
                <input type="color" value={/^#/.test(stroke) ? stroke : '#ef4444'}
                  onChange={(e) => onUpdate({ stroke: e.target.value })}
                  style={{ width: 22, height: 22, border: '1px solid #cbd5e1', borderRadius: 3, padding: 0, cursor: 'pointer' }}
                  title="커스텀 색상" />
              </div>
            </>
          )}

          {/* 채우기 색 (rect/circle/highlight) */}
          {(type === 'rect' || type === 'circle' || type === 'highlight') && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                채우기 색
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <button onClick={() => onUpdate({ fill: 'none' })}
                  style={{
                    width: 22, height: 22,
                    border: fill === 'none' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    borderRadius: 3, cursor: 'pointer',
                    backgroundColor: '#fff', position: 'relative',
                    backgroundImage: 'linear-gradient(45deg, transparent 47%, #ef4444 47%, #ef4444 53%, transparent 53%)',
                  }}
                  title="채우기 없음" />
                {COLORS.map((c) => (
                  <ColorBtn key={c} color={c} active={fill === c}
                    onClick={() => onUpdate({ fill: c })} />
                ))}
                <input type="color" value={/^#/.test(fill) ? fill : '#fde047'}
                  onChange={(e) => onUpdate({ fill: e.target.value })}
                  style={{ width: 22, height: 22, border: '1px solid #cbd5e1', borderRadius: 3, padding: 0, cursor: 'pointer' }}
                  title="커스텀 색상" />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ColorBtn({ color, active, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        width: 22, height: 22,
        backgroundColor: color,
        border: active ? '2px solid #2563eb' : '1px solid #cbd5e1',
        borderRadius: 3, cursor: 'pointer', padding: 0,
        boxShadow: active ? '0 0 0 2px #fff inset' : 'none',
      }}
      title={color}
    />
  );
}

function btn(color) {
  return {
    backgroundColor: color, color: '#fff', border: 'none',
    padding: '4px 8px', borderRadius: 4,
    fontSize: 11, fontWeight: 800, cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
    minWidth: 24, lineHeight: 1.1,
  };
}

const sep = { width: 1, height: 16, backgroundColor: '#475569' };
