// AI 제공자(OpenAI / Anthropic / Google) 연동 — 쿠팡 상세페이지 시스템 프롬프트 v3.2 적용
// 각 페이지(P1~P10)를 하나씩 생성하는 방식으로 동작합니다.
//
// 🆕 멀티 AI 지원: 모든 텍스트 호출은 src/lib/aiClient.js 의 callAI() 를 통과합니다.
//   - provider 파라미터로 'openai' | 'anthropic' | 'google' 선택 가능
//   - provider 미지정 시 model 이름으로 자동 추론 (구버전 호환)
//   - Vision(이미지 첨부)이 필요한 함수는 OpenAI 전용으로 유지

import { COUPANG_DETAIL_SYSTEM_PROMPT } from './systemPrompt.js';
import { buildCategoryGuideBlock } from './categoryGuides.js';
import { callAI, detectProviderFromModel } from './aiClient.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * 사용자 입력 정보를 모델이 읽기 쉬운 프롬프트로 직렬화.
 */
function parseJsonLoose(text) {
  if (typeof text !== 'string') return null;
  const candidates = [];

  // 1) 원문 그대로
  candidates.push(text.trim());

  // 2) 코드펜스 제거
  const noFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  candidates.push(noFence);

  // 3) 첫 { ~ 마지막 } 추출
  const firstBrace = noFence.indexOf('{');
  const lastBrace = noFence.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(noFence.slice(firstBrace, lastBrace + 1));
  }

  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c);
    } catch {
      // trailing comma 보정 1회 시도
      try {
        const cleaned = c.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(cleaned);
      } catch {
        // continue
      }
    }
  }

  return null;
}

function serializeUserBrief(brief, imageCount) {
  const {
    productName,
    productType,
    strengths = [],
    targetCustomers = [],
    targetCustomer, // 구버전 호환
    material,
    sizeSpec,
    reviews = [],
    photoTypes,
    differences = [],
    usages = [],
    usageSteps = [],
    faqs = [],
    hasGeneralProductPhoto,
    extraNotes,
    compliance,
  } = brief || {};

  const lines = [];
  lines.push(`[제품명] ${productName || '(미입력)'}`);
  lines.push(`[제품 유형] ${productType || '(미지정)'}`);
  lines.push(`[핵심 강점 3가지]`);
  strengths.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  const tcList = (targetCustomers && targetCustomers.length > 0)
    ? targetCustomers.filter((c) => c && c.trim())
    : (targetCustomer ? [targetCustomer] : []);
  lines.push(`[주 고객층 3가지]`);
  if (tcList.length === 0) {
    lines.push(`  (미입력)`);
  } else {
    tcList.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));
  }
  lines.push(`[소재] ${material || '(미입력)'}`);
  lines.push(`[사이즈/스펙] ${sizeSpec || '(미입력)'}`);
  lines.push(`[보유 사진 종류] ${photoTypes || '(미입력)'}`);
  lines.push(`[첨부 사진 개수] ${imageCount}장`);

  lines.push(`[리뷰 4개]`);
  reviews.forEach((r, i) => {
    lines.push(`  ${i + 1}. ${r.nickname || '(닉네임)'} / ${r.date || '(날짜)'}`);
    lines.push(`     "${r.body || ''}"`);
  });

  lines.push(`[일반 제품 대비 차별점 4가지]`);
  differences.forEach((d, i) => lines.push(`  ${i + 1}. ${d}`));

  lines.push(`[활용법 4가지]`);
  usages.forEach((u, i) => lines.push(`  ${i + 1}. ${u}`));

  lines.push(`[사용 순서 3단계]`);
  usageSteps.forEach((s, i) => lines.push(`  STEP ${i + 1}. ${s}`));

  lines.push(`[FAQ 5개]`);
  faqs.forEach((f, i) => {
    lines.push(`  Q${i + 1}. ${f.q || ''}`);
    lines.push(`  A${i + 1}. ${f.a || ''}`);
  });

  lines.push(`[비교용 일반 제품 사진] ${hasGeneralProductPhoto ? '있음' : '없음 — 중립 아이콘/실루엣으로 대체'}`);

  // 필수표기사항 (P10 하단 섹션용)
  if (compliance) {
    lines.push(`[필수표기사항 (P10 하단 자동 삽입)]`);
    lines.push(`  - 품명 및 모델명: ${compliance.modelName || '(미입력 — 제품명으로 자동)'}`);
    lines.push(`  - 크기/무게: ${compliance.sizeWeight || '(미입력 — 사이즈/스펙 참조)'}`);
    lines.push(`  - 색상: ${compliance.color || '(미입력 — 사진에서 유추)'}`);
    lines.push(`  - 재질: ${compliance.material || '(미입력 — 소재 필드 참조)'}`);
    lines.push(`  - 제조자/수입자: ${compliance.manufacturer || '(미입력 — "상세페이지 참조"로 표기)'}`);
    lines.push(`  - 제조국: ${compliance.origin || '(미입력 — "상세페이지 참조"로 표기)'}`);
    lines.push(`  - A/S 책임자 및 연락처: ${compliance.asContact || '(미입력 — "구매처 고객센터"로 표기)'}`);
  }

  if (extraNotes) lines.push(`[추가 메모] ${extraNotes}`);

  // 🆕 카테고리별 작성 가이드 자동 주입 (productType이 있을 때만)
  // 7개 카테고리 각각에 톤/강조점/사진추천이 다르게 정의되어 있어
  // 같은 제품명이라도 카테고리에 맞는 페이지가 생성됨.
  const categoryBlock = buildCategoryGuideBlock(productType);
  if (categoryBlock) {
    lines.push(categoryBlock);
  }

  return lines.join('\n');
}

/**
 * 브리프의 빈 칸을 AI가 자동 채우기.
 * 제품명과 업로드된 사진, 있는 정보를 근거로 부족한 칸을 한 번에 채움.
 * 기존에 사용자가 입력한 값은 유지되고, 빈 칸만 채워짐.
 */
