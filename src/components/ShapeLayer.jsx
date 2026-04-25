import { useEffect, useRef, useState } from 'react';

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

export default function ShapeLayer({
  shapes = [],
  editMode = false,
  onAddShape = () => {},
  onUpdateShape = () => {},
  onDeleteShape = () => {},
  activeLayerId = null,
  onSetActiveLayer = () => {},
  // 레이어 순서 변경 (도형도 레이어 시스템에 통합)
  onChangeShapeLayer = () => {},  // (shapeId, action: 'front'|'forward'|'backward'|'back')
}) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef(null);

  // 외부 클릭 시 picker 닫기
  useEffect(() => {
    if (!showPicker) return;
    const onDoc = (e) => { if (!pickerRef.current?.contains(e.target)) setShowPicker(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showPicker]);

  return (
    <>
      {/* 도형 렌더 */}
      {shapes.map((shape) => (
        <Shape
          key={shape.id}
          shape={shape}
          editMode={editMode}
          isActive={activeLayerId === `shape:${shape.id}`}
          onActivate={() => onSetActiveLayer(`shape:${shape.id}`)}
          onUpdate={(partial) => onUpdateShape(shape.id, partial)}
          onDelete={() => onDeleteShape(shape.id)}
          onChangeLayer={(action) => onChangeShapeLayer(shape.id, action)}
        />
      ))}

      {/* 🟦 도형 추가 버튼 + 패널 — 편집모드에서만 (fixed 로 화면 우측에 고정) */}
      {editMode && (
        <div ref={pickerRef} style={{
          position: 'fixed',
          right: 24, top: 272,
          zIndex: 9999,
        }}>
          <button
            onClick={() => setShowPicker((s) => !s)}
            style={{
              backgroundColor: showPicker ? '#7c3aed' : '#a855f7', color: '#fff',
              border: '2px solid #fff', padding: '8px 12px', borderRadius: 999,
              fontSize: 12, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(168,85,247,0.45)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            title="페이지에 도형(사각형, 원, 화살표 등)을 그립니다 (스크롤해도 따라다님)"
          >
            🟦 도형 추가
            {shapes.length > 0 && (
              <span style={{
                backgroundColor: '#fbbf24', color: '#1e293b', borderRadius: 999,
                padding: '1px 6px', fontSize: 10, fontWeight: 900,
              }}>{shapes.length}</span>
            )}
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
                  onClick={() => { onAddShape(t.id); setShowPicker(false); }}
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
                💡 추가 후 도형을 드래그로 이동, 핸들로 크기 조절,<br/>툴바에서 색상·두께 변경
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── 개별 도형 컴포넌트 ────────────────────────────────
function Shape({ shape, editMode, isActive, onActivate, onUpdate, onDelete, onChangeLayer = () => {} }) {
  const wrapRef = useRef(null);
  const [draggingPos, setDraggingPos] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [showStyle, setShowStyle] = useState(false);

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
    onActivate();
    setDraggingPos({ startX: e.clientX, startY: e.clientY, sx: x, sy: y });
  };

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

      {/* 툴바 */}
      {editMode && isActive && (
        <div
          data-shape-toolbar
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: 0, top: -42,
            display: 'flex', gap: 4, alignItems: 'center',
            backgroundColor: '#1e293b', padding: '6px 10px',
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 40, whiteSpace: 'nowrap',
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

      {/* 색상 패널 */}
      {editMode && isActive && showStyle && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', left: 0, top: -240,
            width: 240,
            backgroundColor: '#fff', border: '1px solid #e2ddd4',
            borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 10, zIndex: 50,
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
