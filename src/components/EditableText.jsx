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
 *   - override: 이 요소에 대한 사용자 편집값 { text?, html?, style?, offset? }
 *   - onChange: (partial) => void  — override 병합 콜백
 *   - as: 'div' | 'span' | 'h1' | 'h2' ...
 *   - className, style: 추가 CSS
 *   - draggable: 드래그 허용 여부 (기본 true)
 *
 * 🆕 (2026-05-02) 부분 서식 지원:
 *   - 편집 중 텍스트를 드래그로 선택 → 인라인 툴바 표시 (선택 부분만 굵게/색상/크기 변경)
 *   - 저장 형식: override.html (HTML 문자열) — 서식 보존
 *   - 하위 호환: override.text (plain text) 도 계속 지원
 */
const DRAG_THRESHOLD = 5; // px — 이 이상 움직여야 실제 드래그로 인식

// 🆕 텍스트를 안전한 HTML로 변환 (plain text → HTML)
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// 🆕 children(문자열) 또는 override.html → 초기 HTML 결정
function resolveInitialHtml(override, children) {
  if (override?.html !== undefined) return override.html;
  if (override?.text !== undefined) return escapeHtml(override.text);
  return escapeHtml(children || '');
}

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
  const [hovering, setHovering] = useState(false);

  // 🆕 인라인 툴바 (선택 부분 서식용) 상태
  const [inlineToolbar, setInlineToolbar] = useState({ show: false, top: 0, left: 0 });
  // 🆕 (2026-05-06) 인라인 툴바 작업 직후 selectionchange 로 인한 자동 닫힘 방지 가드
  //   color/bold/fontSize 적용 직후 selection 이 잠깐 collapsed 되거나 재설정될 때
  //   handleSelectionChange 가 툴바를 닫아버리는 현상을 막기 위한 짧은 시간 가드
  const inlineApplyingRef = useRef(false);

  // 드래그 상태
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, baseX: 0, baseY: 0, active: false, started: false });

  // 현재 적용할 값 (override가 있으면 우선)
  const mergedHtml = resolveInitialHtml(override, children);
  const mergedText = override?.text !== undefined ? override.text : (typeof children === 'string' ? children : '');
  const mergedStyle = { ...defaultStyle, ...(override?.style || {}) };
  const offset = override?.offset || { x: 0, y: 0 };

  // ⚠️ Hook 규칙 — useEffect는 early return 보다 먼저 호출되어야 함
  //    (editMode 토글 시 Hook 개수가 바뀌면 React가 크래시함)
  //    early return은 모든 Hook 호출 뒤로 이동.

  // 툴바 위치 계산 — viewport 기준 (position: fixed)
  const updateToolbarPos = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
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

  // ─────────── 더블클릭 → 편집 시작 ───────────
  const startEditing = (e) => {
    e.stopPropagation();
    setIsEditing(true);
    setShowToolbar(true);
    updateToolbarPos();
    setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
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
    setInlineToolbar({ show: false, top: 0, left: 0 });
    if (ref.current) {
      const newHtml = ref.current.innerHTML;
      const newText = ref.current.innerText;
      // 🆕 HTML과 plain text 둘 다 저장 (HTML이 마스터, text는 검색/AI 호환용)
      if (newHtml !== mergedHtml) {
        onChange({ html: newHtml, text: newText });
      }
    }
  };

  // 클릭 (편집 모드에서 단일 클릭) → 툴바 토글 표시
  const handleClick = (e) => {
    if (isEditing) return;
    // 드래그가 실제로 발생했었다면 클릭을 무시
    if (dragStart.current.started) {
      dragStart.current.started = false;
      return;
    }
    e.stopPropagation();
    setShowToolbar(true);
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

  // 🆕 텍스트 선택 감지 — 편집 중 드래그로 일부 선택하면 인라인 툴바 표시
  useEffect(() => {
    if (!isEditing) {
      setInlineToolbar({ show: false, top: 0, left: 0 });
      return;
    }
    const handleSelectionChange = () => {
      // 🆕 (2026-05-06) 인라인 툴바에서 색상/굵게/크기 적용 직후 selection 이 잠깐
      //   collapsed 되거나 재설정될 때 툴바가 닫히는 현상 방지 — 가드 켜진 동안엔 무시
      if (inlineApplyingRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setInlineToolbar((s) => (s.show ? { show: false, top: 0, left: 0 } : s));
        return;
      }
      // 선택 영역이 현재 편집 중인 요소 안인지 확인
      const range = sel.getRangeAt(0);
      if (!ref.current || !ref.current.contains(range.commonAncestorContainer)) {
        setInlineToolbar((s) => (s.show ? { show: false, top: 0, left: 0 } : s));
        return;
      }
      // 선택 영역 위에 툴바 표시
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const INLINE_TOOLBAR_HEIGHT = 40;
      const INLINE_TOOLBAR_WIDTH = 320;
      const margin = 6;
      let top = rect.top - INLINE_TOOLBAR_HEIGHT - margin;
      // 화면 위로 넘치면 아래로 표시
      if (top < margin) top = rect.bottom + margin;
      let left = rect.left + rect.width / 2 - INLINE_TOOLBAR_WIDTH / 2;
      const maxLeft = window.innerWidth - INLINE_TOOLBAR_WIDTH - margin;
      if (left > maxLeft) left = maxLeft;
      if (left < margin) left = margin;
      setInlineToolbar({ show: true, top, left });
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [isEditing]);

  // 🔑 외부(다른 EditableText 또는 빈 영역) 클릭 시 — 편집 종료 + 툴바 닫기
  //    이렇게 해야 "위 글씨 수정 → 아래 글씨 클릭" 시 위 글씨의 편집창이 닫힘
  useEffect(() => {
    if (!isEditing && !showToolbar) return;
    const handlePointerDown = (e) => {
      // 자기 자신 안쪽이면 무시
      if (ref.current && ref.current.contains(e.target)) return;
      // 자기 툴바 안쪽이면 무시 (툴바는 portal이 아니라 형제로 렌더되므로 data-toolbar 로 구분)
      if (e.target.closest && e.target.closest('[data-toolbar]')) return;
      // 🆕 인라인 툴바 안쪽이면 무시
      if (e.target.closest && e.target.closest('[data-inline-toolbar]')) return;
      // 🆕 (2026-05-08) OS 컬러 피커 열려있는 동안엔 편집 종료 무시
      //   native color dialog 가 열리면 페이지에 mousedown 이 한 번 더 발생하는데
      //   그게 인라인 툴바 영역 밖이면 편집창이 꺼져버리는 문제가 있어 가드 추가.
      if (typeof window !== 'undefined' && window.__editableColorPickerOpen) return;
      // 🆕 (2026-05-08) 인라인 작업 직후 잠깐(가드 ON)도 외부 mousedown 으로 닫지 않음
      if (inlineApplyingRef.current) return;

      // 편집 중이었다면 → 변경사항 저장 후 종료
      if (isEditing) {
        if (ref.current) {
          const newHtml = ref.current.innerHTML;
          const newText = ref.current.innerText;
          if (newHtml !== mergedHtml) {
            onChange({ html: newHtml, text: newText });
          }
        }
        setIsEditing(false);
      }
      // 툴바 닫기
      setShowToolbar(false);
      setInlineToolbar({ show: false, top: 0, left: 0 });
    };
    // mousedown 단계에서 처리 (click 보다 먼저 실행되어 다른 요소 클릭 충돌 방지)
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, showToolbar, mergedHtml]);

  // ─────────── 드래그 이동 (임계값 기반) ───────────
  const handleMouseDown = (e) => {
    if (isEditing) return;
    if (!draggable) return;
    if (e.target.closest('[data-toolbar]')) return;
    // preventDefault 하지 않음 (클릭 이벤트가 살아있어야 함)
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      baseX: offset.x || 0,
      baseY: offset.y || 0,
      active: true,
      started: false,
    };
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragStart.current.active) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      // 임계값 넘기 전엔 단순 클릭으로 간주
      if (!dragStart.current.started) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        dragStart.current.started = true;
        setDragging(true);
      }
      onChange({
        offset: {
          x: dragStart.current.baseX + dx,
          y: dragStart.current.baseY + dy,
        },
      });
    };
    const handleUp = () => {
      if (dragStart.current.active) {
        dragStart.current.active = false;
        // started=true면 click handler가 자기 자신을 무시하도록 잠시 유지
        if (dragStart.current.started) {
          setDragging(false);
        }
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🆕 편집 중 contentEditable 영역에 초기 HTML 주입
  //    React는 contentEditable 요소의 자식을 직접 제어하면 안 되므로
  //    isEditing 시작 시점에 한 번만 innerHTML을 설정하고, 이후엔 사용자 입력에 맡김
  useEffect(() => {
    if (isEditing && ref.current) {
      ref.current.innerHTML = mergedHtml || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // 🆕 (2026-05-03) 가시성 토글 (포토샵 방식) — visibility:hidden (PNG 캡처에도 반영)
  const isHidden = !!override?.hidden;

  // ✅ 모든 Hook 호출 뒤에서 early return — Hook 규칙 준수
  if (!editMode) {
    // 🆕 일반 표시 모드 — 부분 서식 보존 위해 dangerouslySetInnerHTML 사용
    const displayHtml = mergedHtml && mergedHtml.trim() ? mergedHtml : escapeHtml(placeholder || '');
    // 🆕 (2026-05-03) 가시성 토글: hidden 상태일 때만 visibility:hidden 적용
    //   (visible 인 경우 속성 자체를 빼서 html-to-image SVG foreignObject 변환에 영향 없음)
    const visStyle = isHidden ? { visibility: 'hidden' } : {};
    return (
      <Tag
        className={className}
        style={{
          ...mergedStyle,
          ...style,
          // 🆕 줄바꿈(\n) 유지 — 사용자가 편집 시 입력한 엔터를 PNG/화면에서 그대로 표시
          whiteSpace: mergedStyle.whiteSpace || 'pre-wrap',
          ...visStyle,
        }}
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />
    );
  }

  // 툴바에서 스타일 변경 (셀 전체 적용)
  const applyStyle = (partial) => {
    const newStyle = { ...(override?.style || {}), ...partial };
    onChange({ style: newStyle });
  };

  const resetStyle = () => onChange({ style: {}, offset: { x: 0, y: 0 } });

  // 🆕 인라인 툴바 — 선택 부분에만 서식 적용 후 즉시 저장
  // 🆕 (2026-05-06) execCommand('foreColor') 가 줄바꿈(\n) 텍스트노드를 만났을 때
  //   <font> 태그가 DOM 트리를 깨면서 React 의 다음 렌더에서 Uncaught 예외 → 화면 흰색
  //   현상을 유발하므로, 색상도 직접 span 으로 감싸는 방식으로 변경.
  //   bold/removeFormat 도 try/catch 로 보호하여 실패 시 화면이 꺼지지 않도록 함.
  const applyInline = (action) => {
    if (!ref.current) return;
    // 🆕 (2026-05-06) 가드 ON — selectionchange 로 인한 인라인 툴바 자동 닫힘 방지
    inlineApplyingRef.current = true;
    // 포커스 유지 + 선택 영역 보존
    try {
      ref.current.focus();
    } catch (_) { /* ignore */ }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      // 가드 해제 후 종료 — 짧게 50ms 만 보호 (재선택 방해 최소화)
      setTimeout(() => { inlineApplyingRef.current = false; }, 50);
      return;
    }

    try {
      if (action.type === 'bold') {
        // bold 도 직접 span 으로 처리 — execCommand 가 줄바꿈 노드 가로지르면 DOM 깨짐
        applySpanStyle(sel, { fontWeight: '900' });
      } else if (action.type === 'color') {
        // 🆕 색상도 직접 span 으로 — execCommand('foreColor') 미사용
        applySpanStyle(sel, { color: action.value });
      } else if (action.type === 'fontSize') {
        applySpanStyle(sel, { fontSize: action.value + 'px' });
      } else if (action.type === 'fontSizeDelta') {
        const currentSize = readSelectionFontSize(sel) || (parseInt(mergedStyle.fontSize, 10) || 16);
        const next = Math.max(8, currentSize + action.delta);
        applySpanStyle(sel, { fontSize: next + 'px' });
      } else if (action.type === 'reset') {
        // 선택 부분의 인라인 서식 제거 — execCommand 도 try/catch 로 보호
        try {
          document.execCommand('removeFormat', false, null);
        } catch (_) { /* ignore */ }
      }
    } catch (err) {
      // 어떤 경우에도 throw 가 부모 컴포넌트로 올라가지 않도록 보호
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[EditableText] applyInline failed:', err);
      }
    }

    // 변경 즉시 저장 — onChange 자체도 try/catch 로 보호
    try {
      if (ref.current) {
        const newHtml = ref.current.innerHTML;
        const newText = ref.current.innerText;
        onChange({ html: newHtml, text: newText });
      }
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[EditableText] onChange failed:', err);
      }
    }

    // 🆕 (2026-05-08) selection 을 강제 collapse 하지 않음 — collapse 하면
    //   "이미 서식이 적용된 글씨" 위에서 다시 드래그할 때 selection 이 꼬여
    //   재선택이 안 되는 현상이 발생함. applySpanStyle 안에서 새 span 전체를
    //   selection 으로 잡아두므로, 사용자는 그대로 다른 텍스트를 드래그하면 됨.
    //   (selection 은 사용자 mousedown 시 자동으로 새로 시작됨)

    // 🆕 (2026-05-08) 가드 OFF — 200ms 로 늘려 OS 색상 다이얼로그가 닫히면서
    //   발생하는 selectionchange / mousedown 으로 툴바가 자동 닫히지 않도록 함.
    setTimeout(() => { inlineApplyingRef.current = false; }, 200);
  };

  // 편집모드일 때 outline 결정 — hover/showToolbar/isEditing 단계별 강조
  let outlineStyle = '1px dashed rgba(96,165,250,0.45)'; // 기본 (어디가 편집 가능한지 표시)
  if (hovering) outlineStyle = '2px dashed #60a5fa';
  if (showToolbar) outlineStyle = '2px dashed #3b82f6';
  if (isEditing) outlineStyle = '2px solid #2563eb';

  // 편집 모드일 때 — contentEditable 영역에는 초기 HTML을 useEffect로 주입하므로
  //                   여기서는 비어있게 두거나, 비편집 상태면 dangerouslySetInnerHTML로 표시
  const editableProps = isEditing
    ? {} // 편집 중엔 React가 자식 제어 안 함 (contentEditable이 사용자 입력 직접 처리)
    : { dangerouslySetInnerHTML: { __html: mergedHtml || escapeHtml(placeholder || '') } };

  return (
    <>
      <Tag
        ref={ref}
        data-editable="true"
        className={className}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onDoubleClick={startEditing}
        onClick={handleClick}
        onBlur={finishEditing}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            ref.current?.blur();
            return;
          }
          // 🆕 Enter 키 → 줄바꿈 허용 (Shift+Enter는 단락, Enter도 단순 줄바꿈)
          //   기본 contentEditable의 Enter 동작이 브라우저마다 다름(<div>/<br>/<p>)
          //   → 일관성을 위해 \n 문자를 직접 삽입해 innerText에 \n 으로 저장되게 함
          //   (PNG 캡처/화면 표시 시 whiteSpace: pre-wrap 으로 줄바꿈됨)
          if (e.key === 'Enter') {
            e.preventDefault();
            // 현재 선택 영역에 \n 삽입
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const textNode = document.createTextNode('\n');
            range.insertNode(textNode);
            // 커서를 \n 뒤로 이동
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }}
        title={isEditing ? '편집 중 (Enter: 줄바꿈, ESC: 종료, 드래그 선택: 부분 서식)' : '더블클릭: 글자 수정 · 클릭: 툴바 · 드래그: 이동'}
        style={{
          ...mergedStyle,
          ...style,
          // 🆕 편집 모드에서도 줄바꿈(\n) 표시 유지
          whiteSpace: mergedStyle.whiteSpace || 'pre-wrap',
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          outline: outlineStyle,
          outlineOffset: 2,
          cursor: isEditing ? 'text' : 'pointer',
          position: 'relative',
          userSelect: isEditing ? 'text' : 'none',
          backgroundColor: hovering && !isEditing ? 'rgba(96,165,250,0.08)' : undefined,
          transition: 'background-color 0.15s, outline-color 0.15s',
          // 🆕 (2026-05-06) 가시성 토글 — FreeText 와 동작 통일:
          //   hidden 상태일 때 편집 모드에서도 visibility:hidden 으로 완전히 숨김.
          //   다시 켜는 것은 레이어 패널의 눈 아이콘으로만 가능 (FreeText/FreeImage 와 동일).
          //   PNG 캡처 시에도 그대로 숨겨진 상태로 출력됨.
          ...(isHidden ? { visibility: 'hidden' } : null),
        }}
        {...editableProps}
      />

      {showToolbar && (
        <MiniToolbar
          pos={toolbarPos}
          currentStyle={mergedStyle}
          onApply={applyStyle}
          onReset={resetStyle}
          onClose={() => setShowToolbar(false)}
        />
      )}

      {/* 🆕 인라인 툴바 — 선택 부분만 서식 변경 */}
      {isEditing && inlineToolbar.show && (
        <InlineToolbar
          pos={inlineToolbar}
          onApply={applyInline}
        />
      )}
    </>
  );
}