export async function autoFillBrief({ apiKey, model = 'gpt-4o-mini', provider, brief, imageCount }) {
  const _provider = provider || detectProviderFromModel(model);
  if (!apiKey) throw new Error('AI API 키가 필요합니다.');
  if (!brief?.productName?.trim()) throw new Error('제품명은 직접 입력해 주세요.');

  const currentBrief = {
    productName: brief.productName || '',
    productType: brief.productType || '',
    strengths: brief.strengths || ['', '', ''],
    targetCustomers: brief.targetCustomers || ['', '', ''],
    material: brief.material || '',
    sizeSpec: brief.sizeSpec || '',
    photoTypes: brief.photoTypes || '',
    reviews: brief.reviews || [],
    differences: brief.differences || ['', '', '', ''],
    generalProductName: brief.generalProductName || '',
    generalProductFeatures: brief.generalProductFeatures || ['', '', '', ''],
    usages: brief.usages || ['', '', '', ''],
    usageSteps: brief.usageSteps || ['', '', ''],
    faqs: brief.faqs || [],
    extraNotes: brief.extraNotes || '',
    compliance: brief.compliance || {
      modelName: '', sizeWeight: '', color: '', material: '',
      manufacturer: '', origin: '', asContact: '',
    },
  };

  const systemPrompt = `당신은 쿠팡 생활용품 상세페이지 기획자입니다.
사용자가 일부만 입력한 제품 브리프에서 **빈 칸을 자연스럽고 그럴듯한 한국 쿠팡 카피로 채워주세요**.
- 사용자가 이미 입력한 값은 절대 바꾸지 말고 그대로 두세요.
- 과장/허위 금지. 제품명과 유형에서 자연스럽게 유추 가능한 내용만 작성.
- 리뷰는 한국 고객 말투, 닉네임은 "도시락**", "루나***" 같은 마스킹, 날짜는 최근 3개월.
- FAQ 답변은 1-2문장, 친절한 존댓말.
- 결과는 반드시 단일 JSON 오브젝트로만 반환.`;

  const userPrompt = `다음은 사용자가 입력한 제품 브리프입니다. (빈 문자열/빈 배열은 사용자가 비워둔 칸)
첨부 사진 ${imageCount}장.

현재 브리프:
${JSON.stringify(currentBrief, null, 2)}

요구사항:
- 위 JSON에서 비어있는 필드만 추론으로 채우고, 채워진 필드는 그대로 유지.
- strengths, targetCustomers는 정확히 3개로 맞춤.
- differences, generalProductFeatures, usages는 4개로 맞춤. generalProductFeatures[i]는 differences[i]에 해당하는 "일반 제품의 상태".
- usageSteps는 3개, reviews는 4개 (각 {nickname, date, body}), faqs는 5개 (각 {q, a}).
- photoTypes는 제품명과 유형에서 유추 ("제품 단독 사진, 사용 장면 사진, 디테일 컷" 등 한 줄).
- material이 비어있으면 제품 유형에 맞는 흔한 소재 (예: "ABS 플라스틱", "실리콘", "스테인리스 304"), sizeSpec이 비어있으면 "가로 ○cm × 세로 ○cm" 같은 일반 예시.

반환 스키마 (단일 JSON):
{
  "productType": "${currentBrief.productType || '적절한 유형 7개 중 1개'}",
  "strengths": ["...", "...", "..."],
  "targetCustomers": ["...", "...", "..."],
  "material": "...",
  "sizeSpec": "...",
  "photoTypes": "...",
  "reviews": [{"nickname": "...", "date": "2024-MM-DD", "body": "..."}, ...4개],
  "differences": ["...", ...4개],
  "generalProductName": "일반 ${currentBrief.productName.split(' ')[0] || '제품'}",
  "generalProductFeatures": ["...", ...4개],
  "usages": ["...", ...4개],
  "usageSteps": ["...", "...", "..."],
  "faqs": [{"q": "...", "a": "..."}, ...5개],
  "extraNotes": "...",
  "compliance": {
    "modelName": "품명 및 모델명 (제품명 기반, 미입력 시 제품명 그대로)",
    "sizeWeight": "크기/무게 (sizeSpec 참조)",
    "color": "색상 (제품명/사진에서 유추, 불명확하면 '상세페이지 참조')",
    "material": "재질 (material 필드 그대로)",
    "manufacturer": "제조자/수입자 (유저 입력 없으면 '상세페이지 참조')",
    "origin": "제조국 (유저 입력 없으면 '상세페이지 참조')",
    "asContact": "A/S 책임자 및 연락처 (유저 입력 없으면 '구매처 고객센터')"
  }
}`;

  const { content } = await callAI({
    provider: _provider,
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    responseFormat: 'json',
    temperature: 0.7,
    maxTokens: 4096,
  });

  let filled;
  try {
    filled = JSON.parse(content);
  } catch {
    throw new Error('자동 채움 응답을 JSON으로 파싱할 수 없습니다.');
  }

  // 기존 값 유지 + 빈 칸만 덮어쓰기
  const merged = { ...brief };
  const setIfEmpty = (key) => {
    if (!merged[key]?.trim && !merged[key]) {
      if (filled[key]) merged[key] = filled[key];
    } else if (typeof merged[key] === 'string' && !merged[key].trim() && filled[key]) {
      merged[key] = filled[key];
    }
  };
  ['productType', 'material', 'sizeSpec', 'photoTypes', 'generalProductName', 'extraNotes'].forEach(setIfEmpty);

  // 배열: 빈 슬롯만 채움
  const mergeArr = (key, targetLen) => {
    const existing = merged[key] || [];
    const src = filled[key] || [];
    const out = [];
    for (let i = 0; i < targetLen; i++) {
      const cur = existing[i];
      if (typeof cur === 'string' && cur.trim()) out.push(cur);
      else if (typeof cur === 'object' && cur !== null) out.push(cur);
      else if (src[i]) out.push(src[i]);
      else out.push(typeof cur === 'object' ? {} : '');
    }
    merged[key] = out;
  };
  mergeArr('strengths', 3);
  mergeArr('targetCustomers', 3);
  mergeArr('differences', 4);
  mergeArr('generalProductFeatures', 4);
  mergeArr('usages', 4);
  mergeArr('usageSteps', 3);

  // 리뷰/FAQ 특별 처리 (객체 배열)
  const mergeObjArr = (key, targetLen, emptyCheck) => {
    const existing = merged[key] || [];
    const src = filled[key] || [];
    const out = [];
    for (let i = 0; i < targetLen; i++) {
      const cur = existing[i];
      if (cur && !emptyCheck(cur)) out.push(cur);
      else if (src[i]) out.push(src[i]);
      else out.push(cur || {});
    }
    merged[key] = out;
  };
  mergeObjArr('reviews', 4, (r) => !r?.nickname?.trim() && !r?.body?.trim());
  mergeObjArr('faqs', 5, (f) => !f?.q?.trim() && !f?.a?.trim());

  // compliance(필수표기사항): 객체 내 빈 필드만 채움
  const existingCompliance = merged.compliance || {};
  const filledCompliance = filled.compliance || {};
  const complianceKeys = ['modelName', 'sizeWeight', 'color', 'material', 'manufacturer', 'origin', 'asContact'];
  const mergedCompliance = {};
  complianceKeys.forEach((k) => {
    const cur = existingCompliance[k];
    mergedCompliance[k] = (typeof cur === 'string' && cur.trim())
      ? cur
      : (filledCompliance[k] || '');
  });
  merged.compliance = mergedCompliance;

  return merged;
}

/**
 * 특정 페이지(P1~P10) 콘텐츠를 생성.
 */
function detectP4RevisionTarget(text = '') {
  const normalized = String(text || '').toLowerCase();
  const headlineRequested = /(헤드라인|제목|타이틀|섹션명|상단 문구|상단 제목)/i.test(normalized);
  const reviewsRequested = /(리뷰|후기|본문|리뷰내용|후기내용|멘트|내용)/i.test(normalized);

  if (headlineRequested && reviewsRequested) return 'both';
  if (headlineRequested) return 'headline';
  if (reviewsRequested) return 'reviews';
  return 'unknown';
}

function buildP4RevisionRequest({ userMessage, revisionRequest }) {
  const baseRequest = String(revisionRequest || userMessage || '').trim();
  const target = detectP4RevisionTarget(baseRequest);

  if (target === 'headline') {
    return `P4에서 sectionTitle(상단 제목)만 수정하세요. 원요청: "${baseRequest}". reviews 배열의 nickname/date/body는 절대 변경하지 마세요.`;
  }

  if (target === 'reviews') {
    return `P4에서 reviews 배열 내용만 수정하세요. 원요청: "${baseRequest}". sectionTitle(상단 제목)은 유지하세요.`;
  }

  return baseRequest;
}

function normalizeP4Copy(candidate, previousCopy = {}) {
  if (!candidate || typeof candidate !== 'object') return null;

  const previousTitle = previousCopy?.sectionTitle || '고객님들의 생생한 후기';
  const previousReviews = Array.isArray(previousCopy?.reviews) ? previousCopy.reviews : [];
  const rawReviews = Array.isArray(candidate.reviews) ? candidate.reviews : [];

  const reviews = rawReviews
    .slice(0, 4)
    .map((r, i) => ({
      nickname: r?.nickname || previousReviews[i]?.nickname || '고객님',
      date: r?.date || previousReviews[i]?.date || '2026-01-01',
      body: r?.body || previousReviews[i]?.body || '',
    }));

  while (reviews.length < 4) {
    const i = reviews.length;
    reviews.push({
      nickname: previousReviews[i]?.nickname || '고객님',
      date: previousReviews[i]?.date || '2026-01-01',
      body: previousReviews[i]?.body || '',
    });
  }

  return {
    sectionTitle: candidate.sectionTitle || previousTitle,
    reviews,
  };
}

async function attemptFocusedP4ReviewRevision({
  provider,
  apiKey,
  model,
  revisionRequest,
  previousCopy,
}) {
  const focusedSystemPrompt = `너는 P4 리뷰 카피만 수정하는 JSON 편집기다. 반드시 유효한 단일 JSON 오브젝트만 출력한다.`;
  const focusedUserPrompt = `다음 previousCopy를 기반으로, 사용자의 요청을 반영해 P4 copy를 수정하세요.

사용자 요청:
${revisionRequest}

규칙:
- sectionTitle은 previousCopy 값을 그대로 유지
- reviews 배열의 nickname/date/body만 필요 시 수정
- reviews는 정확히 4개 유지
- 최종 출력은 아래 스키마의 JSON 1개만 반환
{
  "sectionTitle": "string",
  "reviews": [
    {"nickname":"string","date":"string","body":"string"},
    {"nickname":"string","date":"string","body":"string"},
    {"nickname":"string","date":"string","body":"string"},
    {"nickname":"string","date":"string","body":"string"}
  ]
}

previousCopy:
${JSON.stringify(previousCopy || {}, null, 2)}`;

  const focused = await callAI({
    provider,
    apiKey,
    model,
    systemPrompt: focusedSystemPrompt,
    userPrompt: focusedUserPrompt,
    responseFormat: 'json',
    temperature: 0,
    maxTokens: 1800,
  });

  const focusedParsed = parseJsonLoose(focused?.content || '');
  return normalizeP4Copy(focusedParsed, previousCopy);
}

