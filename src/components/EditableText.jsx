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
  // 🆕 (2026-05-08) 핵심: 브라우저가 더블클릭 시 native 로 잡아주는 word selection 을
  //   절대 깨지 않는다. 이전엔 setTimeout 안에서 selectNodeContents 또는
  //   caretRangeFromPoint 로 selection 을 새로 만들었는데, setIsEditing 리렌더 후
  //   useEffect 가 innerHTML 을 재주입하면서 native word selection 이 날아가는 문제가
  //   있었음. 이제는 contentEditable 만 켜고 selection 은 브라우저에 맡긴다.
  const startEditing = (e) => {
    e.stopPropagation();
    if (isEditing) {
      return;
    }
    setIsEditing(true);
    setShowToolbar(true);
    updateToolbarPos();
    // selection 은 브라우저 native double-click 동작에 맡김 → 단어 자동 선택됨.
    // 만약 글자가 없는 빈 EditableText 라면 브라우저가 잡아줄 게 없으므로
    // 약간 지연 후 전체 selection 을 fallback 으로 잡아줌.
    setTimeout(() => {
      if (!ref.current) return;
      const sel = window.getSelection();
      // 이미 native selection 이 살아있고 우리 영역 안에 있으면 그대로 둔다.
      if (
        sel && sel.rangeCount > 0 && !sel.isCollapsed &&
        ref.current.contains(sel.getRangeAt(0).commonAncestorContainer)
      ) {
        try { ref.current.focus(); } catch (_) { /* ignore */ }
        return;
      }
      // selection 이 비어있으면 (빈 글씨 박스 등) → 전체 선택 fallback
      try {
        ref.current.focus();
        const range = document.createRange();
        range.selectNodeContents(ref.current);
        const sel2 = window.getSelection();
        sel2.removeAllRanges();
        sel2.addRange(range);
      } catch (_) { /* ignore */ }
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

  // 🆕 (2026-05-08) 편집 중 innerHTML 재주입 로직 제거.
  //   이전엔 isEditing 이 true 가 되는 순간 ref.current.innerHTML = mergedHtml 로
  //   강제 주입했는데, 이게 더블클릭 직후 브라우저가 native 로 잡아준 word selection 을
  //   날려버리는 부작용이 있었음. 비편집 모드의 dangerouslySetInnerHTML 로 이미 정확한
  //   HTML 이 DOM 에 들어가 있고, contentEditable 토글 시 그대로 유지되므로 재주입 불필요.
  //   editableProps 분기로 React 가 편집 중 자식을 건드리지 않도록 처리되어 있음.

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
        // 🆕 (2026-05-08) execCommand('removeFormat') 는 정렬/폰트까지 모두 제거하여
        //   글씨가 검정/왼쪽정렬로 돌아가는 문제가 있음. 선택 영역의 인라인 텍스트 서식
        //   (color / fontWeight / fontSize) 만 정확하게 제거하도록 직접 처리.
        try {
          clearInlineTextFormat(sel, ref.current);
        } catch (err) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[EditableText] reset failed:', err);
          }
        }
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

// 🆕 (2026-05-08) 선택 영역의 인라인 텍스트 서식만 제거 (정렬/폰트/줄바꿈 보존).
//   execCommand('removeFormat') 는 정렬/폰트 등 너무 많은 걸 건드려서 글씨가
//   검정/왼쪽정렬로 돌아가는 문제가 있음. 이 함수는 선택 영역에 걸친 텍스트 노드의
//   부모 span 들에서 color / fontWeight / fontSize 만 정확하게 비운다.
//   - span 의 다른 인라인 스타일 (background, textDecoration 등) 은 유지
//   - span 의 style 이 완전히 비면 unwrap 해서 깔끔하게 정리
//   - 텍스트 자체는 그대로 보존
function clearInlineTextFormat(sel, rootEl) {
  if (!sel || sel.rangeCount === 0 || !rootEl) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;

  // 선택 범위 내 모든 텍스트 노드 수집
  const textNodes = [];
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // 텍스트 노드가 선택 range 와 교차하는지 확인
      const nodeRange = document.createRange();
      try {
        nodeRange.selectNodeContents(node);
      } catch (_) {
        return NodeFilter.FILTER_REJECT;
      }
      // range 의 끝이 nodeRange 의 시작보다 뒤이고, range 의 시작이 nodeRange 의 끝보다 앞이면 교차
      if (
        range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
        range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
      ) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_REJECT;
    },
  });

  let node;
  // eslint-disable-next-line no-cond-assign
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  // 각 텍스트 노드의 조상 span 들에서 인라인 텍스트 서식 제거
  const TARGET_PROPS = ['color', 'fontWeight', 'fontSize'];
  // 처리한 span 중복 제거용
  const processed = new Set();

  textNodes.forEach((tn) => {
    let cur = tn.parentNode;
    while (cur && cur !== rootEl && cur.nodeType === Node.ELEMENT_NODE) {
      if (cur.tagName === 'SPAN' && !processed.has(cur)) {
        processed.add(cur);
        // 타깃 속성만 제거
        TARGET_PROPS.forEach((p) => {
          try { cur.style[p] = ''; } catch (_) { /* ignore */ }
        });
        // 만약 style 이 모두 비었으면 span 을 unwrap (자식들을 부모로 빼냄)
        if (!cur.getAttribute('style') || cur.getAttribute('style').trim() === '') {
          const parent = cur.parentNode;
          if (parent) {
            while (cur.firstChild) {
              parent.insertBefore(cur.firstChild, cur);
            }
            parent.removeChild(cur);
          }
        }
      }
      cur = cur.parentNode;
    }
  });
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
  // 🆕 (2026-05-08) native <input type=color> 포기 — CSP / preventDefault / 외부 mousedown
  //   문제로 OS 다이얼로그가 안정적으로 열리지 않음. 사용자 요청대로 커스텀 색상 그리드
  //   팝업으로 변경. 팝업이 InlineToolbar 내부 (data-inline-toolbar) 에 렌더되므로
  //   외부 mousedown 핸들러에 안 걸려서 옵션바가 꺼지지 않음.
  const [showPalette, setShowPalette] = useState(false);

  // 🆕 (2026-05-08) ::selection 파란 박스 숨김 처리 제거 — 사용자 요청으로
  //   색상표를 눌러도 파란 박스를 그대로 두는 단계로 되돌림.
  //   드래그 선택 시각화가 항상 살아있어야 어느 부분을 작업 중인지 명확함.

  return (
    <div
      data-inline-toolbar
      // 루트는 preventDefault 로 contentEditable 의 selection 유지 + stopPropagation
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
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

      {/* 🆕 (2026-05-08) 커스텀 색상 그리드 팝업 — native picker 대체
           작은 무지개 팔레트 버튼 클릭 → 팝업 그리드 표시 → 색 클릭 시 적용 + 팝업 닫힘.
           팝업이 옵션바 내부에 렌더되므로 외부 mousedown 핸들러에 안 걸리고,
           contentEditable 포커스도 mousedown preventDefault 로 유지됨. */}
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          type="button"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            width: 28, height: 22, borderRadius: 4,
            background: 'linear-gradient(45deg, #ef4444 0%, #f59e0b 25%, #eab308 50%, #22c55e 70%, #3b82f6 90%, #a855f7 100%)',
            border: '1px solid #fff',
            padding: 0,
          }}
          title="컬러 피커 — 클릭해서 색 선택"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowPalette((s) => !s);
          }}
        >
          <span style={{ fontSize: 11, color: '#fff', fontWeight: 900, textShadow: '0 0 2px rgba(0,0,0,0.6)', pointerEvents: 'none' }}>🎨</span>
        </button>

        {showPalette && (
          <ColorPalettePopup
            onPick={(value) => {
              onApply({ type: 'color', value });
              setShowPalette(false);
            }}
            onClose={() => setShowPalette(false)}
          />
        )}
      </div>

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

