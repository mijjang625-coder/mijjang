import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FONT_PRESETS } from '../lib/theme.js';
import { announceEditorSelection, useEditorSelectionListener } from '../lib/editorSelection.js';

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

// 셀 전체 스타일(미니 툴바) 적용 시, 과거 인라인 서식(span style)이
// fontSize/textAlign 등을 덮어써서 변화가 안 보이는 문제 방지용 정리 함수
function stripInlineStylePropsFromHtml(html, styleKeys = []) {
  if (!html || !styleKeys.length) return html;
  if (typeof document === 'undefined') return html;

  const cssKeys = styleKeys.map((k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
  const root = document.createElement('div');
  root.innerHTML = html;

  root.querySelectorAll('[style]').forEach((el) => {
    cssKeys.forEach((cssKey) => el.style.removeProperty(cssKey));
    const rest = (el.getAttribute('style') || '').trim();
    if (!rest) el.removeAttribute('style');
  });

  return root.innerHTML;
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
  const isRegistered = !!override?.registered;

  // 줄바꿈이 있는 텍스트는 행간을 일정 범위로 정규화해
  // 섹션/컴포넌트별 기본값 차이로 "너무 좁거나 너무 넓어" 보이는 현상을 완화
  const hasLineBreak = /\n|<br\s*\/?>|<\/p>|<\/div>|<\/li>/i.test(mergedHtml || '') || String(mergedText || '').includes('\n');
  const resolvedLineHeight = (() => {
    const raw = mergedStyle?.lineHeight;
    const parsed = typeof raw === 'number' ? raw : parseFloat(raw);

    if (!hasLineBreak) return raw;
    if (!Number.isFinite(parsed)) return 1.45;

    const hasExplicitUserLineHeight = !!(override?.style && Object.prototype.hasOwnProperty.call(override.style, 'lineHeight'));
    if (hasExplicitUserLineHeight) {
      // 사용자가 직접 조절한 값은 폭넓게 허용 (세부옵션바 LH-/LH+)
      return Math.min(2.2, Math.max(1, parsed));
    }

    // 기본 자동 정규화는 과도한 들쭉날쭉만 완화
    return Math.min(1.55, Math.max(1.4, parsed));
  })();
  const normalizedStyle = resolvedLineHeight !== undefined
    ? { ...mergedStyle, lineHeight: resolvedLineHeight }
    : mergedStyle;

  // ⚠️ Hook 규칙 — useEffect는 early return 보다 먼저 호출되어야 함
  //    (editMode 토글 시 Hook 개수가 바뀌면 React가 크래시함)
  //    early return은 모든 Hook 호출 뒤로 이동.

  // 편집 모드에서 레이어 패널용 텍스트 레이어를 자동 등록
  // (P2~P10에서도 P1처럼 글박스 레이어/눈 아이콘 사용 가능하게)
  useEffect(() => {
    if (!editMode) return;
    if (isRegistered) return;
    onChange({ registered: true, __registerOnly: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, isRegistered, id]);

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
    // 더블클릭 편집 시작 시 드래그 상태를 즉시 초기화해서
    // 텍스트 선택/더블클릭 진입이 드래그 로직에 막히지 않게 함
    dragStart.current.active = false;
    dragStart.current.started = false;
    // 🆕 (2026-05-08) 이미 편집 중이면 — innerHTML 재주입 / selection 강제 변경 안 함.
    //   이렇게 안 하면 "이미 서식 적용된 글씨 (span 으로 감싸진 부분)" 위에서 더블클릭할 때
    //   브라우저가 자동으로 잡아준 word selection 이 우리 setTimeout 의
    //   selectNodeContents 로 덮어써져서 선택이 풀려버림.
    if (isEditing) {
      return;
    }
    // 🆕 다른 요소 옵션바 닫기 — 자기 자신이 활성화 됐음을 broadcast
    announceEditorSelection(`text:${id}`);
    setIsEditing(true);
    setShowToolbar(true);
    updateToolbarPos();
  };

  // 편집 종료 (blur or ESC)
  const finishEditing = () => {
    setIsEditing(false);
    setInlineToolbar({ show: false, top: 0, left: 0 });
    // 편집 종료 직후 stale drag 플래그 때문에 다음 클릭이 무시되지 않도록 초기화
    dragStart.current.active = false;
    dragStart.current.started = false;
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

    // 같은 텍스트를 다시 클릭했을 때는 더블클릭 실패 상황에서도 즉시 편집 재진입
    // (특히 P1처럼 상위 레이어 포인터 제어가 있는 구간에서 재수정 신뢰성 개선)
    if (showToolbar) {
      startEditing(e);
      return;
    }

    e.stopPropagation();
    // 🆕 다른 요소 옵션바 닫기 — 자기 자신이 활성화 됐음을 broadcast
    announceEditorSelection(`text:${id}`);
    setShowToolbar(true);
    updateToolbarPos();
  };

  // 🆕 다른 요소가 활성화되면 자기 툴바를 닫음 (편집 중이면 저장 후 종료)
  const closeOnOtherSelect = useCallback(() => {
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
    setShowToolbar(false);
    setInlineToolbar({ show: false, top: 0, left: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, mergedHtml]);
  useEditorSelectionListener(`text:${id}`, closeOnOtherSelect);

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

    // 더블클릭(편집 진입)과 충돌하지 않도록 다중 클릭에서는 드래그 시작 금지
    if (e.detail >= 2) return;

    // 부분 서식(span 등)으로 감싸진 텍스트를 다시 수정할 때도
    // 클릭/더블클릭/툴바 진입이 안정적으로 동작하도록 자식 노드 클릭도 허용.
    // 실제 이동은 DRAG_THRESHOLD를 넘겼을 때만 시작되므로 단순 클릭과 충돌하지 않는다.
    if (!ref.current || !ref.current.contains(e.target)) return;

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

      // 더블클릭 진입 직후 포커스/선택이 브라우저 타이밍에 따라 풀리는 경우가 있어
      // 다음 프레임에서 강제로 전체 선택을 한 번 더 보장한다.
      requestAnimationFrame(() => {
        if (!ref.current) return;
        try {
          ref.current.focus({ preventScroll: true });
          const range = document.createRange();
          range.selectNodeContents(ref.current);
          const sel = window.getSelection();
          if (!sel) return;
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (_) {
          // noop
        }
      });
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
          ...normalizedStyle,
          ...style,
          // 🆕 줄바꿈(\n) 유지 — 사용자가 편집 시 입력한 엔터를 PNG/화면에서 그대로 표시
          whiteSpace: normalizedStyle.whiteSpace || 'pre-wrap',
          ...visStyle,
        }}
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />
    );
  }

  // 툴바에서 스타일 변경 (셀 전체 적용)
  const applyStyle = (partial) => {
    const newStyle = { ...(override?.style || {}), ...partial };

    // 미니 툴바(셀 전체 스타일)에서 조정한 속성은
    // 기존 인라인 span style의 동일 속성을 제거해 실제 화면에 즉시 반영되게 함.
    const styleKeys = Object.keys(partial || {}).filter((k) => (
      ['fontSize', 'fontWeight', 'color', 'fontFamily', 'textAlign', 'lineHeight', 'letterSpacing'].includes(k)
    ));
    const cleanedHtml = stripInlineStylePropsFromHtml(mergedHtml, styleKeys);

    if (cleanedHtml !== mergedHtml) {
      onChange({
        style: newStyle,
        html: cleanedHtml,
        text: ref.current?.innerText ?? mergedText,
      });
      return;
    }

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
    let baseLineHeightPatch;
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
        applySpanStyle(sel, { fontWeight: '900' }, ['fontWeight']);
      } else if (action.type === 'color') {
        // 🆕 색상도 직접 span 으로 — execCommand('foreColor') 미사용
        // 같은 선택 영역 안에 과거 span color 가 남아 있으면 새 색이 균일하게 안 보일 수 있어
        // 하위 color 인라인 스타일을 정리한 뒤 적용한다.
        applySpanStyle(sel, { color: action.value }, ['color']);
      } else if (action.type === 'fontSize') {
        applySpanStyle(sel, { fontSize: action.value + 'px' }, ['fontSize']);
      } else if (action.type === 'fontSizeDelta') {
        const currentSize = readSelectionFontSize(sel) || (parseInt(mergedStyle.fontSize, 10) || 16);
        const next = Math.max(8, currentSize + action.delta);
        applySpanStyle(sel, { fontSize: next + 'px' }, ['fontSize']);
      } else if (action.type === 'lineHeight') {
        const numericLineHeight = Number(action.value);
        if (Number.isFinite(numericLineHeight)) {
          const range = sel.getRangeAt(0);
          clearAncestorInlineLineHeight(range, ref.current);
          applySpanStyle(sel, { lineHeight: String(numericLineHeight) }, ['lineHeight']);

          // line box 최소 높이는 부모 line-height(strut) 영향을 받으므로,
          // 선택 영역을 줄일 때는 부모 기본 line-height도 낮춰야 실제로 줄어든다.
          const currentBaseLineHeight = Number.isFinite(Number(mergedStyle?.lineHeight))
            ? Number(mergedStyle.lineHeight)
            : 1.45;
          if (numericLineHeight < currentBaseLineHeight) {
            baseLineHeightPatch = numericLineHeight;
          }
        }
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
        if (baseLineHeightPatch !== undefined) {
          onChange({
            html: newHtml,
            text: newText,
            style: { ...(override?.style || {}), lineHeight: baseLineHeightPatch },
          });
        } else {
          onChange({ html: newHtml, text: newText });
        }
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

  const renderInPortal = (node) => {
    try {
      const doc = ref.current?.ownerDocument || (typeof document !== 'undefined' ? document : null);
      const target = doc?.body;
      if (!target) return node;
      return createPortal(node, target);
    } catch (_) {
      // 포털 렌더 실패 환경(특수 iframe/preview)에서는 안전하게 일반 렌더로 폴백
      return node;
    }
  };

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
          ...normalizedStyle,
          ...style,
          // 🆕 편집 모드에서도 줄바꿈(\n) 표시 유지
          whiteSpace: normalizedStyle.whiteSpace || 'pre-wrap',
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

      {showToolbar && renderInPortal(
        <MiniToolbar
          pos={toolbarPos}
          currentStyle={normalizedStyle}
          onApply={applyStyle}
          onReset={resetStyle}
          onClose={() => setShowToolbar(false)}
        />
      )}

      {/* 🆕 인라인 툴바 — 선택 부분만 서식 변경 */}
      {isEditing && inlineToolbar.show && renderInPortal(
        <InlineToolbar
          pos={inlineToolbar}
          rootRef={ref}
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
function applySpanStyle(sel, styleObj, normalizeKeys = []) {
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

    // 같은 속성이 이미 하위 span에 남아 있으면 결과 색/크기가 들쭉날쭉해질 수 있어
    // 현재 적용하는 속성의 하위 인라인 스타일을 정리해 결과를 균일하게 맞춘다.
    if (normalizeKeys && normalizeKeys.length) {
      const cssKeys = normalizeKeys.map((k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
      span.querySelectorAll('[style]').forEach((el) => {
        cssKeys.forEach((cssKey) => el.style.removeProperty(cssKey));
        const rest = (el.getAttribute('style') || '').trim();
        if (!rest) el.removeAttribute('style');
      });
    }

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

function clearAncestorInlineLineHeight(range, rootEl) {
  if (!range || !rootEl) return;

  const clearPath = (startNode) => {
    let node = startNode?.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
    while (node && node !== rootEl) {
      if (node.style && node.style.getPropertyValue('line-height')) {
        node.style.removeProperty('line-height');
        const rest = (node.getAttribute('style') || '').trim();
        if (!rest) node.removeAttribute('style');
      }
      node = node.parentElement;
    }
  };

  clearPath(range.startContainer);
  clearPath(range.endContainer);
}

function normalizeComputedLineHeight(cs) {
  if (!cs) return null;
  const raw = cs.lineHeight;
  const parsed = parseFloat(raw);
  const fontSize = parseFloat(cs.fontSize);

  if (!Number.isFinite(parsed)) return null;

  // line-height가 px 단위면 배수값으로 환산
  if (typeof raw === 'string' && raw.trim().toLowerCase().endsWith('px') && Number.isFinite(fontSize) && fontSize > 0) {
    return Number((parsed / fontSize).toFixed(2));
  }
  return Number(parsed.toFixed(2));
}

function parseExplicitLineHeight(raw) {
  if (raw == null) return null;
  const parsed = parseFloat(String(raw).trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function findExplicitLineHeight(node, rootEl) {
  let cur = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (cur) {
    if (cur.style) {
      const explicit = parseExplicitLineHeight(cur.style.lineHeight);
      if (Number.isFinite(explicit)) return explicit;
    }
    if (rootEl && cur === rootEl) break;
    cur = cur.parentElement;
  }
  return null;
}

function readSelectionLineHeight(sel, rootEl = null) {
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (rootEl && !rootEl.contains(range.commonAncestorContainer)) return null;
  let node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  if (!node || typeof window === 'undefined') return null;

  // 1) 사용자가 저장한 명시 line-height(style="line-height:...")를 최우선으로 사용
  const explicitFromSelection = findExplicitLineHeight(node, rootEl || null);
  if (Number.isFinite(explicitFromSelection)) return explicitFromSelection;

  // 2) 루트 기본 style line-height (React inline style) 폴백
  const explicitFromRoot = rootEl ? parseExplicitLineHeight(rootEl.style?.lineHeight) : null;
  if (Number.isFinite(explicitFromRoot)) return explicitFromRoot;

  // 3) 마지막 폴백: computed 기반
  const nodeStyle = window.getComputedStyle(node);
  const selectionLineHeight = normalizeComputedLineHeight(nodeStyle);
  const rootLineHeight = rootEl ? normalizeComputedLineHeight(window.getComputedStyle(rootEl)) : null;

  const candidates = [selectionLineHeight, rootLineHeight].filter((v) => Number.isFinite(v));
  if (!candidates.length) return null;
  return Number(Math.max(...candidates).toFixed(2));
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
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onApply({ fontSize: Math.max(8, currentFontSize - 2) }); }}
        title="크기 작게"
      >
        A−
      </button>
      <span style={{ padding: '4px 2px', minWidth: 28, textAlign: 'center', fontWeight: 700 }}>
        {currentFontSize}
      </span>
      <button
        style={toolbarBtnStyle}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onApply({ fontSize: currentFontSize + 2 }); }}
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
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onApply({
            fontWeight: (currentStyle?.fontWeight || 400) >= 700 ? 500 : 800,
          });
        }}
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
      <button style={toolbarBtnStyle} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onApply({ textAlign: 'left' }); }} title="왼쪽 정렬">
        ⬅
      </button>
      <button style={toolbarBtnStyle} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onApply({ textAlign: 'center' }); }} title="가운데">
        ⬌
      </button>
      <button style={toolbarBtnStyle} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onApply({ textAlign: 'right' }); }} title="오른쪽">
        ➡
      </button>

      {/* 초기화 */}
      <button
        style={{ ...toolbarBtnStyle, backgroundColor: '#7c2d12' }}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onReset(); }}
        title="이 텍스트 스타일 초기화"
      >
        ↺
      </button>

      {/* 닫기 */}
      <button style={toolbarBtnStyle} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} title="툴바 닫기">
        ✕
      </button>
    </div>
  );
}