export async function classifyRevisionChatIntent({
  apiKey,
  model = 'gpt-4o-mini',
  provider,
  pageNumber,
  userMessage,
  previousCopy = null,
  revisionChats = [],
}) {
  const _provider = provider || detectProviderFromModel(model);
  if (!apiKey) throw new Error('AI API 키가 필요합니다.');

  const normalizedChats = (revisionChats || [])
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-10)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: m.text }));

  const systemPrompt = `당신은 상세페이지 수정용 AI 채팅 라우터입니다.
사용자 메시지가 "실제 수정 지시"인지, "일반 대화/확인/잡담"인지 분류하세요.

반드시 단일 JSON으로만 답하세요.
출력 스키마:
{
  "action": "chat" | "revise",
  "assistantMessage": "사용자에게 보여줄 자연스러운 한국어 답변 (1~2문장)",
  "revisionRequest": "action이 revise일 때만, 실제 수정에 사용할 명확한 지시문"
}

판단 규칙:
- action=chat: 인사, 테스트("내말들려?"), 가능여부 질문, 상태 확인, 설명 요청, 잡담
- action=revise: 문구 변경/삭제/추가, 구조 변경, 톤 변경, 길이 조절 등 실제 페이지 수정 지시
- 애매하면 chat으로 보수적으로 판단하세요.
- chat일 때는 페이지를 수정하라고 지시하지 말고, 사용자의 말을 이해했음을 짧게 답하세요.`;

  const userPrompt = `현재 페이지: ${pageNumber}
사용자 최신 메시지: ${userMessage}

최근 대화(최신 10턴):
${JSON.stringify(normalizedChats, null, 2)}

현재 페이지 copy 스냅샷(요약 참고):
${JSON.stringify(previousCopy || {}, null, 2).slice(0, 2500)}`;

  const { content } = await callAI({
    provider: _provider,
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    responseFormat: 'json',
    temperature: 0,
    maxTokens: 900,
  });

  const parsed = parseJsonLoose(content) || {};
  const action = parsed.action === 'revise' ? 'revise' : 'chat';
  const assistantMessage = typeof parsed.assistantMessage === 'string' && parsed.assistantMessage.trim()
    ? parsed.assistantMessage.trim()
    : (action === 'revise'
      ? '요청하신 수정 방향을 이해했습니다. 반영해볼게요.'
      : '네, 잘 들려요. 원하는 수정 내용을 말씀해주시면 바로 반영할게요.');
  const revisionRequest = typeof parsed.revisionRequest === 'string' ? parsed.revisionRequest.trim() : '';
  const normalizedRevisionRequest = action === 'revise'
    ? (pageNumber === 'P4'
      ? buildP4RevisionRequest({ userMessage, revisionRequest })
      : (revisionRequest || userMessage))
    : '';

  return {
    action,
    assistantMessage,
    revisionRequest: normalizedRevisionRequest,
  };
}

