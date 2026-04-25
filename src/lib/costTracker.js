/**
 * costTracker.js — OpenAI 비용 추적 유틸리티
 *
 * 토큰 사용량을 원화 비용으로 변환하고, localStorage에 누적 기록.
 *
 * 가격 정책 (2024.10 기준, USD/1M tokens):
 *   gpt-4o-mini    : input $0.15 / output $0.60
 *   gpt-4o         : input $2.50 / output $10.00
 *   gpt-4.1-mini   : input $0.40 / output $1.60
 *   gpt-4.1        : input $2.00 / output $8.00
 *
 * 환율은 1 USD = 1,400 KRW (보수적으로 반올림)
 */

const USD_TO_KRW = 1400;

const MODEL_PRICING = {
  'gpt-4o-mini':  { input: 0.15,  output: 0.60 },
  'gpt-4o':       { input: 2.50,  output: 10.00 },
  'gpt-4.1-mini': { input: 0.40,  output: 1.60 },
  'gpt-4.1':      { input: 2.00,  output: 8.00 },
};

/**
 * 토큰 → 원화 비용 계산
 * @param {string} model 모델 이름
 * @param {number} inputTokens 입력 토큰 수
 * @param {number} outputTokens 출력 토큰 수
 * @returns {{usd: number, krw: number, model: string}}
 */
export function calculateCost(model, inputTokens = 0, outputTokens = 0) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
  const usd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  const krw = Math.round(usd * USD_TO_KRW);
  return { usd, krw, model, inputTokens, outputTokens };
}

/**
 * OpenAI 응답의 usage 객체 → 비용 객체
 * @param {string} model
 * @param {{prompt_tokens: number, completion_tokens: number, total_tokens: number}} usage
 */
export function costFromUsage(model, usage) {
  if (!usage) return null;
  return calculateCost(
    model,
    usage.prompt_tokens || 0,
    usage.completion_tokens || 0,
  );
}

// ───────────────────── localStorage 영속화 ─────────────────────

const STORAGE_KEY = 'coupang_cost_history';

/**
 * 비용 기록 추가
 * @param {Object} entry
 * @param {string} entry.label 예: 'P1 생성', 'P3 수정', '리뷰 분석'
 * @param {string} entry.model
 * @param {number} entry.inputTokens
 * @param {number} entry.outputTokens
 * @param {number} entry.krw
 */
export function recordCost(entry) {
  try {
    const list = getCostHistory();
    const newEntry = {
      ...entry,
      at: Date.now(),
    };
    list.push(newEntry);
    // 최대 200개만 유지 (오래된 것 제거)
    const trimmed = list.length > 200 ? list.slice(-200) : list;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return newEntry;
  } catch (e) {
    console.warn('[costTracker] recordCost 실패', e);
    return null;
  }
}

export function getCostHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * 누적 비용 합계
 * @param {Object} opts
 * @param {number} [opts.sinceMs] 특정 시각 이후만 (밀리초 timestamp)
 * @returns {{totalKrw: number, count: number, byLabel: Record<string, number>}}
 */
export function getCostSummary(opts = {}) {
  const list = getCostHistory();
  const filtered = opts.sinceMs ? list.filter((e) => e.at >= opts.sinceMs) : list;
  let totalKrw = 0;
  const byLabel = {};
  filtered.forEach((e) => {
    totalKrw += e.krw || 0;
    const k = e.label || '기타';
    byLabel[k] = (byLabel[k] || 0) + (e.krw || 0);
  });
  return { totalKrw, count: filtered.length, byLabel };
}

/** 비용 기록 전체 삭제 */
export function clearCostHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * 세션 시작 시각 (앱 진입 시각) 저장 — "이번 세션" 합계용
 */
const SESSION_KEY = 'coupang_cost_session_start';
export function getSessionStart() {
  try {
    let v = localStorage.getItem(SESSION_KEY);
    if (!v) {
      v = String(Date.now());
      localStorage.setItem(SESSION_KEY, v);
    }
    return Number(v);
  } catch {
    return Date.now();
  }
}

/** 새 세션 시작 (수동 리셋) */
export function resetSession() {
  try {
    localStorage.setItem(SESSION_KEY, String(Date.now()));
  } catch {}
}

/**
 * 원화 포맷 (1234 → "1,234원")
 */
export function formatKRW(krw) {
  if (typeof krw !== 'number' || isNaN(krw)) return '0원';
  return `${krw.toLocaleString('ko-KR')}원`;
}