// 🆕 (2026-05-08) 커스텀 색상 그리드 팝업 — 풍부한 색상 선택용.
//   20 hue × 8단계 명도/채도 = 160색 + 흑백 12단계 + HEX 직접 입력.
//   클릭 시 onPick(color) 호출 → 즉시 적용 + 팝업 닫힘.
//   data-inline-toolbar 내부에 렌더되므로 외부 mousedown 핸들러에 안 걸림.
function ColorPalettePopup({ onPick, onClose }) {
  // 🆕 무지개 hue 20개 (18° 간격) — 더 부드러운 색상 변화
  const HUES = [0, 18, 30, 45, 60, 75, 90, 110, 130, 150, 170, 190, 210, 230, 250, 270, 290, 310, 330, 345];
  // 🆕 채도/명도 단계 8개 — 파스텔부터 매우 진함까지
  const SHADES = [
    { s: 40, l: 92 },  // 매우 옅은 파스텔
    { s: 55, l: 82 },  // 파스텔
    { s: 70, l: 72 },  // 밝음
    { s: 85, l: 60 },  // 약간 밝음
    { s: 95, l: 50 },  // 표준
    { s: 95, l: 40 },  // 진함
    { s: 100, l: 30 }, // 매우 진함
    { s: 100, l: 20 }, // 가장 진함
  ];
  // 🆕 흑백 12단계 — 흰색 → 검정 그라데이션
  const GRAYS = [
    '#ffffff', '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280',
    '#4b5563', '#374151', '#1f2937', '#111827', '#030712', '#000000',
  ];

  const hslToHex = (h, s, l) => {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };

  // 🆕 HEX 입력 처리
  const [hexInput, setHexInput] = useState('');
  const handleHexSubmit = () => {
    let v = hexInput.trim();
    if (!v) return;
    if (!v.startsWith('#')) v = '#' + v;
    // #RGB 또는 #RRGGBB 형식 검증
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
      onPick(v);
    }
  };

  return (
    <div
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#0f172a',
        border: '1px solid #f59e0b',
        borderRadius: 6,
        padding: 8,
        boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        zIndex: 100003,
      }}
    >
      {/* 🆕 무지개 그리드 — 20 hue × 8 단계 = 160색 */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${HUES.length}, 14px)`, gap: 2 }}>
        {SHADES.map((shade, rowIdx) =>
          HUES.map((h) => {
            const hex = hslToHex(h, shade.s, shade.l);
            return (
              <button
                key={`${rowIdx}-${h}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick(hex);
                }}
                title={hex}
                style={{
                  width: 14, height: 14,
                  background: hex,
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 2,
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            );
          })
        )}
      </div>

      {/* 🆕 흑백 12단계 */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRAYS.length}, 14px)`, gap: 2, marginTop: 5 }}>
        {GRAYS.map((g) => (
          <button
            key={g}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPick(g);
            }}
            title={g}
            style={{
              width: 14, height: 14,
              background: g,
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 2,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>

      {/* 🆕 HEX 직접 입력 + 닫기 */}
      <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700 }}>HEX</span>
        <input
          type="text"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleHexSubmit();
            }
            e.stopPropagation();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="#ff6b6b"
          style={{
            flex: 1,
            background: '#1e293b',
            color: '#fff',
            border: '1px solid #334155',
            borderRadius: 3,
            padding: '2px 5px',
            fontSize: 10,
            width: 80,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleHexSubmit(); }}
          title="HEX 적용"
          style={{
            background: '#f59e0b',
            color: '#0f172a',
            border: 'none',
            borderRadius: 3,
            padding: '2px 6px',
            fontSize: 10,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          ✓
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
          title="닫기"
          style={{
            background: '#334155',
            color: '#fff',
            border: '1px solid #475569',
            borderRadius: 3,
            padding: '2px 6px',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
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