export async function generateCoupangPage({
  apiKey,
  model = 'gpt-4o-mini',
  provider,
  pageNumber, // "P1" ~ "P10"
  brief,
  imageCount,
  previousPagesSummary = '',
  revisionRequest = '',           // 사용자 수정요청 피드백 (현재 턴)
  previousCopy = null,             // 이전 생성 결과 (수정의 base)
  revisionHistory = [],            // 이전 턴까지의 수정 히스토리 [{ feedback, at }, ...]
  revisionChats = [],              // 현재 페이지 대화 히스토리 [{ role, text, at }, ...]
}) {
  const _provider = provider || detectProviderFromModel(model);
  if (!apiKey) throw new Error('AI API 키가 필요합니다.');
  if (!pageNumber) throw new Error('pageNumber가 필요합니다.');

  const briefText = serializeUserBrief(brief, imageCount);

  // P10 전용 보조 안내 — schema가 크므로 모델이 빠뜨리지 않도록 강조
  let p10Hint = '';
  if (pageNumber === 'P10') {
    p10Hint = `
[P10 필수 응답 항목 — 절대 누락 금지]
copy 안에 반드시 아래 3개 키가 모두 있어야 합니다:
1) components: { title, bullets[3~4개], photoHint }
2) faq: 5개 [{q, a}] — 키 이름은 "faq" (faqs 아님!)
3) compliance: 7개 필드 객체 (modelName/sizeWeight/color/material/manufacturer/origin/asContact)
* shippingInfo, csInfo는 더이상 사용하지 않음 (필수표기사항과 중복으로 제거됨)
* needsMoreInfo는 false로 두고, 정보 부족하면 "상세페이지 참조"로 안전하게 채우세요.`;
  }

  // P5 비교표용 일반 제품 정보 확장
  let p5ExtraBrief = '';
  if (pageNumber === 'P5' && brief) {
    const general = (brief.generalProductFeatures || []).filter((f) => f?.trim());
    if (brief.generalProductName?.trim() || general.length > 0) {
      p5ExtraBrief = `\n[P5 일반상품 비교 정보]\n` +
        `- 일반 상품 이름: ${brief.generalProductName || '일반 제품'}\n` +
        (general.length > 0
          ? `- 일반 상품은 각 비교항목에서 이렇습니다:\n${general.map((g, i) => `  · ${brief.differences?.[i] || `항목${i + 1}`} → ${g}`).join('\n')}\n`
          : '');
    }
  }

  // 🔴 수정 모드: 전체 prompt 구조를 교체 — brief는 참고용이고 수정 요청이 최우선
  const isRevisionMode = !!(revisionRequest && previousCopy);

  // 누적 수정 히스토리 (이전 수정들도 계속 존중)
  const historyBlock = (revisionHistory && revisionHistory.length > 0)
    ? `\n\n📝 이전까지의 수정 요청 히스토리 (모두 누적 적용):\n${revisionHistory.map((h, i) => `  ${i + 1}. "${h.feedback}"`).join('\n')}\n`
    : '';

  const normalizedRevisionChats = (revisionChats || [])
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-12);

  const chatHistoryBlock = normalizedRevisionChats.length > 0
    ? `\n\n💬 현재 ${pageNumber} 페이지 채팅 맥락 (최신 12턴):\n${normalizedRevisionChats
      .map((m, i) => `  ${i + 1}. [${m.role === 'assistant' ? 'AI' : '사용자'}] ${m.text}`)
      .join('\n')}\n`
    : '';

  const p4Target = pageNumber === 'P4' ? detectP4RevisionTarget(revisionRequest) : 'unknown';
  const p4RevisionGuard = (isRevisionMode && pageNumber === 'P4')
    ? `\n7. P4 필드 타깃 규칙:\n${p4Target === 'headline'
      ? '   - 이번 요청은 sectionTitle(상단 제목) 전용 수정입니다. reviews 배열(nickname/date/body)은 절대 변경하지 마세요.'
      : p4Target === 'reviews'
        ? '   - 이번 요청은 reviews 배열 수정입니다. sectionTitle(상단 제목)은 유지하세요.'
        : '   - 사용자가 명시한 대상 필드만 수정하세요. sectionTitle와 reviews를 불필요하게 함께 바꾸지 마세요.'}`
    : '';

  const userPrompt = isRevisionMode
    ? `🔧 [수정 작업] ${pageNumber} 페이지를 수정합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ 최우선 지시 — 아래 수정 요청을 반드시 그대로 반영하세요:
"${revisionRequest}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${historyBlock}${chatHistoryBlock}
📄 현재 페이지 상태 (이걸 base로 수정):
${JSON.stringify(previousCopy, null, 2)}

📋 참고용 제품 브리프 (수정 요청과 충돌 시 무시 가능):
${briefText}${p5ExtraBrief}${p10Hint}

🎯 수정 작업 규칙 (반드시 준수):
1. **위 '최우선 지시'를 최상위 우선순위로 반영**하세요.
   - "X를 지워줘"라고 했으면 **X가 다시 나오면 안 됩니다** (브리프에 있어도 무시).
   - "Y로 바꿔줘"라고 했으면 원래 Y가 아니었어도 Y로 바꾸세요.
   - "더 짧게"라고 했으면 이전보다 반드시 더 짧게.
2. **이전 수정 히스토리와 채팅 맥락을 모두 존중** — 누적해서 적용됩니다.
3. **현재 페이지 상태를 base로** 수정 부분만 바꾸고, 나머지는 그대로 유지 (재생성 금지).
4. 최종 결과는 시스템 프롬프트의 ${pageNumber} JSON 스키마 준수.
5. 단일 JSON 오브젝트만, 코드 펜스 없이 반환.
6. confirmMessage는 시스템 프롬프트 포맷 그대로.${p4RevisionGuard}

🚫 금지 사항:
- 사용자가 지우라고 한 내용을 "브리프에 있으니까" 다시 넣지 마세요.
- 수정 요청과 브리프가 충돌하면 **수정 요청이 절대 우선**입니다.
- "이전 생성 결과가 더 좋아 보여서 유지" 같은 독단적 판단 금지.`
    : `지금 ${pageNumber} 페이지를 제작합니다.

아래는 사용자가 제공한 제품 브리프입니다.
--- 제품 브리프 ---
${briefText}${p5ExtraBrief}${p10Hint}
--- 제품 브리프 끝 ---

${previousPagesSummary ? `이전 페이지 요약:\n${previousPagesSummary}\n\n` : ''}
요구사항:
- 시스템 프롬프트에 정의된 ${pageNumber} 섹션의 페이지 구조/카피 규칙을 그대로 따르세요.
- 브랜드 색상은 앱이 자동 적용하므로 카피 안에 색상 코드를 넣지 마세요.
- 카피 텍스트는 내부 수치/가이드 없이 고객에게 보여질 최종 문구만 작성하세요.
- 반드시 시스템 프롬프트의 "응답 출력 형식" JSON 스키마를 따라 단일 JSON 오브젝트만 반환하세요.
- 코드 펜스(\`\`\`)나 다른 설명 문구 금지.
- confirmMessage는 시스템 프롬프트에 명시된 포맷을 그대로 사용하세요.

🤖 자동 채움 규칙 (중요):
- 브리프에 "(미입력)" "(닉네임)" "" (빈 문자열) 등으로 비어있는 항목이 있으면,
  **제품명 · 제품 유형 · 채워진 정보를 근거로 자연스러운 초안을 직접 생성**하세요.
- 사용자가 나중에 수정할 수 있으므로 "미입력" 같은 플레이스홀더를 그대로 출력하지 말고,
  **실제로 그럴듯한 한국 쿠팡 고객용 카피**를 만드세요.
- 리뷰가 비어있으면: 해당 제품을 구매한 한국 고객의 실제 말투로 샘플 리뷰 생성
  (닉네임은 "도시락**", "루나***" 같은 마스킹 형태, 날짜는 최근 3개월 이내)
- 차별점/활용법/FAQ가 부족하면: 제품 특성과 일반 상식에 근거해 자연스럽게 채움
- 과장/허위 금지 — 제품명/사진에서 유추할 수 없는 수치나 인증은 지어내지 말 것.`;

  const { content, usage } = await callAI({
    provider: _provider,
    apiKey,
    model,
    systemPrompt: COUPANG_DETAIL_SYSTEM_PROMPT,
    userPrompt,
    responseFormat: 'json',
    // 수정 모드는 더 낮은 temperature (0.1) — 스키마 일관성·정확성 우선
    // 초기 생성은 0.6 — 창의적 카피
    temperature: isRevisionMode ? 0.1 : 0.6,
    maxTokens: 4096,
  });

  let parsed = parseJsonLoose(content);

  // 1차 파싱 실패 시: 동일 모델에 JSON 정규화 요청 1회 재시도
  if (!parsed) {
    console.warn('[generateCoupangPage] 1차 JSON parse 실패 — JSON 정규화 재시도', { pageNumber });
    const repairPrompt = `아래 텍스트를 의미 손실 없이 "유효한 단일 JSON 오브젝트"로만 정규화하세요.

규칙:
- 설명문/주석/코드펜스 금지
- JSON만 출력
- 키 이름/구조는 원문 의도를 최대한 유지

원문:
${content}`;

    const repaired = await callAI({
      provider: _provider,
      apiKey,
      model,
      systemPrompt: '너는 JSON 정규화 도우미다. 반드시 단일 JSON 오브젝트만 출력한다.',
      userPrompt: repairPrompt,
      responseFormat: 'json',
      temperature: 0,
      maxTokens: 4096,
    });

    parsed = parseJsonLoose(repaired?.content || '');
  }

  if (!parsed) {
    console.error('[generateCoupangPage] JSON parse 최종 실패', { pageNumber, content: String(content).slice(0, 1200) });
    throw new Error('AI 응답을 JSON으로 파싱할 수 없습니다.');
  }

  // API 에러 payload가 JSON으로 들어온 경우(예: {type:"error", ...})는
  // "생성 성공"으로 처리하면 미리보기가 빈 화면이 되므로 즉시 실패 처리한다.
  const parsedErrorType = parsed?.type === 'error' || parsed?.error?.type === 'error';
  const parsedErrorMessage = parsed?.error?.message || parsed?.message;
  if (parsedErrorType || parsedErrorMessage) {
    throw new Error(`AI 응답 에러: ${parsedErrorMessage || '요청 처리 실패'}`);
  }

  // 스키마 핵심 필드(copy)가 없으면 한 번 더 강제 재생성 시도
  if (!parsed?.copy) {
    console.warn('[generateCoupangPage] copy 누락 응답 감지 — 강제 재생성 1회 시도', { pageNumber });
    const retryPrompt = `${userPrompt}\n\n⚠️ 직전 응답이 스키마를 지키지 못했습니다. 이번에는 반드시 copy 키를 포함한 단일 JSON 오브젝트만 반환하세요.`;
    const retried = await callAI({
      provider: _provider,
      apiKey,
      model,
      systemPrompt: COUPANG_DETAIL_SYSTEM_PROMPT,
      userPrompt: retryPrompt,
      responseFormat: 'json',
      temperature: isRevisionMode ? 0.1 : 0.5,
      maxTokens: 4096,
    });
    parsed = parseJsonLoose(retried?.content || '') || parsed;
  }

  // 여전히 copy가 없으면 더 엄격한 복구 프롬프트로 1회 추가 시도
  if (!parsed?.copy) {
    console.warn('[generateCoupangPage] copy 누락 지속 — 엄격 복구 재시도', { pageNumber });
    const strictRetryPrompt = `${userPrompt}\n\n⚠️ 반드시 유효한 JSON 오브젝트 1개만 반환하세요. 최상위에 copy 키를 포함해야 하며, copy가 없으면 실패입니다.`;
    const strictRetried = await callAI({
      provider: _provider,
      apiKey,
      model,
      systemPrompt: COUPANG_DETAIL_SYSTEM_PROMPT,
      userPrompt: strictRetryPrompt,
      responseFormat: 'json',
      temperature: 0,
      maxTokens: 4096,
    });
    parsed = parseJsonLoose(strictRetried?.content || '') || parsed;
  }

  // P4 리뷰 수정은 별도 집중 복구를 1회 더 시도 (리뷰 수정 성공률 강화)
  if (!parsed?.copy && isRevisionMode && pageNumber === 'P4' && previousCopy && p4Target === 'reviews') {
    try {
      const recoveredP4Copy = await attemptFocusedP4ReviewRevision({
        provider: _provider,
        apiKey,
        model,
        revisionRequest,
        previousCopy,
      });
      if (recoveredP4Copy) {
        parsed = {
          ...(parsed || {}),
          copy: recoveredP4Copy,
          needsMoreInfo: false,
          missingItems: [],
          confirmMessage: '요청하신 리뷰 수정을 반영했습니다. 추가로 다듬고 싶은 문구가 있으면 이어서 말씀해 주세요.',
        };
      }
    } catch (focusedErr) {
      console.warn('[generateCoupangPage] P4 집중 복구 실패', focusedErr);
    }
  }

  // 재시도 후에도 copy가 없으면(특히 수정 모드) 기존 페이지를 유지하는 안전 폴백 사용
  if (!parsed?.copy) {
    if (isRevisionMode && previousCopy) {
      console.warn('[generateCoupangPage] copy 복구 실패 — 기존 copy 유지 폴백 적용', { pageNumber });
      parsed = {
        ...(parsed || {}),
        copy: previousCopy,
        needsMoreInfo: false,
        missingItems: [],
        confirmMessage: '요청은 이해했지만 응답 형식 오류가 발생해 이번에는 화면 변경 없이 유지했습니다. 같은 요청을 다시 보내주시면 재시도할게요.',
      };
    } else {
      throw new Error('AI가 페이지 본문(copy)을 만들지 못했습니다. 다시 생성을 시도해주세요.');
    }
  }

  // 응답에 usage 첨부 (App.jsx에서 비용 기록)
  // 호환성: costTracker 가 prompt_tokens/completion_tokens 형식을 기대하므로 변환해서 함께 첨부
  if (parsed && usage) {
    parsed._usage = {
      prompt_tokens: usage.input,
      completion_tokens: usage.output,
      total_tokens: (usage.input || 0) + (usage.output || 0),
      input: usage.input,
      output: usage.output,
    };
    parsed._model = model;
    parsed._provider = _provider;
  }

  // Claude가 가끔 copy를 채워두고도 needsMoreInfo=true를 반환하는 경우가 있어,
  // 렌더 가능한 copy가 있으면 생성 진행을 막지 않도록 자동 완화.
  const hasRenderableCopy = (() => {
    if (!parsed?.copy) return false;
    if (typeof parsed.copy === 'string') return parsed.copy.trim().length > 0;
    if (typeof parsed.copy === 'object') return Object.keys(parsed.copy).length > 0;
    return false;
  })();
  if (parsed?.needsMoreInfo && hasRenderableCopy) {
    console.warn('[generateCoupangPage] needsMoreInfo=true 이지만 copy 존재 — 자동 생성 허용으로 전환');
    parsed.needsMoreInfo = false;
    parsed.missingItems = [];
  }

  // 🛡️ P10 안전 보강 — 응답이 부분적이거나 needsMoreInfo여도 빈 데이터로 깨지지 않도록
  if (pageNumber === 'P10') {
    parsed.copy = parsed.copy || {};
    const c = parsed.copy;
    if (!c.components || typeof c.components !== 'object') {
      c.components = { title: '구성품 안내', bullets: [], photoHint: '' };
    }
    if (!Array.isArray(c.components.bullets)) c.components.bullets = [];
    // faq vs faqs 키 호환 (모델이 가끔 'faqs'로 잘못 응답)
    if (!Array.isArray(c.faq)) {
      if (Array.isArray(c.faqs)) {
        c.faq = c.faqs;
      } else {
        c.faq = [];
      }
    }
    // shippingInfo/csInfo는 더이상 P10에서 사용하지 않음 (정리됨)
    if (!c.compliance || typeof c.compliance !== 'object') c.compliance = {};
    // needsMoreInfo가 true여도 P10은 무시하고 강제 표시 (FAQ는 default로 채워짐)
    if (parsed.needsMoreInfo) {
      console.warn('[generateCoupangPage] P10 needsMoreInfo=true 받음 — 무시하고 강제 표시');
      parsed.needsMoreInfo = false;
      parsed.missingItems = [];
    }
  }

  return parsed;
}

