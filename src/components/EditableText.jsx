import { useEffect, useRef, useState } from 'react';
import { FONT_PRESETS } from '../lib/theme.js';

/**
 * EditableText — 더블클릭 시 인라인 편집 + 툴바 + 드래그 이동 지원 래퍼
 *
 * Props:
 *   - id: 고유 식별자 (페이지 내부 유일값. 예: "P1.mainHeadline")
 *   - defaultStyle: { fontSize, fontWeight, color, fontFamily, textAlign, ... }
 *     (각 페이지 컴포넌트가 "원래 스타일"로 넘겨준다)
 *   - children: 표시할 텍스트 (문자열)
 *   - editMode: 편집 모드 on/off
 *   - override: 이 요소에 대한 사용자 편집값 { text?, style?, offset? }
 *   - onChange: (partial) => void  — override 병합 콜백
 *   - as: 'div' | 'span' | 'h1' | 'h2' ...
 *   - className, style: 추가 CSS
 *   - draggable: 드래그 허용 여부 (기본 true)
 */
export default function EditableText({
  id,
  defaultStyle = {},
  children,
  editMode = false,
  override = {},
  onChange = () => {},
  as: Tag = 'div',
  className = '',
  style = {},
  draggable = true,
  placeholder = '',
}) {
  const ref = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });

  // 드래그 상태
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, baseX: 0, baseY: 0 });

  // 현재 적용할 값 (override가 있으면 우선)
  const mergedText = override?.text !== undefined ? override.text : children;
  const mergedStyle = { ...defaultStyle, ...(override?.style || {}) };
  const offset = override?.offset || { x: 0, y: 0 };

  // 편집모드 아니면 기본 렌더 (평문)
  if (!editMode) {
    return (
      <Tag className={className} style={{ ...mergedStyle, ...style }}>
        {mergedText || placeholder}
      </Tag>
    );
  }

  // 툴바 위치 계산 — viewport 기준 (position: fixed)
  // 텍스트 위쪽에 공간이 충분하면 위에, 부족하면 아래에 표시
  const updateToolbarPos = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const TOOLBAR_HEIGHT = 44;
    const TOOLBAR_WIDTH = 460; // 대략적인 툴바 너비
    const margin = 8;

    // 위쪽 공간이 부족하면 텍스트 아래에 표시
    const showBelow = rect.top < TOOLBAR_HEIGHT + margin;
    const top = showBelow ? rect.bottom + margin : rect.top - TOOLBAR_HEIGHT - margin;

    // 가로는 텍스트 좌측에 맞추되, 화면 밖으로 나가지 않게 보정
    let left = rect.left;
    const maxLeft = window.innerWidth - TOOLBAR_WIDTH - margin;
    if (left > maxLeft) left = maxLeft;
    if (left < margin) left = margin;

    setToolbarPos({ top, left });
  };

  // ─────────── 더블클릭 → 편집 시작 ───────────
  const startEditing = (e) => {
    e.stopPropagation();
    setIsEditing(true);
    setShowToolbar(true);
    updateToolbarPos();
    // contentEditable 활성화 후 포커스
    setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        // 전체 선택
        const range = document.createRange();
        range.selectNodeContents(ref.current);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 0);
  };

  // 편집 종료 (blur or ESC)
  const finishEditing = () => {
    setIsEditing(false);
    if (ref.current) {
      const newText = ref.current.innerText;
      if (newText !== mergedText) {
        onChange({ text: newText });
      }
    }
    // 툴바는 유지 (blur 시 스타일 변경도 가능)
  };

  // 클릭 (편집 모드에서 단일 클릭) → 툴바만 표시
  const handleClick = (e) => {
    if (isEditing) return; // 편집 중이면 무시
    e.stopPropagation();
    setShowToolbar((s) => !s);
    updateToolbarPos();
  };

  // 스크롤/리사이즈 시 툴바 위치 재계산
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

  // ─────────── 드래그 이동 ───────────
  const handleMouseDown = (e) => {
    if (isEditing) return;
    if (!draggable) return;
    // 툴바 영역 클릭은 제외
    if (e.target.closest('[data-toolbar]')) return;
    e.preventDefault();
    e.stopPropagation();
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      baseX: offset.x || 0,
      baseY: offset.y || 0,
    };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      onChange({
        offset: {
          x: dragStart.current.baseX + dx,
          y: dragStart.current.baseY + dy,
        },
      });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // 툴바에서 스타일 변경
  const applyStyle = (partial) => {
    const newStyle = { ...(override?.style || {}), ...partial };
    onChange({ style: newStyle });
  };

  const resetStyle = () => onChange({ style: {}, offset: { x: 0, y: 0 } });

  return (
    <>
      <Tag
        ref={ref}
        className={className}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onDoubleClick={startEditing}
        onClick={handleClick}
        onBlur={finishEditing}
        onMouseDown={handleMouseDown}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            ref.current?.blur();
          }
        }}
        style={{
          ...mergedStyle,
          ...style,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          outline: isEditing
            ? '2px solid #3b82f6'
            : showToolbar
            ? '2px dashed #60a5fa'
            : 'none',
          outlineOffset: 2,
          cursor: isEditing ? 'text' : draggable ? 'move' : 'pointer',
          position: 'relative',
          userSelect: isEditing ? 'text' : 'none',
          // 편집 모드에서만 호버 표시
          boxShadow: showToolbar && !isEditing ? '0 0 0 2px rgba(96,165,250,0.2)' : undefined,
        }}
      >
        {mergedText || placeholder}
      </Tag>

      {showToolbar && (
        <MiniToolbar
          pos={toolbarPos}
          currentStyle={mergedStyle}
          onApply={applyStyle}
          onReset={resetStyle}
          onClose={() => setShowToolbar(false)}
        />
      )}
    </>
  );
}

