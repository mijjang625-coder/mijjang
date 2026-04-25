// src/hooks/useUndoableHistory.js
// 여러 상태를 묶어서 한 번에 undo/redo 하는 히스토리 훅
//
// 사용 예시:
//   const history = useUndoableHistory({
//     pages: {},
//     textOverrides: {},
//     imageOverrides: {},
//     freeImages: {},
//     shapes: {},
//     layerNames: {},
//   });
//
//   history.snapshot('텍스트 수정');           // 현재 상태를 히스토리에 푸시
//   history.undo();                            // 한 단계 뒤로
//   history.redo();                            // 한 단계 앞으로
//   history.canUndo                            // boolean
//   history.canRedo                            // boolean
//   history.lastLabel                          // 마지막 변경 라벨
//
// 중요: snapshot은 "변경 후"가 아니라 "변경 직전"에 호출해야
//       Ctrl+Z 가 자연스럽게 직전 상태로 돌아감

import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_HISTORY = 50; // 최대 50단계 보관 (메모리 절약)

// 깊은 복사 (구조적 복제) — JSON.stringify 보다 안전 & 빠름 (modern browsers)
function deepClone(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(obj); } catch { /* fallthrough */ }
  }
  return JSON.parse(JSON.stringify(obj));
}

export function useUndoableHistory(initialState) {
  // setter 매핑 (setState 함수들을 외부에서 등록)
  const settersRef = useRef({});

  // history 배열: [{ state, label, timestamp }]
  const historyRef = useRef([{ state: deepClone(initialState), label: '초기 상태', timestamp: Date.now() }]);
  // 현재 포인터 위치 (0 = 가장 처음)
  const pointerRef = useRef(0);

  // UI 갱신용 트리거
  const [version, setVersion] = useState(0);
  const tick = useCallback(() => setVersion((v) => v + 1), []);

  // setter 등록 — App.jsx 에서 useEffect 안에서 호출
  const registerSetters = useCallback((setters) => {
    settersRef.current = setters;
  }, []);

  // 현재 상태를 history에 푸시
  // currentState: 현재 모든 상태의 스냅샷 객체
  // label: 어떤 동작인지 ('텍스트 수정', '이미지 이동', 'P1 생성' 등)
  const snapshot = useCallback((currentState, label = '편집') => {
    const history = historyRef.current;
    const ptr = pointerRef.current;

    // 포인터가 중간에 있으면 그 뒤를 잘라냄 (분기 무시)
    if (ptr < history.length - 1) {
      historyRef.current = history.slice(0, ptr + 1);
    }

    historyRef.current.push({
      state: deepClone(currentState),
      label,
      timestamp: Date.now(),
    });

    // 최대 길이 제한
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current = historyRef.current.slice(-MAX_HISTORY);
    }

    pointerRef.current = historyRef.current.length - 1;
    tick();
  }, [tick]);

  // 한 단계 뒤로
  const undo = useCallback(() => {
    if (pointerRef.current <= 0) return false;
    pointerRef.current -= 1;
    const target = historyRef.current[pointerRef.current];
    applyState(target.state);
    tick();
    return true;
  }, [tick]);

  // 한 단계 앞으로
  const redo = useCallback(() => {
    if (pointerRef.current >= historyRef.current.length - 1) return false;
    pointerRef.current += 1;
    const target = historyRef.current[pointerRef.current];
    applyState(target.state);
    tick();
    return true;
  }, [tick]);

  // 등록된 setter들로 상태 복원
  function applyState(state) {
    const setters = settersRef.current;
    Object.keys(state).forEach((key) => {
      const setter = setters[key];
      if (typeof setter === 'function') {
        setter(deepClone(state[key]));
      }
    });
  }

  // 히스토리 초기화 (편집 초기화 또는 프로젝트 로드 시)
  const reset = useCallback((newInitial) => {
    historyRef.current = [{ state: deepClone(newInitial), label: '초기 상태', timestamp: Date.now() }];
    pointerRef.current = 0;
    tick();
  }, [tick]);

  const canUndo = pointerRef.current > 0;
  const canRedo = pointerRef.current < historyRef.current.length - 1;
  const lastLabel = canUndo ? historyRef.current[pointerRef.current].label : null;
  const nextLabel = canRedo ? historyRef.current[pointerRef.current + 1].label : null;

  return {
    snapshot,
    undo,
    redo,
    reset,
    registerSetters,
    canUndo,
    canRedo,
    lastLabel,
    nextLabel,
    historyLength: historyRef.current.length,
    pointer: pointerRef.current,
  };
}

// 키보드 단축키 헬퍼 — App.jsx에서 useEffect 안에서 호출
export function useUndoRedoKeyboard(undo, redo) {
  useEffect(() => {
    const handler = (e) => {
      // 입력 중에는 브라우저 기본 동작 우선 (textarea, input, contentEditable)
      const tag = e.target?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        e.target?.isContentEditable;
      if (isEditable) return;

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrl = isMac ? e.metaKey : e.ctrlKey;
      if (!ctrl) return;

      // Ctrl+Z (Shift 없으면 undo)
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      // Ctrl+Y (redo)
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);
}