/**
 * 입력 검증 — 꼭 필요한 것만 block, 나머지는 warning.
 * returns: { ok, blocking: string[], warnings: string[] }
 *   blocking: 생성 불가 (제품명, 사진 1장)
 *   warnings: AI가 알아서 추론하겠지만 채워주면 더 좋은 항목
 */
export function validateCommonBrief(brief, images) {
  const blocking = [];
  const warnings = [];

  // 진짜 필수 — AI가 무에서 만들 수 없는 정보
  if (!brief?.productName?.trim()) blocking.push('제품명');
  if (!images || images.length < 1) blocking.push('제품 사진 1장 이상');

  // 있으면 좋지만 없으면 AI가 추론해서 채움
  if (!brief?.strengths || brief.strengths.filter((s) => s?.trim()).length < 3)
    warnings.push('핵심 강점 3가지 (AI가 추론)');
  const tcCount = (brief?.targetCustomers || []).filter((c) => c?.trim()).length;
  if (tcCount < 3) warnings.push('주 고객층 3가지 (AI가 추론)');
  if (!brief?.material?.trim() && !brief?.sizeSpec?.trim())
    warnings.push('소재/사이즈 (AI가 추론)');
  if (!brief?.photoTypes?.trim()) warnings.push('보유 사진 종류 (AI가 추론)');

  return {
    ok: blocking.length === 0,
    blocking,
    warnings,
    missing: blocking, // 구버전 호환
  };
}

/**
 * 페이지별 추가 요구사항 — 부족해도 AI가 알아서 채움.
 * returns: { ok, warnings: string[] }
 */
export function validatePageRequirements(pageNumber, brief) {
  const warnings = [];

  // P1 — 메인 히어로 + 강점 카드: 제품명, 핵심 강점 3가지
  if (pageNumber === 'P1') {
    const strengths = (brief?.strengths || []).filter((s) => s?.trim());
    if (strengths.length < 3) warnings.push(`핵심 강점 ${3 - strengths.length}가지 (AI가 추론)`);
    if (!brief?.productType?.trim()) warnings.push('제품 카테고리 (AI가 추론)');
  }

  // P2 — 베네핏 심화 설명: 핵심 강점 3가지
  if (pageNumber === 'P2') {
    const strengths = (brief?.strengths || []).filter((s) => s?.trim());
    if (strengths.length < 3) warnings.push(`핵심 강점 ${3 - strengths.length}가지 (AI가 베네핏으로 확장)`);
  }

  // P3 — 이런 분들께 추천드려요: 주 고객층 3가지
  if (pageNumber === 'P3') {
    const targets = (brief?.targetCustomers || []).filter((c) => c?.trim());
    if (targets.length < 3) warnings.push(`주 고객층 ${3 - targets.length}가지 (AI가 추론)`);
  }

  // P4 — 리뷰: 4개
  if (pageNumber === 'P4') {
    const valid = (brief?.reviews || []).filter(
      (r) => r?.nickname?.trim() && r?.body?.trim(),
    );
    if (valid.length < 4) warnings.push(`리뷰 ${4 - valid.length}개 (AI가 샘플 리뷰 생성)`);
  }

  // P5 — 비교표: 차별점 4개
  if (pageNumber === 'P5') {
    const diffs = (brief?.differences || []).filter((d) => d?.trim());
    if (diffs.length < 4) warnings.push(`차별점 ${4 - diffs.length}개 (AI가 추론)`);
    if (!brief?.generalProductName?.trim()) {
      warnings.push('비교 대상 일반 상품명 (AI가 추론)');
    }
  }

  // P6 — 소재 & 사이즈 실증: 소재 또는 사이즈/규격
  if (pageNumber === 'P6') {
    if (!brief?.material?.trim()) warnings.push('소재 (AI가 추론)');
    if (!brief?.sizeSpec?.trim()) warnings.push('사이즈/규격 (AI가 추론)');
  }

  // P7 — 감성 라이프스타일: 보유 사진 종류, 주 고객층
  if (pageNumber === 'P7') {
    if (!brief?.photoTypes?.trim()) warnings.push('보유 사진 종류 (AI가 추론)');
    const targets = (brief?.targetCustomers || []).filter((c) => c?.trim());
    if (targets.length < 3) warnings.push(`주 고객층 ${3 - targets.length}가지 (AI가 라이프스타일 장면 추론)`);
  }

  // P8 — 다양한 활용법: 4개
  if (pageNumber === 'P8') {
    const usages = (brief?.usages || []).filter((u) => u?.trim());
    if (usages.length < 4) warnings.push(`활용법 ${4 - usages.length}개 (AI가 추론)`);
  }

  // P9 — 사용법: 사용 순서 3단계
  if (pageNumber === 'P9') {
    const steps = (brief?.usageSteps || []).filter((s) => s?.trim());
    if (steps.length < 3) warnings.push(`사용 순서 ${3 - steps.length}단계 (AI가 추론)`);
  }

  // P10 — 구성품 + FAQ: 5개
  if (pageNumber === 'P10') {
    const faqs = (brief?.faqs || []).filter((f) => f?.q?.trim() && f?.a?.trim());
    if (faqs.length < 5) warnings.push(`FAQ ${5 - faqs.length}개 (AI가 추론)`);
  }

  // 더이상 차단하지 않음 — 항상 ok: true
  return { ok: true, warnings, missing: [] };
}

// ============================================================================
// 참조 URL 분석 — 1688, 쿠팡, 네이버 등 상품 페이지를 읽어 제품 정보 자동 추출
// ============================================================================

/**
 * 중간 다리 사이트(가격비교/리다이렉트)의 URL을 실제 원본 URL로 변환.
 * 예: aliprice.com, taobaoex.com 등은 url= 쿼리 파라미터에 실제 URL을 포함.
 */
function normalizeReferenceUrl(rawUrl) {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // aliprice, taobaoex 등 중간 다리 사이트 — url 파라미터 추출
    const bridgeDomains = ['aliprice.com', 'taobaoex.com', 'alibabaglobal.com', 'taoglobal.com'];
    if (bridgeDomains.some((d) => host.endsWith(d))) {
      const innerUrl = u.searchParams.get('url') || u.searchParams.get('target') || u.searchParams.get('u');
      if (innerUrl) {
        const decoded = decodeURIComponent(innerUrl);
        return { url: decoded, wasNormalized: true, originalHost: host };
      }
    }

    return { url, wasNormalized: false, originalHost: host };
  } catch {
    return { url, wasNormalized: false, originalHost: '' };
  }
}

/**
 * 봇 차단/Captcha 페이지 감지.
 * 1688, 타오바오 등은 Captcha 화면을 HTTP 200으로 반환하므로 본문 키워드로 판별.
 */
function isBlockedPage(text) {
  if (!text) return false;
  const blockSignals = [
    'Captcha Interception',
    'Please slide to verify',
    'unusual traffic from your network',
    '滑动验证',
    '点击完成验证',
    '访问过于频繁',
    'access denied',
    'Access Denied',
    'Just a moment',          // Cloudflare
    'Enable JavaScript and cookies to continue',
    'security check to access',
  ];
  return blockSignals.some((s) => text.includes(s));
}

/**
 * 응답 텍스트가 "실제 상품 콘텐츠"인지 간단히 판별.
 * Jina Reader는 빈 페이지에도 짧은 메타 정보를 반환하므로 길이+키워드로 판단.
 */
function hasUsefulContent(text) {
  if (!text || text.length < 500) return false;
  // 봇 차단 페이지면 무효
  if (isBlockedPage(text)) return false;
  // 상품 페이지에 흔한 키워드 존재 여부
  const keywords = /(가격|원|배송|상품|제품|소재|사이즈|규격|재질|color|size|price|material|¥|元|商品|价格|材质|尺寸|重量|product|ml|cm|kg)/i;
  return keywords.test(text);
}

/**
 * CORS 우회를 위해 여러 공개 프록시를 순차 시도.
 */
