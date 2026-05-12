/**
 * editorSelection.js
 *
 * 편집기에서 한 번에 하나의 요소(이미지/텍스트/도형)만 옵션바(툴바·조정 패널 등)를
 * 띄우도록 통합 관리하는 아주 작은 글로벌 이벤트 버스.
 *
 * 동작 원리:
 *   - 어떤 컴포넌트가 자기 자신을 "활성화" 할 때 announceEditorSelection(myId) 호출
 *   - 모든 컴포넌트는 useEditorSelectionListener(myId, onOther) 로 구독
 *   - "내가 아닌 다른 id"가 활성화 됐다는 신호가 오면 onOther() 콜백이 실행됨
 *     → 거기서 자기 옵션바/패널/편집상태를 닫으면 됨
 *
 * 같은 id 로 여러 번 announce 해도 자기 자신은 닫히지 않으므로,
 * 컴포넌트 내부 상태(예: showToolbar)에는 영향이 없음.
 */

import { useEffect } from 'react';

const EVENT_NAME = 'editor:select';

/**
 * 전역으로 "이 id 가 활성화 됐다" 라고 알림.
 * 다른 모든 편집 컴포넌트는 이 신호를 받아 자기 옵션바를 닫는다.
 *
 * @param {string} id - 활성화된 요소의 고유 식별자 (예: 'text:p1.title', 'free-image:abc')
 */
export function announceEditorSelection(id) {
  if (typeof window === 'undefined') return;
  if (!id) return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { id } }));
  } catch {
    // 구버전 환경 fallback (CustomEvent 미지원 시 무시)
  }
}

/**
 * 다른 요소가 활성화 됐을 때 콜백 실행.
 * 자기 자신이 발행한 신호는 무시한다.
 *
 * @param {string} myId - 이 컴포넌트의 고유 식별자
 * @param {() => void} onOther - 다른 요소가 활성화 됐을 때 호출됨 (자기 툴바 닫기용)
 */
export function useEditorSelectionListener(myId, onOther) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e) => {
      const otherId = e?.detail?.id;
      if (!otherId) return;
      if (otherId === myId) return;
      try { onOther && onOther(); } catch { /* noop */ }
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [myId, onOther]);
}