// 🆕 선택 영역을 <span style="..."> 으로 감싸기
// 🆕 (2026-05-06) 줄바꿈(\n) 텍스트노드가 포함된 다중 줄 선택에서도 DOM 손상 없이
//   안전하게 동작하도록 보강. extractContents 가 \n 을 가로지를 때 발생할 수 있는
//   예외를 잡아 화면이 꺼지지 않도록 try/catch 로 보호하고, 실패 시 selection 을 원복.
function applySpanStyle(sel, styleObj) {
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;

  // 원래 selection 을 복구하기 위한 백업
  const backup = range.cloneRange();

  const span = document.createElement('span');
  Object.entries(styleObj).forEach(([k, v]) => {
    try { span.style[k] = v; } catch (_) { /* ignore invalid style */ }
  });

  try {
    // 선택 영역 추출 → span에 넣기
    const contents = range.extractContents();
    span.appendChild(contents);
    range.insertNode(span);
    // 새 span 안의 영역을 다시 선택 (연속 작업 가능)
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(newRange);
  } catch (err) {
    // 복잡한 DOM 구조에서 실패해도 화면이 꺼지지 않도록 selection 원복
    try {
      sel.removeAllRanges();
      sel.addRange(backup);
    } catch (_) { /* ignore */ }
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[EditableText] applySpanStyle failed:', err);
    }
  }
}