async function fetchPageContent(url) {
  const candidates = [
    // 1순위: Jina AI Reader — 마크다운화 (AI 분석에 최적)
    {
      url: `https://r.jina.ai/${url}`,
      headers: { Accept: 'text/plain' },
      label: 'Jina Reader',
    },
    // 2순위: AllOrigins — 원본 HTML을 JSON으로 감싸서 반환
    {
      url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      headers: {},
      label: 'AllOrigins',
      transform: async (res) => {
        const data = await res.json();
        return data.contents || '';
      },
    },
    // 3순위: corsproxy.io
    {
      url: `https://corsproxy.io/?${encodeURIComponent(url)}`,
      headers: {},
      label: 'CorsProxy',
    },
  ];

  const attempts = [];
  let bestResult = null;
  let blockedCount = 0;

  for (const c of candidates) {
    try {
      const res = await fetch(c.url, { headers: c.headers });
      if (!res.ok) {
        attempts.push(`${c.label}: HTTP ${res.status}`);
        continue;
      }
      const text = c.transform ? await c.transform(res) : await res.text();
      const len = text?.length || 0;
      const blocked = isBlockedPage(text);
      attempts.push(`${c.label}: ${len.toLocaleString()}자${blocked ? ' (봇차단)' : ''}`);

      if (blocked) {
        blockedCount++;
        continue; // 봇 차단 페이지는 무시하고 다음 프록시 시도
      }

      // 쓸모 있는 콘텐츠면 즉시 반환
      if (hasUsefulContent(text)) {
        return { text, source: c.label, attempts };
      }
      // 폴백용: 일단 가장 긴 응답 보관
      if (!bestResult || len > bestResult.text.length) {
        bestResult = { text, source: c.label, attempts };
      }
    } catch (e) {
      attempts.push(`${c.label}: ${e.message}`);
    }
  }

  // 키워드는 부족하지만 길이가 그래도 있으면 일단 AI에 넘김
  if (bestResult && bestResult.text.length > 500) {
    return { ...bestResult, weakContent: true };
  }

  // 전부 봇 차단이었다면 전용 에러로 구분
  const allBlocked = blockedCount === candidates.length;
  const err = new Error(
    allBlocked
      ? `🛡️ 이 페이지는 봇 차단(Captcha)이 걸려있어 자동 읽기가 불가능합니다.\n` +
        `→ 브라우저에서 페이지를 열고 내용을 복사(Ctrl+A → Ctrl+C)해\n` +
        `   아래 "페이지 내용 직접 붙여넣기" 모드를 사용해주세요.\n\n` +
        `• 시도 결과: ${attempts.join(' / ')}`
      : `페이지를 불러오지 못했거나 내용이 비어있습니다.\n` +
        `• 시도 결과: ${attempts.join(' / ')}\n` +
        `• 해결: 원본 URL을 직접 쓰거나, "페이지 내용 직접 붙여넣기" 모드를 사용하세요.`,
  );
  err.isBlocked = allBlocked;
  err.attempts = attempts;
  throw err;
}

/**
 * 길이 제한 — 토큰 낭비 방지 (약 25,000자 = 대략 8k 토큰)
 */
function truncate(text, max = 25000) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n\n... (이하 생략 — 길이 제한)';
}

/**
 * 참조 URL에서 제품 정보를 추출.
 * 중국어(1688/타오바오)는 한국어로 번역해서 반환.
 */
export async function extractProductInfoFromUrl({
  apiKey,
  model = 'gpt-4o-mini',
  provider,
  url,
}) {
  const _provider = provider || detectProviderFromModel(model);
  if (!apiKey) throw new Error('AI API 키가 필요합니다.');
  if (!url) throw new Error('URL이 필요합니다.');

  // 0) 중간 다리 사이트(aliprice 등) URL 자동 정규화
  const normalized = normalizeReferenceUrl(url);
  const targetUrl = normalized.url;
  const normalizeNote = normalized.wasNormalized
    ? `※ ${normalized.originalHost} 중간 링크를 원본 URL(${new URL(targetUrl).hostname})로 변환했습니다.`
    : '';

  // 1) 페이지 콘텐츠 가져오기
  const { text, source, attempts, weakContent } = await fetchPageContent(targetUrl);
  const pageContent = truncate(text);
  const contentLength = text?.length || 0;

  // 2) OpenAI로 제품 정보 구조화 추출
  const systemPrompt = `당신은 이커머스 상품 페이지 분석 전문가입니다.
사용자가 제공한 상품 페이지 콘텐츠(HTML 또는 마크다운)를 읽고
한국 쿠팡 상세페이지 제작을 위해 필요한 정보를 추출합니다.

규칙:
- 결과는 반드시 한국어로 작성합니다.
- 중국어(1688, 타오바오 등)가 있으면 자연스러운 한국어로 번역합니다.
- 페이지에 명시되지 않은 정보는 추측하지 말고 빈 문자열로 둡니다.
- 과장/허위 표현을 쓰지 않습니다.
- 아래 JSON 스키마를 따라 단일 JSON 객체만 반환합니다. 코드 펜스 금지.

스키마:
{
  "productName": "한국어 상품명 (핵심 키워드 중심, 30자 이내)",
  "productType": "청소도구형|수납형|욕실/위생형|주방정리형|소모품형|생활보조형|인테리어소품형 중 가장 가까운 하나 (불확실하면 빈 문자열)",
  "strengths": ["강점1", "강점2", "강점3"],   // 정확히 3개
  "targetCustomers": ["주 고객층1 (한 문장)", "주 고객층2", "주 고객층3"],  // 정확히 3개, 서로 다른 페르소나
  "material": "소재 (문자열, 없으면 빈 문자열)",
  "sizeSpec": "사이즈/스펙 (cm, L, kg 등 구체 수치 포함, 여러 줄 가능)",
  "photoTypes": "페이지에서 확인된 사진 종류 (예: 제품 단독컷, 디테일컷, 사용장면컷)",
  "differences": ["일반 제품 대비 차별점1", "..."],  // 최대 4개
  "usages": ["활용법1", "..."],                 // 최대 4개
  "extraNotes": "기타 참고 사항 (브랜드/원산지/인증 등)"
}`;

  const userPrompt = `다음은 상품 페이지(${source})의 콘텐츠입니다.
원본 URL: ${targetUrl}

--- 페이지 콘텐츠 시작 ---
${pageContent}
--- 페이지 콘텐츠 끝 ---

위 내용에서 제품 정보를 추출해 스키마에 맞춰 JSON으로 반환하세요.
페이지에서 제품 정보를 전혀 찾을 수 없으면 모든 필드를 빈 값으로 반환하세요.`;

  const { content } = await callAI({
    provider: _provider,
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    responseFormat: 'json',
    temperature: 0.3,
    maxTokens: 4096,
  });

  try {
    const parsed = JSON.parse(content);
    return {
      ...parsed,
      _source: source,
      _attempts: attempts,
      _contentLength: contentLength,
      _normalizeNote: normalizeNote,
      _weakContent: !!weakContent,
      _finalUrl: targetUrl,
    };
  } catch {
    throw new Error('AI 응답을 JSON으로 파싱할 수 없습니다.');
  }
}

/**
 * 사용자가 직접 붙여넣은 페이지 텍스트에서 제품 정보를 추출.
 * 1688/타오바오처럼 봇 차단이 강한 페이지에 대한 우회 수단.
 */
