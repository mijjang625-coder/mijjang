import { useEffect, useRef, useState } from 'react';

/**
 * InlineFreeImage — 본문 흐름 안에서 자리를 차지하는 자유사진
 *
 * 핵심 차이 (FreeImage 와 비교):
 *   - 절대 좌표가 아니라 block 흐름으로 렌더 → 본문 텍스트/메인사진이 자동으로 밀려남
 *   - 너비는 컨테이너에 맞춤(또는 fitWidth), 높이만 사용자가 조절
 *   - 위/아래 이동 버튼으로 슬롯 안에서 순서 변경
 *   - 색상/밝기/채도/색조 조정, 삭제, 좌우 정렬, 사진 교체 지원
 *
 * Props:
 *   item: { id, src, w, h, adjust, align, slot }
 *   editMode, isActive, onActivate
 *   onUpdate(partial) / onDelete() / onMoveUp() / onMoveDown()
 *   canMoveUp, canMoveDown — 끝점일 때 비활성
 *   replaceImages: string[] — 교체 가능한 사진 후보
 */
export default function InlineFreeImage({
  item,
  editMode = false,
  isActive = false,
  onActivate = () => {},
  onUpdate = () => {},
  onDelete = () => {},
  onMoveUp = () => {},
  onMoveDown = () => {},
  canMoveUp = true,
  canMoveDown = true,
  replaceImages = [],
}) {
  const wrapRef = useRef(null);
  const [resizing, setResizing] = useState(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showReplace, setShowReplace] = useState(false);

  const { id, src, w = 700, h = 460, adjust, align = 'center' } = item;

  const adj = {
    brightness: adjust?.brightness ?? 100,
    contrast:   adjust?.contrast   ?? 100,
    saturate:   adjust?.saturate   ?? 100,
    hue:        adjust?.hue        ?? 0,
  };
  const cssFilter = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturate}%) hue-rotate(${adj.hue}deg)`;
  const isAdjusted = adj.brightness !== 100 || adj.contrast !== 100 || adj.saturate !== 100 || adj.hue !== 0;

  // 외부 클릭 시 패널 닫기
  useEffect(() => {
    if (!showAdjust && !showReplace) return;
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      setShowAdjust(false);
      setShowReplace(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showAdjust, showReplace]);

  // 세로 리사이즈 — 너비는 컨테이너에 고정, 높이만 사용자가 조절
  const handleResizeStart = (e, edge) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ edge, startY: e.clientY, sh: h });
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dy = e.clientY - resizing.startY;
      let nh = resizing.sh;
      if (resizing.edge === 's') nh = resizing.sh + dy;
      else if (resizing.edge === 'n') nh = resizing.sh - dy;
      nh = Math.max(120, Math.min(1200, nh));
      onUpdate({ h: Math.round(nh) });
    };
    const onUp = () => setResizing(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, onUpdate]);

  // 좌우 정렬 → marginLeft/marginRight 자동 결정
  const containerStyle = {
    position: 'relative',
    width: '100%',
    margin: '20px 0',
    display: 'flex',
    justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
    pointerEvents: editMode ? 'auto' : 'none',
  };

  return (
    <div ref={wrapRef} style={containerStyle} data-inline-free="true">
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (editMode) onActivate();
        }}
        style={{
          position: 'relative',
          width: w,
          maxWidth: '100%',
          height: h,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: '#e8e5e1',
          outline: editMode && isActive ? '2px solid #3b82f6' : 'none',
          outlineOffset: 2,
          boxShadow: editMode && isActive ? '0 4px 14px rgba(59,130,246,0.25)' : 'none',
          cursor: editMode ? 'pointer' : 'default',
        }}
      >
        <img
          src={src}
          alt=""
          crossOrigin="anonymous"
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            userSelect: 'none',
            pointerEvents: 'none',
            filter: cssFilter,
          }}
        />

        {/* 크기 표시 (활성 + 편집모드) */}
        {editMode && isActive && (
          <div style={{
            position: 'absolute', right: 6, top: 6,
            backgroundColor: 'rgba(30,41,59,0.85)', color: '#fff',
            padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800,
            zIndex: 10, pointerEvents: 'none',
          }}>
            {Math.round(w)}×{Math.round(h)}
          </div>
        )}

        {/* 세로 리사이즈 핸들 — 위/아래 가운데 */}
        {editMode && isActive && (
          <>
            <div
              onMouseDown={(e) => handleResizeStart(e, 'n')}
              style={{
                position: 'absolute', left: '50%', top: -6, transform: 'translateX(-50%)',
                width: 28, height: 12,
                backgroundColor: '#3b82f6', border: '2px solid #fff',
                borderRadius: 6, cursor: 'ns-resize', zIndex: 20,
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}
              title="위쪽으로 드래그하여 높이 조절"
            />
            <div
              onMouseDown={(e) => handleResizeStart(e, 's')}
              style={{
                position: 'absolute', left: '50%', bottom: -6, transform: 'translateX(-50%)',
                width: 28, height: 12,
                backgroundColor: '#3b82f6', border: '2px solid #fff',
                borderRadius: 6, cursor: 'ns-resize', zIndex: 20,
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}
              title="아래쪽으로 드래그하여 높이 조절"
            />
          </>
        )}
      </div>

      {/* 툴바 — 활성 + 편집모드 */}
      {editMode && isActive && (
        <div
          data-inline-toolbar
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '50%',
            top: -42,
            transform: 'translateX(-50%)',
            display: 'flex', gap: 4, alignItems: 'center',
            backgroundColor: '#1e293b', padding: '6px 10px',
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 30, whiteSpace: 'nowrap',
          }}
        >
          <button onClick={onMoveUp} disabled={!canMoveUp}
            style={tBtn(canMoveUp ? '#475569' : '#334155')} title="위로">▲</button>
          <button onClick={onMoveDown} disabled={!canMoveDown}
            style={tBtn(canMoveDown ? '#475569' : '#334155')} title="아래로">▼</button>
          <span style={sep} />

          {/* 정렬 */}
          <button onClick={() => onUpdate({ align: 'left' })}
            style={tBtn(align === 'left' ? '#3b82f6' : '#475569')} title="왼쪽">⬅</button>
          <button onClick={() => onUpdate({ align: 'center' })}
            style={tBtn(align === 'center' ? '#3b82f6' : '#475569')} title="가운데">⬌</button>
          <button onClick={() => onUpdate({ align: 'right' })}
            style={tBtn(align === 'right' ? '#3b82f6' : '#475569')} title="오른쪽">➡</button>
          <span style={sep} />

          {/* 너비 */}
          <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>W:</span>
          <button onClick={() => onUpdate({ w: Math.max(200, w - 40) })}
            style={tBtn('#475569')} title="좁게">−</button>
          <button onClick={() => onUpdate({ w: Math.min(740, w + 40) })}
            style={tBtn('#475569')} title="넓게">＋</button>
          <span style={sep} />

          {/* 색상 */}
          <button
            onClick={() => { setShowAdjust((s) => !s); setShowReplace(false); }}
            style={tBtn(showAdjust ? '#7c3aed' : (isAdjusted ? '#a855f7' : '#475569'))}
            title="색상·밝기·채도"
          >🎨{isAdjusted ? '•' : ''}</button>

          {/* 사진 교체 */}
          {replaceImages.length > 0 && (
            <button
              onClick={() => { setShowReplace((s) => !s); setShowAdjust(false); }}
              style={tBtn(showReplace ? '#0ea5e9' : '#475569')}
              title="사진 교체"
            >🔄</button>
          )}
          <span style={sep} />

          {/* 삭제 */}
          <button
            onClick={() => { if (window.confirm('이 사진을 삭제할까요?')) onDelete(); }}
            style={tBtn('#dc2626')}
            title="삭제"
          >🗑</button>
        </div>
      )}

      {/* 색상 조정 패널 */}
      {editMode && isActive && showAdjust && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '50%', top: 8,
            transform: 'translateX(-50%)',
            width: 280,
            backgroundColor: '#fff',
            border: '1px solid #e2ddd4',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 12, zIndex: 40,
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2F2A26' }}>🎨 색상 조정</div>
            <button onClick={() => setShowAdjust(false)}
              style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>✕</button>
          </div>
          <Slider label="🌞 밝기" unit="%" min={0} max={200} step={1}
            value={adj.brightness} defaultValue={100} color="#f59e0b"
            onChange={(v) => onUpdate({ adjust: { ...adj, brightness: v } })} />
          <Slider label="◐ 대비" unit="%" min={0} max={200} step={1}
            value={adj.contrast} defaultValue={100} color="#475569"
            onChange={(v) => onUpdate({ adjust: { ...adj, contrast: v } })} />
          <Slider label="🎨 채도" unit="%" min={0} max={200} step={1}
            value={adj.saturate} defaultValue={100} color="#ec4899"
            onChange={(v) => onUpdate({ adjust: { ...adj, saturate: v } })} />
          <Slider label="🌈 색조" unit="°" min={-180} max={180} step={1}
            value={adj.hue} defaultValue={0} color="#8b5cf6"
            onChange={(v) => onUpdate({ adjust: { ...adj, hue: v } })} />
          <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: '#64748b' }}>✨ 프리셋</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 4 }}>
            <Pre label="원본" onClick={() => onUpdate({ adjust: null })} />
            <Pre label="선명" onClick={() => onUpdate({ adjust: { brightness: 105, contrast: 115, saturate: 120, hue: 0 } })} />
            <Pre label="밝게" onClick={() => onUpdate({ adjust: { brightness: 120, contrast: 100, saturate: 105, hue: 0 } })} />
            <Pre label="어둡게" onClick={() => onUpdate({ adjust: { brightness: 85, contrast: 110, saturate: 100, hue: 0 } })} />
            <Pre label="흑백" onClick={() => onUpdate({ adjust: { brightness: 100, contrast: 110, saturate: 0, hue: 0 } })} />
            <Pre label="따뜻" onClick={() => onUpdate({ adjust: { brightness: 105, contrast: 100, saturate: 115, hue: -10 } })} />
            <Pre label="차갑" onClick={() => onUpdate({ adjust: { brightness: 100, contrast: 100, saturate: 110, hue: 15 } })} />
            <Pre label="빈티지" onClick={() => onUpdate({ adjust: { brightness: 95, contrast: 90, saturate: 80, hue: 10 } })} />
            <Pre label="비비드" onClick={() => onUpdate({ adjust: { brightness: 100, contrast: 120, saturate: 145, hue: 0 } })} />
          </div>
        </div>
      )}

      {/* 사진 교체 패널 */}
      {editMode && isActive && showReplace && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '50%', top: 8,
            transform: 'translateX(-50%)',
            width: 320, maxHeight: 380, overflow: 'auto',
            backgroundColor: '#fff', border: '1px solid #e2ddd4',
            borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 12, zIndex: 40,
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2F2A26' }}>🔄 사진 교체</div>
            <button onClick={() => setShowReplace(false)}
              style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>✕</button>
          </div>
          <label style={{
            display: 'block', border: '2px dashed #93c5fd', backgroundColor: '#eff6ff',
            borderRadius: 8, padding: '10px', textAlign: 'center',
            fontSize: 11, fontWeight: 700, color: '#1d4ed8', cursor: 'pointer',
            marginBottom: 8,
          }}>
            ⬆️ 컴퓨터에서 새 사진 업로드
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = (ev) => {
                  if (ev.target?.result) {
                    onUpdate({ src: ev.target.result });
                    setShowReplace(false);
                  }
                };
                r.readAsDataURL(f);
              }} />
          </label>
          {replaceImages.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                생성된 사진 {replaceImages.length}장에서 선택
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {replaceImages.map((src, idx) => (
                  <button key={idx}
                    onClick={() => { onUpdate({ src }); setShowReplace(false); }}
                    style={{
                      border: '1px solid #e2ddd4', borderRadius: 6, padding: 0,
                      overflow: 'hidden', cursor: 'pointer', aspectRatio: '1 / 1',
                      backgroundColor: '#f3f4f6',
                    }}
                  >
                    <img src={src} alt="" crossOrigin="anonymous"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function tBtn(bg) {
  return {
    backgroundColor: bg, color: '#fff', border: 'none',
    padding: '4px 8px', borderRadius: 4,
    fontSize: 11, fontWeight: 800, cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
    minWidth: 26, lineHeight: 1.1,
  };
}
const sep = { width: 1, height: 16, backgroundColor: '#475569' };

function Slider({ label, unit, min, max, step, value, defaultValue, onChange, color }) {
  const isMod = value !== defaultValue;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{label}</span>
        <button onClick={() => onChange(defaultValue)}
          style={{ border: 'none', background: 'transparent', color: isMod ? color : '#9ca3af',
                   fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
          {value}{unit}{isMod ? ' ↺' : ''}
        </button>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => onChange(defaultValue)}
        style={{ width: '100%', accentColor: color }}
      />
    </div>
  );
}

function Pre({ label, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        backgroundColor: '#f3f4f6', color: '#374151',
        border: '1px solid #e5e7eb',
        padding: '5px 4px', borderRadius: 4,
        fontSize: 10, fontWeight: 700, cursor: 'pointer',
      }}>{label}</button>
  );
}