// ─────────── 간이 툴바 ───────────
function MiniToolbar({ pos, currentStyle, onApply, onReset, onClose }) {
  const currentFontSize = parseInt(currentStyle?.fontSize, 10) || 16;

  return (
    <div
      data-toolbar
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        display: 'flex',
        gap: 4,
        padding: '6px 8px',
        backgroundColor: '#1e293b',
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        fontSize: 12,
        color: '#fff',
        whiteSpace: 'nowrap',
      }}
    >
      {/* 폰트 선택 */}
      <select
        onChange={(e) => onApply({ fontFamily: FONT_PRESETS[e.target.value]?.family })}
        defaultValue=""
        style={toolbarSelectStyle}
        title="폰트"
      >
        <option value="">폰트</option>
        {Object.values(FONT_PRESETS).map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      {/* 크기 조절 */}
      <button
        style={toolbarBtnStyle}
        onClick={() => onApply({ fontSize: Math.max(8, currentFontSize - 2) })}
        title="크기 작게"
      >
        A−
      </button>
      <span style={{ padding: '4px 2px', minWidth: 24, textAlign: 'center' }}>
        {currentFontSize}
      </span>
      <button
        style={toolbarBtnStyle}
        onClick={() => onApply({ fontSize: currentFontSize + 2 })}
        title="크기 크게"
      >
        A+
      </button>

      {/* 굵기 토글 */}
      <button
        style={{
          ...toolbarBtnStyle,
          fontWeight: 900,
          backgroundColor:
            (currentStyle?.fontWeight || 400) >= 700 ? '#3b82f6' : '#334155',
        }}
        onClick={() =>
          onApply({
            fontWeight: (currentStyle?.fontWeight || 400) >= 700 ? 500 : 800,
          })
        }
        title="굵게"
      >
        B
      </button>

      {/* 색상 */}
      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} title="글자 색">
        <input
          type="color"
          defaultValue={currentStyle?.color || '#2F2A26'}
          onChange={(e) => onApply({ color: e.target.value })}
          style={{
            width: 24,
            height: 24,
            border: 'none',
            padding: 0,
            background: 'transparent',
            cursor: 'pointer',
          }}
        />
      </label>

      {/* 정렬 */}
      <button style={toolbarBtnStyle} onClick={() => onApply({ textAlign: 'left' })} title="왼쪽 정렬">
        ⬅
      </button>
      <button style={toolbarBtnStyle} onClick={() => onApply({ textAlign: 'center' })} title="가운데">
        ⬌
      </button>
      <button style={toolbarBtnStyle} onClick={() => onApply({ textAlign: 'right' })} title="오른쪽">
        ➡
      </button>

      {/* 초기화 */}
      <button
        style={{ ...toolbarBtnStyle, backgroundColor: '#7c2d12' }}
        onClick={onReset}
        title="이 텍스트 스타일 초기화"
      >
        ↺
      </button>

      {/* 닫기 */}
      <button style={toolbarBtnStyle} onClick={onClose} title="툴바 닫기">
        ✕
      </button>
    </div>
  );
}

const toolbarBtnStyle = {
  background: '#334155',
  color: '#fff',
  border: 'none',
  padding: '4px 8px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
};

const toolbarSelectStyle = {
  background: '#334155',
  color: '#fff',
  border: 'none',
  padding: '4px 6px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  maxWidth: 100,
};