export async function extractProductInfoFromText({
  apiKey,
  model = 'gpt-4o-mini',
  provider,
  pastedText,
  userNotes = '',
  imageDataUrls = [],   // 1688 등에서 다운받은 이미지 (base64 dataURL 배열) — Vision OCR (OpenAI 전용)
}) {
  const _provider = provider || detectProviderFromModel(model);
  if (!apiKey) throw new Error('AI API 키가 필요합니다.');
  const hasPasted = pastedText && pastedText.trim().length >= 50;
  const hasNotes = userNotes && userNotes.trim().length > 0;
  const validImages = (Array.isArray(imageDataUrls) ? imageDataUrls : []).filter(
    (u) => typeof u === 'string' && u.startsWith('data:image')
  ).slice(0, 8); // 최대 8장 (비용/속도)
  const hasImages = validImages.length > 0;

  if (!hasPasted && !hasNotes && !hasImages) {
    throw new Error('붙여넣은 내용·메모·이미지 중 하나는 필요합니다. (페이지 내용은 최소 50자)');
  }

  // Vision은 gpt-4o-mini / gpt-4o / gpt-4.1-mini / gpt-4.1 모두 지원
  const visionModel = model;

  const pageContent = hasPasted ? truncate(pastedText) : '(페이지 내용 없음)';
  const notesContent = hasNotes ? truncate(userNotes, 8000) : '';
  const contentLength = (pastedText?.length || 0) + (userNotes?.length || 0);

  const systemPrompt = `당신은 이커머스 상품 페이지 분석 전문가입니다.
사용자가 제공한 자료에서만 정보를 추출합니다. 추측·창작·일반상식 보충은 절대 금지합니다.

자료 구분:
[A] 크롤링 자료 (1688/타오바오/쿠팡 등에서 복사한 페이지 텍스트 + 첨부 이미지) — 객관적 사실 자료
[B] 사용자 메모 — 사용자가 직접 작성한 추가 정보/요구사항 (최우선 자료)

🔑 우선순위 규칙:
- **[B] 사용자 메모가 [A] 크롤링 자료보다 항상 우선합니다.** 충돌 시 무조건 [B]를 따릅니다.
- [B]에 명시된 사실은 그대로 반영하고, [B]에 없는 정보만 [A]에서 보충합니다.

🚫 절대 금지 — "추측해서 채우지 마세요":
- [A]·[B] 어디에도 **명시적으로 등장하지 않는 정보**는 무조건 빈 문자열("")이나 빈 배열([])로 둡니다.
- "이런 제품이면 보통 이럴 것이다"는 식의 일반화·추론·창작은 절대 금지입니다.
- 예시: 메모에 강점이 1개만 적혔다면 strengths는 그 1개만 채우고 나머지 2개 칸은 ""로 비워두세요. 억지로 3개를 만들지 마세요.
- 예시: 리뷰가 자료에 없으면 reviews는 빈 배열 []로 두세요. 가짜 리뷰를 만들지 마세요.
- 예시: FAQ가 자료에 없으면 faqs는 빈 배열 []로 두세요. 일반적인 FAQ를 만들지 마세요.
- 예시: 차별점이 자료에 없으면 differences·generalProductFeatures는 빈 배열 []로 두세요.
- **불확실하면 무조건 비워두세요.** 사용자가 나중에 직접 채우거나 다른 기능(빈 칸 채우기)으로 보충합니다.

이미지 분석 규칙(이미지가 첨부된 경우만):
- 이미지 안에 실제로 적힌 글씨(중국어/영어/한국어)만 OCR로 읽어 한국어로 번역합니다.
- 이미지에 명시된 사이즈/스펙 수치만 활용합니다. 없으면 비워둡니다.

기타 규칙:
- 결과는 반드시 한국어로 작성합니다.
- 과장/허위 표현 금지.
- 리뷰 본문(reviews[].body)은 반드시 65자 이내.
- 차별점(differences/generalProductFeatures)은 일반 제품 vs 내 제품 짝 형태로 작성하되 자료에 명시된 것만.
- 아래 JSON 스키마를 따라 단일 JSON 객체만 반환합니다. 코드 펜스 금지.

스키마:
{
  "productName": "한국어 상품명 (핵심 키워드 중심, 30자 이내)",
  "productType": "청소도구형|수납형|욕실/위생형|주방정리형|소모품형|생활보조형|인테리어소품형 중 가장 가까운 하나 (불확실하면 빈 문자열)",
  "strengths": ["강점1", "강점2", "강점3"],
  "targetCustomers": ["주 고객층1 (한 문장)", "주 고객층2", "주 고객층3"],
  "material": "소재 (없으면 빈 문자열)",
  "sizeSpec": "사이즈/스펙 (cm, L, kg 등 구체 수치 포함)",
  "color": "색상",
  "modelName": "모델명",
  "photoTypes": "페이지에서 확인된 사진 종류",
  "generalProductName": "비교 대상 일반 제품 이름 (예: 일반 유리 꽃병)",
  "differences": ["내 제품 차별점1", "내 제품 차별점2", "내 제품 차별점3", "내 제품 차별점4"],
  "generalProductFeatures": ["일반 제품 모습1", "일반 제품 모습2", "일반 제품 모습3", "일반 제품 모습4"],
  "usages": ["활용법1", "..."],
  "usageSteps": ["사용 1단계", "사용 2단계", "사용 3단계"],
  "faqs": [{"q": "질문1", "a": "답변1"}, ...최대 5개],
  "reviews": [{"nickname": "닉네임", "date": "2024-MM-DD", "body": "후기 (65자 이내)"}, ...최대 4개],
  "extraNotes": "기타 참고 사항 (브랜드/원산지/인증 등)"
}`;

  const textBlock = `${hasNotes ? `## [B] 🔑 사용자 메모 (최우선 — 반드시 이걸 따르세요)
--- 메모 시작 ---
${notesContent}
--- 메모 끝 ---

` : ''}## [A] 크롤링 자료 — 페이지 텍스트${hasImages ? ` + 첨부 이미지 ${validImages.length}장` : ''}
${hasPasted ? `--- 페이지 텍스트 시작 ---
${pageContent}
--- 페이지 텍스트 끝 ---
` : '(페이지 텍스트 없음)'}
${hasImages ? `\n첨부 이미지 ${validImages.length}장도 [A] 자료의 일부입니다. 이미지에 적힌 글씨(중국어 포함)를 OCR로 읽어 활용하세요.\n` : ''}
🚫 위 [A]·[B] 자료에 **명시적으로 등장하지 않는 정보**는 절대 추측해서 채우지 마세요. 모르면 빈 문자열("")·빈 배열([])로 두세요.
${hasNotes ? '🔑 **사용자 메모([B])가 무조건 우선**입니다. ' : ''}리뷰 본문은 65자 이내, 차별점은 자료에 있는 것만 짝 형태로 작성하세요. 스키마에 맞춰 JSON 반환.`;

  // Vision 호출: content를 멀티모달 배열로 구성 (OpenAI 전용)
  // 이미지가 없으면 통합 callAI 사용 (OpenAI/Claude/Gemini 모두 가능)
  let content;
  if (hasImages) {
    // ⚠️ Vision은 OpenAI 전용 — provider가 다르면 안내
    if (_provider !== 'openai') {
      throw new Error('이미지 OCR 분석은 OpenAI(GPT-4o) 전용 기능입니다. 텍스트만 붙여넣기 하거나 OpenAI 키로 전환하세요.');
    }
    const userContent = [
      { type: 'text', text: textBlock },
      ...validImages.map((url) => ({
        type: 'image_url',
        image_url: { url, detail: 'high' },
      })),
    ];
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API 오류 (${response.status}): ${errText}`);
    }
    const data = await response.json();
    content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI 응답이 비어있습니다.');
  } else {
    // 이미지 없는 텍스트 전용 — 통합 callAI 사용
    const result = await callAI({
      provider: _provider,
      apiKey,
      model,
      systemPrompt,
      userPrompt: textBlock,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 4000,
    });
    content = result.content;
  }

  try {
    const parsed = JSON.parse(content);
    // 리뷰 65자 컷
    if (Array.isArray(parsed.reviews)) {
      parsed.reviews = parsed.reviews.map((r) => ({
        ...r,
        body: typeof r?.body === 'string' && r.body.length > 65 ? r.body.slice(0, 65) : r?.body || '',
      }));
    }
    const sources = [];
    if (hasPasted) sources.push(`텍스트 ${pastedText.length.toLocaleString()}자`);
    if (hasNotes) sources.push(`메모 ${userNotes.length.toLocaleString()}자`);
    if (hasImages) sources.push(`이미지 ${validImages.length}장 OCR`);
    return {
      ...parsed,
      _source: sources.join(' + ') || '직접 붙여넣기',
      _attempts: sources,
      _contentLength: contentLength,
      _imageCount: validImages.length,
      _normalizeNote: '',
      _weakContent: false,
      _finalUrl: '',
    };
  } catch {
    throw new Error('AI 응답을 JSON으로 파싱할 수 없습니다.');
  }
}

/**
 * 크롤링한 자료(텍스트 + 이미지)를 분석해 쿠팡 검색 최적화용 추천 검색어 20개를 추출.
 */
export async function extractRecommendedKeywords({
  apiKey,
  model = 'gpt-4o-mini',
  provider,
  pastedText = '',
  userNotes = '',
  imageDataUrls = [],
  productName = '',
}) {
  const _provider = provider || detectProviderFromModel(model);
  if (!apiKey) throw new Error('AI API 키가 필요합니다.');
  const hasPasted = pastedText && pastedText.trim().length >= 50;
  const hasNotes = userNotes && userNotes.trim().length > 0;
  const validImages = (Array.isArray(imageDataUrls) ? imageDataUrls : []).filter(
    (u) => typeof u === 'string' && u.startsWith('data:image')
  ).slice(0, 8);
  const hasImages = validImages.length > 0;
  const hasName = !!productName?.trim();

  if (!hasPasted && !hasNotes && !hasImages && !hasName) {
    throw new Error('제품명·페이지 내용·메모·이미지 중 하나는 필요합니다.');
  }

  const pageContent = hasPasted ? truncate(pastedText) : '(없음)';
  const notesContent = hasNotes ? truncate(userNotes, 8000) : '';

  const systemPrompt = `당신은 쿠팡/네이버쇼핑 SEO 전문가입니다.
주어진 자료를 분석해 쿠팡 검색 최적화용 추천 검색어 20개를 뽑아주세요.

규칙:
- 한국어로 작성합니다 (중국어가 있으면 자연스러운 한국어로 변환).
- 실제 사용자가 검색할 만한 자연스러운 키워드만 작성 (브랜드명/모호한 단어 금지).
- 다음 4가지 유형을 골고루 섞어 20개를 뽑습니다:
  ① 핵심 단일 키워드 (1~2단어, 예: "유리꽃병")
  ② 카테고리+속성 조합 (2~3단어, 예: "프랑스 유리 꽃병", "북유럽 화병")
  ③ 용도/상황 키워드 (예: "결혼식 꽃병", "거실 인테리어 화병")
  ④ 롱테일 키워드 (4~6단어, 예: "투명 미니 유리 꽃병 인테리어")
- 검색량이 많을 만한 순서로 정렬 (인기 키워드 먼저).
- 중복 방지, 제품과 무관한 키워드 금지.
- 자료에 없는 정보는 추측하지 마세요. 자료에 명시된 속성·용도·소재 기반으로만 작성.

JSON 형식:
{
  "keywords": [
    { "rank": 1, "keyword": "검색어", "type": "핵심|조합|용도|롱테일" }
  ]
}
정확히 20개의 키워드를 반환합니다.`;

  const textBlock = `## 제품 정보
${hasName ? `제품명: ${productName}\n` : ''}
${hasNotes ? `## 사용자 메모
${notesContent}

` : ''}## 크롤링 자료
${hasPasted ? pageContent : '(텍스트 없음)'}
${hasImages ? `\n첨부 이미지 ${validImages.length}장 — 그림 속 글씨도 읽어 활용하세요.\n` : ''}
위 자료를 바탕으로 쿠팡 검색 최적화 키워드 20개를 JSON으로 반환하세요.`;

  // 이미지가 있으면 OpenAI Vision 직접 호출, 없으면 통합 callAI
  let content;
  if (hasImages) {
    if (_provider !== 'openai') {
      throw new Error('이미지 OCR 분석은 OpenAI(GPT-4o) 전용 기능입니다. 텍스트만 붙여넣기 하거나 OpenAI 키로 전환하세요.');
    }
    const userContent = [
      { type: 'text', text: textBlock },
      ...validImages.map((url) => ({ type: 'image_url', image_url: { url, detail: 'low' } })),
    ];
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
        max_tokens: 1500,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API 오류 (${response.status}): ${errText}`);
    }
    const data = await response.json();
    content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI 응답이 비어있습니다.');
  } else {
    const result = await callAI({
      provider: _provider,
      apiKey,
      model,
      systemPrompt,
      userPrompt: textBlock,
      responseFormat: 'json',
      temperature: 0.5,
      maxTokens: 1500,
    });
    content = result.content;
  }

  try {
    const parsed = JSON.parse(content);
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 20) : [];
    return { keywords };
  } catch {
    throw new Error('AI 응답을 JSON으로 파싱할 수 없습니다.');
  }
}

