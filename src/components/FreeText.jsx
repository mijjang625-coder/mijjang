import { useRef, useState, useEffect, useCallback } from 'react';
import { FONT_PRESETS } from '../lib/theme.js';
import { announceEditorSelection, useEditorSelectionListener } from '../lib/editorSelection.js';

/**
 * FreeText — 자유 배치 글박스 (페이지 캠버스 위에서 절대 위치)
 *
 * 사용자가 "📝 글박스 추가" 버튼으로 추가한 글박스. position: absolute 로 떠다니며
 * 페이지의 자동 늘어남(normal flow)에 영향을 주지 않는다. 따라서 이 글박스의 크기를
 * 늘려도 사진/다른 요소가 밀리지 않는다.
 *
 * Props:
 *   - item: { id, x, y, width, height, html, text, style, zIndex }
 *   - editMode: boolean
 *   - onUpdate: (partial) => void  — 위치/크기/내용/스타일 변경
 *   - onDelete: () => void
 *   - onChangeLayer: (action) => void  — 'front'|'back'|'forward'|'backward'
 *   - canvasWidth: number  — 부모 캠버스 가로 (스냅 기준, 보통 780)
 *
 * 동작:
 *   - 더블클릭: 글자 직접 수정 (contentEditable)
 *   - 클릭: 미니 툴바(폰트/크기/굵기/색/정렬) 표시
 *   - 드래그: 위치 이동
 *   - 8개 핸들: 박스 크기 조정 (폭 줄이면 자동 줄바꿈, 높이 넘치면 잘림)
 *   - 좌/우/가운데 스냅 (사진과 동일한 SNAP_THRESHOLD = 8px)
 *   - 폰트 크기는 style.fontSize 로 별도 관리 — 박스 크기 조정 시 글씨 크기 영향 없음
 */

const HANDLES = [
  { id: 'nw', cursor: 'nwse-resize', style: { left: -6, top: -6 } },
  { id: 'n',  cursor: 'ns-resize',   style: { left: '50%', top: -6, transform: 'translateX(-50%)' } },
  { id: 'ne', cursor: 'nesw-resize', style: { right: -6, top: -6 } },
  { id: 'w',  cursor: 'ew-resize',   style: { left: -6, top: '50%', transform: 'translateY(-50%)' } },
  { id: 'e',  cursor: 'ew-resize',   style: { right: -6, top: '50%', transform: 'translateY(-50%)' } },
  { id: 'sw', cursor: 'nesw-resize', style: { left: -6, bottom: -6 } },
  { id: 's',  cursor: 'ns-resize',   style: { left: '50%', bottom: -6, transform: 'translateX(-50%)' } },
  { id: 'se', cursor: 'nwse-resize', style: { right: -6, bottom: -6 } },
];