// 🆕 선택 영역의 첫 번째 요소의 fontSize를 읽기
function readSelectionFontSize(sel) {
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  let node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  if (!node) return null;
  const cs = window.getComputedStyle(node);
  const px = parseInt(cs.fontSize, 10);
  return Number.isFinite(px) ? px : null;
}

// ─────────── 셀 전체 툴바 (기존) ───────────
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
      <span style={{ padding: '4px 2px', minWidth: 28, textAlign: 'center', fontWeight: 700 }}>
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
            width: 26,
            height: 26,
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

// 🆕 인라인 툴바 — 선택한 부분만 서식 적용
// 🆕 (2026-05-06) 컬러 피커(input[type=color]) 부활 — selection 백업/복원 방식으로 안전 처리
function InlineToolbar({ pos, onApply }) {
  // 컬러 피커 클릭 직전 selection 을 백업 — native picker 가 열리며 포커스 빼앗아도
  // 색상 선택 후 selection 을 복원해서 정상 적용되도록 함.
  const savedRangeRef = useRef(null);

  const saveSelection = () => {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    } catch (_) { /* ignore */ }
  };

  const restoreSelection = () => {
    try {
      if (savedRangeRef.current) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
    } catch (_) { /* ignore */ }
  };

  return (
    <div
      data-inline-toolbar
      // 🆕 (2026-05-08) 루트에는 preventDefault 를 걸지 않음.
      //   루트에서 preventDefault 하면 자식 <input type="color"> 의 native click 이
      //   무력화되어 OS 컬러 피커가 절대 안 열리는 문제가 발생.
      //   각 버튼이 개별적으로 preventDefault 를 책임진다 (color input 만 예외).
      onMouseDown={(e) => { e.stopPropagation(); }}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 100002,
        display: 'flex',
        gap: 4,
        padding: '5px 7px',
        backgroundColor: '#0f172a',
        border: '1px solid #f59e0b',
        borderRadius: 6,
        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        fontSize: 11,
        color: '#fff',
        whiteSpace: 'nowrap',
        alignItems: 'center',
      }}
    >
      {/* 라벨 */}
      <span style={{ fontSize: 9, color: '#fbbf24', fontWeight: 800, padding: '0 3px' }}>
        선택 부분
      </span>

      {/* 굵게 토글 */}
      <button
        style={inlineBtnStyle}
        onMouseDown={(e) => { e.preventDefault(); onApply({ type: 'bold' }); }}
        title="선택 부분 굵게 토글"
      >
        <b>B</b>
      </button>

      {/* 크기 작게 */}
      <button
        style={inlineBtnStyle}
        onMouseDown={(e) => { e.preventDefault(); onApply({ type: 'fontSizeDelta', delta: -2 }); }}
        title="선택 부분 글씨 크기 작게"
      >
        A−
      </button>

      {/* 크기 크게 */}
      <button
        style={inlineBtnStyle}
        onMouseDown={(e) => { e.preventDefault(); onApply({ type: 'fontSizeDelta', delta: 2 }); }}
        title="선택 부분 글씨 크기 크게"
      >
        A+
      </button>

      {/* 🆕 (2026-05-08) 컬러 피커 — native OS picker 를 실제로 열기.
           ⚠️ 핵심: <label>/<input type=color> 의 mousedown 에 preventDefault 를 걸면
           브라우저가 native color dialog 를 열지 않는다. 그래서 preventDefault 는
           **절대 사용하지 않고**, selection 백업만 한다.
           contentEditable 포커스가 잠깐 빠져도 선택 영역은 savedRangeRef 에 보관 →
           onChange 시 복원 → 색상 적용. window.__editableColorPickerOpen 플래그로
           외부 mousedown 핸들러가 편집을 끝내지 않도록 가드. */}
      <label
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', cursor: 'pointer',
          width: 28, height: 22, borderRadius: 4,
          background: 'linear-gradient(45deg, #ef4444 0%, #f59e0b 25%, #eab308 50%, #22c55e 70%, #3b82f6 90%, #a855f7 100%)',
          border: '1px solid #fff',
        }}
        title="컬러 피커 — 무지개에서 색 선택"
        // ⚠️ preventDefault 절대 금지 — native picker 가 열리지 않음
        onMouseDown={(e) => {
          e.stopPropagation();
          saveSelection();
        }}
      >
        <span style={{ fontSize: 11, color: '#fff', fontWeight: 900, textShadow: '0 0 2px rgba(0,0,0,0.6)', pointerEvents: 'none' }}>🎨</span>
        <input
          type="color"
          // ⚠️ preventDefault 절대 금지 — 이게 있으면 OS 컬러창이 안 열린다.
          //   mousedown / click 에서 selection 만 백업하고, 바로 native picker 가 열리도록 둠.
          onMouseDown={(e) => {
            e.stopPropagation();
            saveSelection();
            // 🆕 OS 컬러 다이얼로그 열림 표시 — 외부 mousedown 핸들러가 편집을 끝내지 못하게 가드
            if (typeof window !== 'undefined') {
              window.__editableColorPickerOpen = true;
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            saveSelection();
            if (typeof window !== 'undefined') {
              window.__editableColorPickerOpen = true;
            }
          }}
          onChange={(e) => {
            const value = e.target.value;
            // selection 복원 후 색상 적용
            restoreSelection();
            onApply({ type: 'color', value });
            // 다이얼로그 닫힘 — 다음 mousedown 부터 정상 동작하도록 약간 늦게 해제
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                window.__editableColorPickerOpen = false;
              }
            }, 300);
          }}
          onBlur={() => {
            // 사용자가 색을 안 고르고 다이얼로그 닫은 경우에도 플래그 해제
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                window.__editableColorPickerOpen = false;
              }
            }, 300);
          }}
          // 시각적으로는 라벨이 보이고, 실제 input 은 라벨을 덮도록 투명하게 배치
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer',
            border: 'none', padding: 0, background: 'transparent',
          }}
        />
      </label>

      {/* 빠른 색상 — 검정 */}
      <button
        style={{ ...inlineBtnStyle, backgroundColor: '#111827', border: '1px solid #fff' }}
        onMouseDown={(e) => { e.preventDefault(); onApply({ type: 'color', value: '#111827' }); }}
        title="검정"
      >
        ●
      </button>

      {/* 빠른 색상 — 흰색 */}
      <button
        style={{ ...inlineBtnStyle, backgroundColor: '#ffffff', color: '#111', border: '1px solid #94a3b8' }}
        onMouseDown={(e) => { e.preventDefault(); onApply({ type: 'color', value: '#ffffff' }); }}
        title="흰색"
      >
        ●
      </button>

      {/* 빠른 색상 — 빨강 */}
      <button
        style={{ ...inlineBtnStyle, backgroundColor: '#dc2626' }}
        onMouseDown={(e) => { e.preventDefault(); onApply({ type: 'color', value: '#dc2626' }); }}
        title="빨강"
      >
        ●
      </button>

      {/* 빠른 색상 — 파랑 */}
      <button
        style={{ ...inlineBtnStyle, backgroundColor: '#2563eb' }}
        onMouseDown={(e) => { e.preventDefault(); onApply({ type: 'color', value: '#2563eb' }); }}
        title="파랑"
      >
        ●
      </button>

      {/* 서식 제거 */}
      <button
        style={{ ...inlineBtnStyle, backgroundColor: '#475569' }}
        onMouseDown={(e) => { e.preventDefault(); onApply({ type: 'reset' }); }}
        title="선택 부분 서식 제거"
      >
        ↺
      </button>
    </div>
  );
}

const toolbarBtnStyle = {
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

const toolbarSelectStyle = {
  background: '#334155',
  color: '#fff',
  border: 'none',
  padding: '5px 6px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  maxWidth: 110,
};

const inlineBtnStyle = {
  background: '#1e293b',
  color: '#fff',
  border: '1px solid #334155',
  padding: '3px 7px',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  minWidth: 22,
};