// ──────────────────────────────────────────────────────────────────
// 🔍 리뷰 분석 — 페인포인트/긍정포인트/타겟고객/키워드 + 마케팅 문구 자동생성
// ──────────────────────────────────────────────────────────────────
/**
 * 리뷰 텍스트 배열을 GPT 로 분석.
 *
 * @param {Object} options
 * @param {string} options.apiKey                 - OpenAI API 키
 * @param {string} [options.model]                - 기본 'gpt-4o-mini'
 * @param {string[]} options.reviews              - 리뷰 텍스트 배열 (각 1개 리뷰)
 * @param {string} [options.productName]          - 제품명 (있으면 분석 정확도 ↑)
 * @param {string} [options.productType]          - 제품 유형
 * @returns {Promise<{
 *   painPoints: { rank: number, title: string, desc: string, freq: string }[],
 *   positivePoints: { rank: number, title: string, desc: string, freq: string }[],
 *   targetCustomers: { who: string, when: string, purpose: string }[],
 *   keywords: { rank: number, keyword: string, count: number, category: string }[],
 *   headlines: { id: string, painPointTitle: string, headline: string, body: string }[],
 *   summary: string,
 * }>}
 */
export async function analyzeReviews({
  apiKey,
  model = 'gpt-4o-mini',
  provider,
  reviews = [],
  productName = '',
  productType = '',
}) {
  const _provider = provider || detectProviderFromModel(model);
  if (!apiKey) throw new Error('AI API 키가 필요합니다.');
  const valid = (reviews || [])
    .map((r) => (typeof r === 'string' ? r.trim() : ''))
    .filter((r) => r.length >= 5);
  if (valid.length < 3) {
    throw new Error('분석에 사용할 리뷰가 너무 적습니다 (최소 3개 이상).');
  }

  // 토큰 절약: 너무 많으면 앞 200개만 사용 (대표 샘플)
  const sample = valid.slice(0, 200);
  const totalCount = valid.length;
  const reviewsBlock = sample
    .map((r, i) => `${i + 1}. ${r.slice(0, 500)}`)
    .join('\n');

  const systemPrompt = `당신은 쿠팡/네이버쇼핑의 리뷰 분석 전문가입니다.
주어진 고객 리뷰들을 분석하여 다음 5가지를 JSON으로 추출합니다.

【규칙】
- 모든 출력은 한국어로 작성합니다.
- 추측 금지. 리뷰에 실제로 등장한 내용만 사용합니다.
- 빈도(많이 언급된 정도)를 기준으로 순위를 매깁니다.
- 짧고 마케팅에 바로 쓸 수 있는 문장으로 작성합니다.

【1. 페인포인트 (painPoints) Top 3】
고객들이 가장 불만을 느낀 요소 3가지.
- title: 짧은 핵심 문구 (예: "배송 중 파손")
- desc: 1~2 문장 설명 (예: "택배가 험하게 와서 깨졌다는 불만이 자주 등장")
- freq: 빈도 (예: "자주", "보통", "가끔")

【2. 긍정포인트 (positivePoints) Top 3】
고객들이 구매를 결정한 결정적인 이유 3가지.
- title, desc, freq: 위와 동일

【3. 타겟고객 (targetCustomers) Top 3】
실제 리뷰에서 추정 가능한 주요 구매층 3가지.
- who: 누가 (예: "자취생", "30대 워킹맘", "신혼부부")
- when: 언제/어떤 상황 (예: "이사 후", "선물용으로")
- purpose: 어떤 용도 (예: "거실 인테리어", "공부방 정리")

【4. 키워드 (keywords) Top 20】
리뷰에서 자주 등장하는 단어/문구 20개.
- keyword: 단어 또는 짧은 구 (예: "디자인", "포장 꼼꼼", "은은한 색감")
- count: 대략적인 등장 횟수 (정수)
- category: "장점" / "단점" / "용도" / "감성" / "기타"
- 빈도 내림차순으로 정렬.

【5. 마케팅 헤드라인 (headlines) 6~9개】
페인포인트 3가지를 해결한다는 메시지로, 각 페인포인트당 2~3개씩 강조 문구를 만드세요.
- id: 'h1', 'h2', 'h3', ...
- painPointTitle: 어떤 페인포인트를 해결하는지 (위 painPoints[i].title 과 일치)
- headline: 임팩트 있는 짧은 한 줄 (15자 이내, 예: "이번엔 안 깨집니다")
- body: 보충 설명 1~2 문장 (예: "3중 에어백 포장으로 배송 사고 0%")
- 톤: 자신감 있고 구체적 / 과장·허위 금지 / 비교광고 금지(타사 비방 X)

【6. 요약 (summary)】
전체 리뷰를 2~3 문장으로 요약. 어떤 제품인지·전반적 평가가 어떤지.

【출력 JSON 형식】
{
  "summary": "이 제품은 ...",
  "painPoints": [{"rank":1,"title":"...","desc":"...","freq":"자주"}],
  "positivePoints": [{"rank":1,"title":"...","desc":"...","freq":"자주"}],
  "targetCustomers": [{"who":"...","when":"...","purpose":"..."}],
  "keywords": [{"rank":1,"keyword":"...","count":12,"category":"장점"}],
  "headlines": [{"id":"h1","painPointTitle":"...","headline":"...","body":"..."}]
}
정확히 painPoints 3개, positivePoints 3개, targetCustomers 3개, keywords 20개, headlines 6~9개를 반환합니다.`;

  const userContent = `## 분석 대상 제품
제품명: ${productName || '(미입력)'}
제품 유형: ${productType || '(미입력)'}
총 수집된 리뷰 수: ${totalCount}개${totalCount > sample.length ? ` (분석 샘플 ${sample.length}개)` : ''}

## 고객 리뷰 ${sample.length}개
${reviewsBlock}

위 리뷰들을 분석해 JSON 으로 반환하세요.`;

  const { content } = await callAI({
    provider: _provider,
    apiKey,
    model,
    systemPrompt,
    userPrompt: userContent,
    responseFormat: 'json',
    temperature: 0.4,
    maxTokens: 4000,
  });

  try {
    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || '',
      painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints.slice(0, 3) : [],
      positivePoints: Array.isArray(parsed.positivePoints) ? parsed.positivePoints.slice(0, 3) : [],
      targetCustomers: Array.isArray(parsed.targetCustomers) ? parsed.targetCustomers.slice(0, 3) : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 20) : [],
      headlines: Array.isArray(parsed.headlines) ? parsed.headlines.slice(0, 12) : [],
      meta: { totalCount, analyzedCount: sample.length },
    };
  } catch {
    throw new Error('AI 응답을 JSON으로 파싱할 수 없습니다.');
  }
}