const SNAP_THRESHOLD = 8;
const MIN_W = 40;
const MIN_H = 24;
const DRAG_THRESHOLD = 5;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export default function FreeText({
  item,
  editMode = false,
  onUpdate = () => {},
  onDelete = () => {},
  onChangeLayer = () => {},
  onDuplicate = () => {},  // Alt+드래그 / Ctrl+C→V 복제
  onDragStart = () => {},  // 드래그/리사이즈 시작 직전 — 히스토리 스냅샷용
  onActivate = () => {},   // 클릭 시 activeLayerId 세팅
  canvasWidth = 780,
}) {
  const wrapperRef = useRef(null);
  const editableRef = useRef(null);

  const [hovering, setHovering] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(null);
  const [snapLine, setSnapLine] = useState(null);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });

  const dragStart = useRef({ x: 0, y: 0, baseX: 0, baseY: 0, active: false, started: false });

  // 기본값 병합
  const x = item.x ?? 50;
  const y = item.y ?? 50;
  const w = item.width ?? 240;
  const h = item.height ?? 80;
  const html = item.html ?? escapeHtml(item.text ?? '글씨를 입력하세요');
  const style = item.style ?? {};
  const zIndex = item.zIndex ?? 10000;

  const active = hovering || showToolbar || isEditing;

  // ─── 더블클릭: 편집 시작 ───
  const startEditing = (e) => {
    e.stopPropagation();
    if (!editMode) return;
    // 🆕 다른 요소 옵션바 닫기
    announceEditorSelection(`free-text:${item.id}`);
    setIsEditing(true);
    setShowToolbar(true);
    updateToolbarPos();
    setTimeout(() => {
      if (editableRef.current) {
        editableRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(editableRef.current);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 0);
  };

  const finishEditing = () => {
    setIsEditing(false);
    if (editableRef.current) {
      const newHtml = editableRef.current.innerHTML;
      const newText = editableRef.current.innerText;
      if (newHtml !== html) {
        onUpdate({ html: newHtml, text: newText });
      }
    }
  };

  // ─── 단일 클릭: 툴바 토글 ───
  const handleClick = (e) => {
    if (isEditing) return;
    if (dragStart.current.started) {
      dragStart.current.started = false;
      return;
    }
    e.stopPropagation();
    // 🆕 다른 요소 옵션바 닫기
    announceEditorSelection(`free-text:${item.id}`);
    setShowToolbar(true);
    updateToolbarPos();
  };

  // 🆕 다른 요소가 활성화되면 자기 툴바를 닫음
  const closeOnOtherSelect = useCallback(() => {
    if (isEditing) {
      if (editableRef.current) {
        const newHtml = editableRef.current.innerHTML;
        const newText = editableRef.current.innerText;
        if (newHtml !== html) onUpdate({ html: newHtml, text: newText });
      }
      setIsEditing(false);
    }
    setShowToolbar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, html]);
  useEditorSelectionListener(`free-text:${item.id}`, closeOnOtherSelect);

  // 툴바 위치 계산 (viewport 기준)
  const updateToolbarPos = () => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const TOOLBAR_HEIGHT = 44;
    const TOOLBAR_WIDTH = 460;
    const margin = 8;
    const showBelow = rect.top < TOOLBAR_HEIGHT + margin;
    const top = showBelow ? rect.bottom + margin : rect.top - TOOLBAR_HEIGHT - margin;
    let left = rect.left;
    const maxLeft = window.innerWidth - TOOLBAR_WIDTH - margin;
    if (left > maxLeft) left = maxLeft;
    if (left < margin) left = margin;
    setToolbarPos({ top, left });
  };

  useEffect(() => {
    if (!showToolbar) return;
    const handler = () => updateToolbarPos();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToolbar]);

  // 외부 클릭 시 편집 종료 + 툴바 닫기
  useEffect(() => {
    if (!isEditing && !showToolbar) return;
    const handlePointerDown = (e) => {
      if (wrapperRef.current && wrapperRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-toolbar]')) return;
      if (e.target.closest && e.target.closest('[data-handle]')) return;
      if (isEditing) {
        if (editableRef.current) {
          const newHtml = editableRef.current.innerHTML;
          const newText = editableRef.current.innerText;
          if (newHtml !== html) onUpdate({ html: newHtml, text: newText });
        }
        setIsEditing(false);
      }
      setShowToolbar(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, showToolbar, html]);

  // 편집 시작 시 초기 HTML 주입
  useEffect(() => {
    if (isEditing && editableRef.current) {
      editableRef.current.innerHTML = html || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // ─── 드래그 이동 ───
  const handleMouseDown = (e) => {
    if (!editMode) return;
    if (isEditing) return;
    if (e.target.closest('[data-handle]')) return;
    if (e.target.closest('[data-toolbar]')) return;
    if (e.target.closest('[data-free-toolbar]')) return;
    onActivate();  // activeLayerId 세팅 → Ctrl+C 복사 가능
    dragStart.current = {
      x: e.clientX, y: e.clientY,
      baseX: x, baseY: y,
      active: true, started: false,
      isAlt: e.altKey,  // Alt 키 기억
    };
  };

  useEffect(() => {
    let altDuplicated = false; // Alt+드래그: 복제 한 번만 실행
    const onMove = (e) => {
      if (!dragStart.current.active) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (!dragStart.current.started) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        dragStart.current.started = true;
        setDragging(true);
        onDragStart(); // ← 드래그 확정 시점에 히스토리 스냅샷
        // ✨ Alt+드래그: 드래그 시작 시점에 복제본 생성 → 원본이 이동
        if (dragStart.current.isAlt && !altDuplicated) {
          altDuplicated = true;
          onDuplicate(0, 0); // 원본 위치 그대로 복제
        }
      }
      let newX = dragStart.current.baseX + dx;
      let newY = dragStart.current.baseY + dy;
      // 좌/우/가운데 스냅
      let snapV = null;
      if (Math.abs(newX) < SNAP_THRESHOLD) { newX = 0; snapV = 'left'; }
      const rightTarget = canvasWidth - w;
      if (Math.abs(newX - rightTarget) < SNAP_THRESHOLD) { newX = rightTarget; snapV = 'right'; }
      const centerTarget = (canvasWidth - w) / 2;
      if (Math.abs(newX - centerTarget) < SNAP_THRESHOLD) { newX = centerTarget; snapV = 'center'; }
      setSnapLine(snapV);
      onUpdate({ x: Math.round(newX), y: Math.round(newY) });
    };
    const onUp = () => {
      if (dragStart.current.active) {
        dragStart.current.active = false;
        if (dragStart.current.started) setDragging(false);
      }
      setSnapLine(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, canvasWidth]);

  // ─── 리사이즈 ───
  const handleResizeStart = (e, handleId) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStart(); // ← 리사이즈 시작 시점에 히스토리 스냅샷
    setResizing({
      handle: handleId,
      startX: e.clientX, startY: e.clientY,
      startW: w, startH: h,
      startFx: x, startFy: y,
    });
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      let nw = resizing.startW;
      let nh = resizing.startH;
      let nx = resizing.startFx;
      let ny = resizing.startFy;
      const handle = resizing.handle;
      if (handle.includes('e')) nw = resizing.startW + dx;
      if (handle.includes('w')) { nw = resizing.startW - dx; nx = resizing.startFx + dx; }
      if (handle.includes('s')) nh = resizing.startH + dy;
      if (handle.includes('n')) { nh = resizing.startH - dy; ny = resizing.startFy + dy; }
      nw = Math.max(MIN_W, nw);
      nh = Math.max(MIN_H, nh);
      // 좌/우/가운데 스냅
      let snapV = null;
      if (Math.abs(nx) < SNAP_THRESHOLD) { nx = 0; snapV = 'left'; }
      const rightTarget = canvasWidth - nw;
      if (Math.abs(nx - rightTarget) < SNAP_THRESHOLD) {
        if (handle.includes('w')) nx = rightTarget;
        else nw = canvasWidth - nx;
        snapV = 'right';
      }
      const centerTarget = (canvasWidth - nw) / 2;
      if (Math.abs(nx - centerTarget) < SNAP_THRESHOLD) { nx = centerTarget; snapV = 'center'; }
      setSnapLine(snapV);
      onUpdate({
        x: Math.round(nx),
        y: Math.round(ny),
        width: Math.round(nw),
        height: Math.round(nh),
      });
    };
    const onUp = () => { setResizing(null); setSnapLine(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing, canvasWidth]);

  // 키보드: Enter → 줄바꿈, Escape → 종료
  const onKeyDownHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      editableRef.current?.blur();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();

      const br = document.createElement('br');
      range.insertNode(br);

      // 마지막 <br> 뒤에 빈 텍스트 노드가 없으면 커서가 다음 줄에 실제로 놓이지 않음
      const parent = br.parentNode;
      let afterNode = br.nextSibling;
      if (!afterNode || (afterNode.nodeType === Node.TEXT_NODE && afterNode.textContent === '')) {
        const empty = document.createTextNode('');
        if (afterNode) {
          parent.replaceChild(empty, afterNode);
        } else {
          parent.appendChild(empty);
        }
        afterNode = empty;
      }

      const newRange = document.createRange();
      try {
        newRange.setStart(afterNode, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } catch (_) {
        try {
          newRange.setStartAfter(br);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        } catch (__) { /* noop */ }
      }
    }
  };

  // 스타일 적용 (셀 전체)
  const applyStyle = (partial) => {
    onUpdate({ style: { ...style, ...partial } });
  };

  // outline 결정
  let outlineStyle = 'none';
  if (editMode) {
    outlineStyle = '1px dashed rgba(96,165,250,0.45)';
    if (hovering) outlineStyle = '2px dashed #60a5fa';
    if (showToolbar) outlineStyle = '2px dashed #3b82f6';
    if (isEditing) outlineStyle = '2px solid #2563eb';
  }

  // 비편집 모드: 표시만
  if (!editMode) {
    return (
      <div
        data-free-text="true"
        style={{
          position: 'absolute',
          left: x, top: y,
          width: w, height: h,
          zIndex,
          overflow: 'hidden',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          whiteSpace: 'pre-wrap',
          ...style,
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // 편집 모드
  const editableProps = isEditing
    ? {}
    : { dangerouslySetInnerHTML: { __html: html } };

  return (
    <>
      <div
        ref={wrapperRef}
        data-free-text="true"
        data-editable="true"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={startEditing}
        style={{
          position: 'absolute',
          left: x, top: y,
          width: w, height: h,
          zIndex,
          cursor: isEditing ? 'text' : (dragging ? 'grabbing' : 'move'),
          outline: outlineStyle,
          outlineOffset: 2,
          backgroundColor: hovering && !isEditing ? 'rgba(96,165,250,0.05)' : 'transparent',
          transition: 'background-color 0.15s, outline-color 0.15s',
        }}
      >
        {/* 실제 contentEditable 텍스트 영역 */}
        <div
          ref={editableRef}
          contentEditable={isEditing}
          suppressContentEditableWarning
          onBlur={finishEditing}
          onKeyDown={onKeyDownHandler}
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'pre-wrap',
            outline: 'none',
            userSelect: isEditing ? 'text' : 'none',
            boxSizing: 'border-box',
            ...style,
          }}
          {...editableProps}
        />

        {/* 8개 리사이즈 핸들 */}
        {active && HANDLES.map((hd) => (
          <div
            key={hd.id}
            data-handle="true"
            onMouseDown={(e) => handleResizeStart(e, hd.id)}
            style={{
              position: 'absolute',
              ...hd.style,
              width: 12, height: 12,
              backgroundColor: '#3b82f6',
              border: '2px solid #fff',
              borderRadius: 3,
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              cursor: hd.cursor,
              zIndex: 100001,
            }}
          />
        ))}

        {/* 크기 라벨 */}
        {active && (
          <div
            data-edit-ui="size-label"
            style={{
              position: 'absolute',
              right: 4, top: -22,
              backgroundColor: 'rgba(30,41,59,0.85)', color: '#fff',
              padding: '2px 5px', borderRadius: 4, fontSize: 10, fontWeight: 800,
              zIndex: 100001, pointerEvents: 'none', whiteSpace: 'nowrap',
            }}
          >
            {Math.round(w)} × {Math.round(h)}
          </div>
        )}

        {/* 스냅 가이드 라인 */}
        {snapLine && (
          <div
            data-edit-ui="snap-line"
            style={{
              position: 'absolute',
              left: snapLine === 'left' ? 0 : (snapLine === 'right' ? '100%' : '50%'),
              top: -10, bottom: -10, width: 2,
              backgroundColor: '#f59e0b',
              transform: snapLine === 'center' ? 'translateX(-50%)' : (snapLine === 'right' ? 'translateX(-100%)' : 'none'),
              pointerEvents: 'none', zIndex: 100000,
            }}
          />
        )}
      </div>

      {/* 미니 툴바 (셀 전체 스타일) */}
      {showToolbar && !isEditing && (
        <FreeTextToolbar
          pos={toolbarPos}
          currentStyle={style}
          onApply={applyStyle}
          onDelete={onDelete}
          onChangeLayer={onChangeLayer}
          onClose={() => setShowToolbar(false)}
        />
      )}
      {isEditing && (
        <FreeTextToolbar
          pos={toolbarPos}
          currentStyle={style}
          onApply={applyStyle}
          onDelete={onDelete}
          onChangeLayer={onChangeLayer}
          onClose={() => { editableRef.current?.blur(); setShowToolbar(false); }}
        />
      )}
    </>
  );
}

function FreeTextToolbar({ pos, currentStyle, onApply, onDelete, onChangeLayer, onClose }) {
  const currentFontSize = parseInt(currentStyle?.fontSize, 10) || 16;
  const currentWeight = currentStyle?.fontWeight || 400;
  return (
    <div
      data-toolbar
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 100001,
        display: 'flex',
        gap: 4,
        padding: '6px 8px',
        backgroundColor: '#1e293b',
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        fontSize: 12,
        color: '#fff',
        whiteSpace: 'nowrap',
        alignItems: 'center',
      }}
    >
      <span style={{ fontSize: 10, color: '#fbbf24', fontWeight: 800, marginRight: 4 }}>📝 글박스</span>

      {/* 폰트 */}
      <select
        onChange={(e) => onApply({ fontFamily: FONT_PRESETS[e.target.value]?.family })}
        defaultValue=""
        style={selectStyle}
        title="폰트"
      >
        <option value="">폰트</option>
        {Object.values(FONT_PRESETS).map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>

      {/* 크기 */}
      <button style={btnStyle} onClick={() => onApply({ fontSize: Math.max(8, currentFontSize - 2) })} title="작게">A−</button>
      <span style={{ padding: '4px 2px', minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{currentFontSize}</span>
      <button style={btnStyle} onClick={() => onApply({ fontSize: currentFontSize + 2 })} title="크게">A+</button>

      {/* 굵게 */}
      <button
        style={{ ...btnStyle, fontWeight: 900, backgroundColor: currentWeight >= 700 ? '#3b82f6' : '#334155' }}
        onClick={() => onApply({ fontWeight: currentWeight >= 700 ? 500 : 800 })}
        title="굵게"
      >B</button>

      {/* 색상 */}
      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} title="글자색">
        <input
          type="color"
          defaultValue={currentStyle?.color || '#2F2A26'}
          onChange={(e) => onApply({ color: e.target.value })}
          style={{ width: 26, height: 26, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }}
        />
      </label>

      {/* 정렬 */}
      <button style={btnStyle} onClick={() => onApply({ textAlign: 'left' })} title="좌측">⬅</button>
      <button style={btnStyle} onClick={() => onApply({ textAlign: 'center' })} title="중앙">⬌</button>
      <button style={btnStyle} onClick={() => onApply({ textAlign: 'right' })} title="우측">➡</button>

      {/* 레이어 */}
      <span style={{ width: 1, height: 20, backgroundColor: '#475569', margin: '0 2px' }} />
      <button style={btnStyle} onClick={() => onChangeLayer('front')} title="맨앞">⤴</button>
      <button style={btnStyle} onClick={() => onChangeLayer('forward')} title="앞">▲</button>
      <button style={btnStyle} onClick={() => onChangeLayer('backward')} title="뒤">▼</button>
      <button style={btnStyle} onClick={() => onChangeLayer('back')} title="맨뒤">⤵</button>

      {/* 삭제 */}
      <span style={{ width: 1, height: 20, backgroundColor: '#475569', margin: '0 2px' }} />
      <button
        style={{ ...btnStyle, backgroundColor: '#7c2d12' }}
        onClick={() => { if (window.confirm('이 글박스를 삭제할까요?')) onDelete(); }}
        title="삭제"
      >🗑</button>

      {/* 닫기 */}
      <button style={btnStyle} onClick={onClose} title="닫기">✕</button>
    </div>
  );
}

const btnStyle = {
  background: '#334155',
  color: '#fff',
  border: 'none',
  padding: '5px 9px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1,
};

const selectStyle = {
  background: '#334155',
  color: '#fff',
  border: 'none',
  padding: '5px 6px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  maxWidth: 100,
};