// 🆕 인라인 툴바 — 선택한 부분만 서식 적용
// 🆕 (2026-05-06) 컬러 피커(input[type=color]) 부활 — selection 백업/복원 방식으로 안전 처리
function InlineToolbar({ pos, rootRef, onApply }) {
  // 🆕 선택 영역 단위 행간 조절 (세부 옵션바)
  const [lineHeightValue, setLineHeightValue] = useState(() => {
    const current = readSelectionLineHeight(window.getSelection(), rootRef?.current);
    return Number.isFinite(current) ? current : 1.45;
  });

  useEffect(() => {
    const current = readSelectionLineHeight(window.getSelection(), rootRef?.current);
    if (Number.isFinite(current)) setLineHeightValue(current);
  }, [pos.top, pos.left, rootRef]);

  const adjustInlineLineHeight = (delta) => {
    const base = Number.isFinite(lineHeightValue) ? lineHeightValue : 1.45;
    const next = Math.max(1, Math.min(2.2, Number((base + delta).toFixed(2))));
    setLineHeightValue(next);
    onApply({ type: 'lineHeight', value: next });
  };

  // 🆕 (2026-05-08) native <input type=color> 포기 — CSP / preventDefault / 외부 mousedown
  //   문제로 OS 다이얼로그가 안정적으로 열리지 않음. 사용자 요청대로 커스텀 색상 그리드
  //   팝업으로 변경. 팝업이 InlineToolbar 내부 (data-inline-toolbar) 에 렌더되므로
  //   외부 mousedown 핸들러에 안 걸려서 옵션바가 꺼지지 않음.
  const [showPalette, setShowPalette] = useState(false);

  // 🆕 (2026-05-08) 색상표 열린 동안 contentEditable 의 ::selection 파란 박스를 투명하게.
  //   사용자가 색상을 고를 때 실제 적용된 색이 파란 selection 박스에 가려져 안 보이는 문제 해결.
  //   selection 자체는 살아있고 (range 유지) 단지 시각적 강조만 제거됨 → 색상 적용은 정상 동작.
  useEffect(() => {
    if (!showPalette) return;
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-palette-selection-style', 'true');
    styleEl.textContent = `
      [data-editable="true"] ::selection {
        background-color: transparent !important;
        color: inherit !important;
      }
      [data-editable="true"] ::-moz-selection {
        background-color: transparent !important;
        color: inherit !important;
      }
    `;
    document.head.appendChild(styleEl);
    return () => {
      try { document.head.removeChild(styleEl); } catch (_) { /* ignore */ }
    };
  }, [showPalette]);

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

      {/* 🆕 선택 부분 행간 */}
      <button
        style={inlineBtnStyle}
        onMouseDown={(e) => { e.preventDefault(); adjustInlineLineHeight(-0.05); }}
        title="선택 부분 행간 좁게"
      >
        LH−
      </button>
      <span style={{ minWidth: 34, textAlign: 'center', fontWeight: 800, fontSize: 11 }} title="선택 부분 현재 행간">
        {lineHeightValue.toFixed(2).replace(/\.00$/, '')}
      </span>
      <button
        style={inlineBtnStyle}
        onMouseDown={(e) => { e.preventDefault(); adjustInlineLineHeight(0.05); }}
        title="선택 부분 행간 넓게"
      >
        LH+
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
