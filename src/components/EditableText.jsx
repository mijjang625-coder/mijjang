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
const SNAP_THRESHOLD = 8; // px — 부모 좌/우/가운데 스냅 거리
const MIN_TEXTBOX_W = 40; // px — 글박스 최소 폭
const MIN_TEXTBOX_H = 20; // px — 글박스 최소 높이

// 🆕 (2026-05-03) 글박스 리사이즈 핸들 8개 (코너 4 + 변 4)
const RESIZE_HANDLES = [
  { id: 'nw', cursor: 'nwse-resize', style: { left: -6, top: -6 } },
  { id: 'n',  cursor: 'ns-resize',   style: { left: '50%', top: -6, transform: 'translateX(-50%)' } },
  { id: 'ne', cursor: 'nesw-resize', style: { right: -6, top: -6 } },
  { id: 'w',  cursor: 'ew-resize',   style: { left: -6, top: '50%', transform: 'translateY(-50%)' } },
  { id: 'e',  cursor: 'ew-resize',   style: { right: -6, top: '50%', transform: 'translateY(-50%)' } },
  { id: 'sw', cursor: 'nesw-resize', style: { left: -6, bottom: -6 } },
  { id: 's',  cursor: 'ns-resize',   style: { left: '50%', bottom: -6, transform: 'translateX(-50%)' } },
  { id: 'se', cursor: 'nwse-resize', style: { right: -6, bottom: -6 } },
];

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

  // 드래그 상태
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, baseX: 0, baseY: 0, active: false, started: false });

  // 🆕 (2026-05-03) 리사이즈 상태
  const [resizing, setResizing] = useState(null);
  const [snapLine, setSnapLine] = useState(null); // 'left' | 'right' | 'center' | null
  const wrapperRef = useRef(null);

  // 현재 적용할 값 (override가 있으면 우선)
  const mergedHtml = resolveInitialHtml(override, children);
  const mergedText = override?.text !== undefined ? override.text : (typeof children === 'string' ? children : '');
  const mergedStyle = { ...defaultStyle, ...(override?.style || {}) };
  const offset = override?.offset || { x: 0, y: 0 };
  // 🆕 글박스 frame (override.frame 이 있으면 명시적 width/height/x/y 적용)
  const frame = override?.frame || null;
  // 🆕 글박스 z-index (override.zIndex, 기본은 모든 이미지/도형보다 위 = 10000)
  const textZIndex = override?.zIndex ?? 10000;

  // 🆕 (2026-05-03) editMode 진입 시 frame 이 없으면 자동으로 현재 렌더 크기를 frame 으로 저장
  //   → 사용자가 별도 버튼을 누르지 않아도 즉시 8개 핸들로 박스 크기 조정 가능
  //   → "표면상 보이는 것 없이" 자연스럽게 동작
  //   → originalW/H 도 함께 저장 → placeholder 가 원래 공간을 차지하므로 사진/다른 요소가 밀리지 않음
  const autoFrameDoneRef = useRef(false);
  useEffect(() => {
    if (!editMode) { autoFrameDoneRef.current = false; return; }
    if (frame) { autoFrameDoneRef.current = true; return; }
    if (autoFrameDoneRef.current) return;
    if (!ref.current) return;
    // 다음 페인트 후 측정 (레이아웃 안정 후)
    const raf = requestAnimationFrame(() => {
      if (!ref.current || frame) return;
      const r = ref.current.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        autoFrameDoneRef.current = true;
        onChange({
          frame: {
            width: Math.round(r.width),
            height: Math.round(r.height),
            x: 0,
            y: 0,
            // 🆕 placeholder 용 원래 크기 — 이후 frame 변경되어도 공간은 유지
            originalW: Math.round(r.width),
            originalH: Math.round(r.height),
          },
        });
      }
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, frame]);

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

  // ─────────── 🆕 (2026-05-03) 리사이즈 ───────────
  // 글박스의 width/height/x/y 만 변경 — 폰트 크기는 변경하지 않음
  // 폭이 줄어들면 자동 줄바꿈, 높이 넘치면 잘림 (overflow:hidden)
  const handleResizeStart = (e, handleId) => {
    if (!wrapperRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = wrapperRef.current.getBoundingClientRect();
    setResizing({
      handle: handleId,
      startX: e.clientX,
      startY: e.clientY,
      startW: frame?.width ?? rect.width,
      startH: frame?.height ?? rect.height,
      startFx: frame?.x ?? 0,
      startFy: frame?.y ?? 0,
    });
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      let { startW, startH, startFx, startFy } = resizing;
      let w = startW, h = startH, fx = startFx, fy = startFy;
      const handle = resizing.handle;

      if (handle.includes('e')) w = startW + dx;
      if (handle.includes('w')) { w = startW - dx; fx = startFx + dx; }
      if (handle.includes('s')) h = startH + dy;
      if (handle.includes('n')) { h = startH - dy; fy = startFy + dy; }

      w = Math.max(MIN_TEXTBOX_W, w);
      h = Math.max(MIN_TEXTBOX_H, h);

      // 🆕 부모 좌/우/가운데 스냅 (사진과 동일)
      let snapV = null;
      try {
        const parent = wrapperRef.current?.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          const wrapperRect = wrapperRef.current.getBoundingClientRect();
          const offsetLeftInParent = wrapperRect.left - parentRect.left - (frame?.x ?? 0);
          // 좌측 0
          if (Math.abs(fx) < SNAP_THRESHOLD) { fx = 0; snapV = 'left'; }
          // 우측 정렬 — 부모 폭 - 박스 폭
          const rightTarget = parentRect.width - offsetLeftInParent - w;
          if (Math.abs(fx - rightTarget) < SNAP_THRESHOLD) {
            if (handle.includes('w')) fx = rightTarget;
            else w = parentRect.width - offsetLeftInParent - fx;
            snapV = 'right';
          }
          // 가운데 정렬
          const centerTarget = (parentRect.width - offsetLeftInParent * 2 - w) / 2;
          if (Math.abs(fx - centerTarget) < SNAP_THRESHOLD) {
            fx = centerTarget;
            snapV = 'center';
          }
        }
      } catch {}
      setSnapLine(snapV);

      onChange({
        frame: {
          width: Math.round(w),
          height: Math.round(h),
          x: Math.round(fx),
          y: Math.round(fy),
        },
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
  }, [resizing]);

  // 🆕 편집 중 contentEditable 영역에 초기 HTML 주입
  //    React는 contentEditable 요소의 자식을 직접 제어하면 안 되므로
  //    isEditing 시작 시점에 한 번만 innerHTML을 설정하고, 이후엔 사용자 입력에 맡김
  useEffect(() => {
    if (isEditing && ref.current) {
      ref.current.innerHTML = mergedHtml || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // 🆕 (2026-05-03) frame(width/height/x/y) 가 있으면 박스 크기/위치를 명시
  // 폰트 크기는 mergedStyle.fontSize 그대로 → 박스 크기 변경이 글씨 크기에 영향 없음
  // overflow:hidden + wordBreak:break-word → 폭 줄어들면 자동 줄바꿈, 높이 넘치면 잘림
  const frameStyle = frame ? {
    width: frame.width,
    height: frame.height,
    transform: `translate(${(offset.x || 0) + (frame.x || 0)}px, ${(offset.y || 0) + (frame.y || 0)}px)`,
    overflow: 'hidden',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  } : {
    transform: `translate(${offset.x}px, ${offset.y}px)`,
  };

  // ✅ 모든 Hook 호출 뒤에서 early return — Hook 규칙 준수
  if (!editMode) {
    // 🆕 일반 표시 모드 — 부분 서식 보존 위해 dangerouslySetInnerHTML 사용
    const displayHtml = mergedHtml && mergedHtml.trim() ? mergedHtml : escapeHtml(placeholder || '');
    return (
      <Tag
        className={className}
        style={{
          ...mergedStyle,
          ...style,
          // 🆕 줄바꿈(\n) 유지 — 사용자가 편집 시 입력한 엔터를 PNG/화면에서 그대로 표시
          whiteSpace: mergedStyle.whiteSpace || 'pre-wrap',
          // 🆕 frame 이 있으면 width/height/transform 적용
          ...frameStyle,
          // 🆕 z-index — 글박스는 모든 이미지/도형보다 위 (기본 10000)
          position: frame ? 'relative' : (mergedStyle.position || undefined),
          zIndex: textZIndex,
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
  const applyInline = (action) => {
    if (!ref.current) return;
    // 포커스 유지 + 선택 영역 보존
    ref.current.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    // execCommand는 deprecated이지만 contentEditable 환경에서는 여전히 가장 호환성 좋은 방법
    try {
      if (action.type === 'bold') {
        document.execCommand('bold', false, null);
      } else if (action.type === 'color') {
        document.execCommand('foreColor', false, action.value);
      } else if (action.type === 'fontSize') {
        // execCommand('fontSize')는 1~7 사이즈만 받음 → 직접 span으로 감싸기
        applySpanStyle(sel, { fontSize: action.value + 'px' });
      } else if (action.type === 'fontSizeDelta') {
        // 선택 부분의 현재 fontSize를 읽어 +/- 적용
        const currentSize = readSelectionFontSize(sel) || (parseInt(mergedStyle.fontSize, 10) || 16);
        const next = Math.max(8, currentSize + action.delta);
        applySpanStyle(sel, { fontSize: next + 'px' });
      } else if (action.type === 'reset') {
        // 선택 부분의 인라인 서식 제거
        document.execCommand('removeFormat', false, null);
      }
    } catch (err) {
      // execCommand 실패 시 무시
    }

    // 변경 즉시 저장
    if (ref.current) {
      const newHtml = ref.current.innerHTML;
      const newText = ref.current.innerText;
      onChange({ html: newHtml, text: newText });
    }
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

  // 🆕 (2026-05-03) 편집 모드 렌더링 — placeholder 방식
  // - frame 이 있으면 외부 placeholder span(원래 크기 차지) + 내부 absolute span(실제 글박스)
  //   → 글박스 크기 조정해도 사진/다른 요소가 밀리지 않음 (원래 자리 그대로 유지)
  // - frame 이 없으면 기존 동작 유지 (Tag 자체에 transform offset 적용)
  // - 활성(showToolbar/isEditing/hovering) 시 8개 리사이즈 핸들 + 크기 라벨 표시
  const showHandles = !!frame && (showToolbar || isEditing || hovering);
  // placeholder 크기 — originalW/H 가 있으면 그 값, 없으면 frame.width/height (하위 호환)
  const placeholderW = frame?.originalW ?? frame?.width;
  const placeholderH = frame?.originalH ?? frame?.height;
  const wrapperBaseStyle = frame
    ? {
        // placeholder — 원래 글박스가 차지하던 공간을 유지 (다른 요소 밀림 방지)
        position: 'relative',
        display: 'inline-block',
        width: placeholderW,
        height: placeholderH,
        verticalAlign: 'top',
        // placeholder 자체엔 transform/zIndex 없음 — 내부 absolute 박스만 떠다님
      }
    : {
        position: 'relative',
        display: 'inline-block',
        zIndex: textZIndex,
        verticalAlign: 'top',
      };
  // 실제 글박스 (absolute로 띄움) — frame.x/y/width/height 자유 조정
  const floatBoxStyle = frame
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: frame.width,
        height: frame.height,
        transform: `translate(${(offset.x || 0) + (frame.x || 0)}px, ${(offset.y || 0) + (frame.y || 0)}px)`,
        zIndex: textZIndex,
      }
    : null;

  const innerTextStyle = frame
    ? {
        ...mergedStyle,
        ...style,
        whiteSpace: mergedStyle.whiteSpace || 'pre-wrap',
        // 🆕 박스 안에 정확히 맞춤 — 폭 자동 줄바꿈, 높이 넘치면 잘림
        width: '100%',
        height: '100%',
        margin: 0,
        outline: outlineStyle,
        outlineOffset: 0,
        cursor: isEditing ? 'text' : 'pointer',
        userSelect: isEditing ? 'text' : 'none',
        backgroundColor: hovering && !isEditing ? 'rgba(96,165,250,0.08)' : undefined,
        transition: 'background-color 0.15s, outline-color 0.15s',
        overflow: 'hidden',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
        boxSizing: 'border-box',
      }
    : {
        ...mergedStyle,
        ...style,
        whiteSpace: mergedStyle.whiteSpace || 'pre-wrap',
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        outline: outlineStyle,
        outlineOffset: 2,
        cursor: isEditing ? 'text' : 'pointer',
        position: 'relative',
        userSelect: isEditing ? 'text' : 'none',
        backgroundColor: hovering && !isEditing ? 'rgba(96,165,250,0.08)' : undefined,
        transition: 'background-color 0.15s, outline-color 0.15s',
      };

  const onKeyDownHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      ref.current?.blur();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode('\n');
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  // frame 이 없을 때는 기존 구조 유지 (단일 Tag)
  if (!frame) {
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
          onKeyDown={onKeyDownHandler}
          title={isEditing ? '편집 중 (Enter: 줄바꿈, ESC: 종료, 드래그 선택: 부분 서식)' : '더블클릭: 글자 수정 · 클릭: 툴바 · 드래그: 이동'}
          style={{ ...innerTextStyle, zIndex: textZIndex }}
          {...editableProps}
        />
        {/* 🆕 (2026-05-03) "📐 박스 크기 조정" 버튼 제거 — editMode 진입 시 frame 이 자동 생성되므로
            사용자에게 별도 UI 노출 없이 바로 8개 핸들로 박스 크기 조정 가능 */}
        {showToolbar && (
          <MiniToolbar
            pos={toolbarPos}
            currentStyle={mergedStyle}
            onApply={applyStyle}
            onReset={resetStyle}
            onClose={() => setShowToolbar(false)}
          />
        )}
        {isEditing && inlineToolbar.show && (
          <InlineToolbar pos={inlineToolbar} onApply={applyInline} />
        )}
      </>
    );
  }

  // frame 이 있을 때 — placeholder span(원래 자리 유지) + 내부 absolute float 박스(자유 크기/위치)
  return (
    <>
      <span
        data-edit-ui="text-placeholder"
        className={className}
        style={wrapperBaseStyle}
      >
        {/* 실제 글박스 — placeholder 안에서 absolute 로 떠다님 */}
        <span
          ref={wrapperRef}
          data-editable="true"
          style={floatBoxStyle}
        >
          <Tag
            ref={ref}
            data-editable="true"
            contentEditable={isEditing}
            suppressContentEditableWarning
            onDoubleClick={startEditing}
            onClick={handleClick}
            onBlur={finishEditing}
            onMouseDown={handleMouseDown}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onKeyDown={onKeyDownHandler}
            title={isEditing ? '편집 중 (Enter: 줄바꿈, ESC: 종료)' : '더블클릭: 글자 수정 · 클릭: 툴바 · 드래그: 이동 · 핸들 드래그: 박스 크기'}
            style={innerTextStyle}
            {...editableProps}
          />

          {/* 🆕 8개 리사이즈 핸들 */}
          {showHandles && RESIZE_HANDLES.map((hd) => (
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

          {/* 🆕 크기 라벨 */}
          {showHandles && (
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
              {Math.round(frame.width)} × {Math.round(frame.height)}
            </div>
          )}

          {/* 🆕 스냅 가이드 라인 */}
          {snapLine && (
            <div
              data-edit-ui="snap-line"
              style={{
                position: 'absolute',
                left: snapLine === 'left' ? 0 : (snapLine === 'right' ? '100%' : '50%'),
                top: -8, bottom: -8, width: 2,
                backgroundColor: '#f59e0b',
                transform: snapLine === 'center' ? 'translateX(-50%)' : (snapLine === 'right' ? 'translateX(-100%)' : 'none'),
                pointerEvents: 'none', zIndex: 100000,
              }}
            />
          )}
        </span>
      </span>

      {showToolbar && (
        <MiniToolbar
          pos={toolbarPos}
          currentStyle={mergedStyle}
          onApply={applyStyle}
          onReset={resetStyle}
          onClose={() => setShowToolbar(false)}
          onResetFrame={() => onChange({ frame: null })}
        />
      )}

      {isEditing && inlineToolbar.show && (
        <InlineToolbar pos={inlineToolbar} onApply={applyInline} />
      )}
    </>
  );
}

// 🆕 frame 이 없는 글박스에 hover 시 우측 상단에 표시되는 "📐 박스 활성화" 버튼
// 클릭하면 현재 렌더된 크기를 frame 으로 저장 → 리사이즈 핸들 사용 가능
function ActivateFrameButton({ anchorRef, onClick }) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ top: r.top + 4, left: r.right - 100 });
  }, [anchorRef]);
  if (!pos) return null;
  return (
    <button
      data-edit-ui="activate-frame"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      style={{
        position: 'fixed',
        top: pos.top, left: pos.left,
        backgroundColor: '#1e293b',
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        padding: '4px 8px',
        fontSize: 10,
        fontWeight: 700,
        cursor: 'pointer',
        zIndex: 100001,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      }}
      title="이 글박스의 크기를 조정 가능하게 활성화"
    >
      📐 박스 크기 조정
    </button>
  );
}

// 🆕 선택 영역을 <span style="..."> 으로 감싸기
function applySpanStyle(sel, styleObj) {
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;
  const span = document.createElement('span');
  Object.entries(styleObj).forEach(([k, v]) => { span.style[k] = v; });
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
    // 복잡한 DOM 구조에서 실패 가능 — 무시
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
function MiniToolbar({ pos, currentStyle, onApply, onReset, onClose, onResetFrame }) {
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

      {/* 🆕 박스 크기 초기화 (frame 이 있을 때만) */}
      {onResetFrame && (
        <button
          style={{ ...toolbarBtnStyle, backgroundColor: '#0f766e', fontSize: 11 }}
          onClick={onResetFrame}
          title="박스 크기 초기화 (자동 크기로)"
        >
          📐↺
        </button>
      )}

      {/* 닫기 */}
      <button style={toolbarBtnStyle} onClick={onClose} title="툴바 닫기">
        ✕
      </button>
    </div>
  );
}

// 🆕 인라인 툴바 — 선택한 부분만 서식 적용
function InlineToolbar({ pos, onApply }) {
  return (
    <div
      data-inline-toolbar
      // mousedown 시 selection 유지를 위해 preventDefault
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

      {/* 색상 */}
      <label
        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0 2px' }}
        title="선택 부분 글자 색"
        onMouseDown={(e) => e.preventDefault()}
      >
        <span style={{ fontSize: 11, marginRight: 2 }}>🎨</span>
        <input
          type="color"
          onChange={(e) => onApply({ type: 'color', value: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            width: 22,
            height: 22,
            border: 'none',
            padding: 0,
            background: 'transparent',
            cursor: 'pointer',
          }}
        />
      </label>

      {/* 빠른 색상 — 빨강 */}
      <button
        style={{ ...inlineBtnStyle, backgroundColor: '#dc2626' }}
        onMouseDown={(e) => { e.preventDefault(); onApply({ type: 'color', value: '#dc2626' }); }}
        title="빨간색"
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
