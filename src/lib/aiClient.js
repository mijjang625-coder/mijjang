// 통합 AI 클라이언트 어댑터
// OpenAI / Anthropic (Claude) / Google (Gemini) 를 동일한 인터페이스로 호출
//
// 사용법:
//   const { content, usage } = await callAI({
//     provider: 'anthropic',
//     apiKey: 'sk-ant-...',
//     model: 'claude-3-5-haiku-20241022',
//     systemPrompt: '...',
//     userPrompt: '...',
//     responseFormat: 'json',  // 'json' | 'text'
//     temperature: 0.6,
//   });

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 사용 가능한 모델 목록 (사이드바 드롭다운용)
 * 비용 단위: USD per 1M tokens (입력/출력)
 */
export const AI_MODELS = {
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o-mini (빠르고 저렴)', input: 0.15, output: 0.60 },
    { id: 'gpt-4o', label: 'GPT-4o (고품질)', input: 2.50, output: 10.00 },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1-mini', input: 0.40, output: 1.60 },
    { id: 'gpt-4.1', label: 'GPT-4.1 (최고 품질)', input: 2.00, output: 8.00 },
  ],
  anthropic: [
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (빠름·균형)', input: 0.80, output: 4.00 },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (한국어 카피 최강) ⭐', input: 3.00, output: 15.00 },
    { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet (최신)', input: 3.00, output: 15.00 },
  ],
  google: [
    { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (가장 저렴) 💰', input: 0.10, output: 0.40 },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', input: 0.075, output: 0.30 },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', input: 1.25, output: 5.00 },
  ],
};

export const PROVIDER_LABELS = {
  openai: 'OpenAI (GPT)',
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
};

export const PROVIDER_KEY_PLACEHOLDERS = {
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  google: 'AIza...',
};

export const PROVIDER_KEY_DOCS = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
};

/**
 * 모델 ID 로 provider 자동 감지 (역호환 — 구버전 코드가 model만 넘길 때)
 */
export function detectProviderFromModel(modelId) {
  if (!modelId) return 'openai';
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gemini-')) return 'google';
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.startsWith('o3-')) return 'openai';
  return 'openai'; // 기본값
}

/**
 * 통합 AI 호출 함수 — 모든 호출 지점에서 이 함수 하나만 사용
 *
 * @param {Object} opts
 * @param {string} opts.provider - 'openai' | 'anthropic' | 'google'
 * @param {string} opts.apiKey - 해당 제공자의 API 키
 * @param {string} opts.model - 모델 ID (예: 'gpt-4o-mini')
 * @param {string} opts.systemPrompt - 시스템 프롬프트
 * @param {string} opts.userPrompt - 사용자 프롬프트
 * @param {'json'|'text'} [opts.responseFormat='text'] - 응답 형식
 * @param {number} [opts.temperature=0.6] - 0~1
 * @param {number} [opts.maxTokens=4096] - 최대 출력 토큰
 *
 * @returns {Promise<{content: string, usage: {input: number, output: number}, raw: Object}>}
 */
export async function callAI({
  provider,
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  responseFormat = 'text',
  temperature = 0.6,
  maxTokens = 4096,
}) {
  if (!apiKey) {
    throw new Error(`${PROVIDER_LABELS[provider] || provider} API 키가 필요합니다.`);
  }
  if (!model) throw new Error('model이 필요합니다.');

  // provider 별 분기
  if (provider === 'openai') {
    return callOpenAI({ apiKey, model, systemPrompt, userPrompt, responseFormat, temperature, maxTokens });
  }
  if (provider === 'anthropic') {
    return callAnthropic({ apiKey, model, systemPrompt, userPrompt, responseFormat, temperature, maxTokens });
  }
  if (provider === 'google') {
    return callGoogle({ apiKey, model, systemPrompt, userPrompt, responseFormat, temperature, maxTokens });
  }
  throw new Error(`지원하지 않는 provider: ${provider}`);
}

// ─────────────────────────── OpenAI ───────────────────────────
async function callOpenAI({ apiKey, model, systemPrompt, userPrompt, responseFormat, temperature, maxTokens }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  };
  if (responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API 오류 (${res.status}): ${errText}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI 응답이 비어있습니다.');
  return {
    content,
    usage: {
      input: data?.usage?.prompt_tokens || 0,
      output: data?.usage?.completion_tokens || 0,
    },
    raw: data,
  };
}

// ─────────────────────────── Anthropic (Claude) ───────────────────────────
// Claude messages API: https://docs.anthropic.com/en/api/messages
// JSON 강제: 시스템 프롬프트에 "단일 JSON 오브젝트만 반환" 명시 + 응답에서 JSON 추출
async function callAnthropic({ apiKey, model, systemPrompt, userPrompt, responseFormat, temperature, maxTokens }) {
  // JSON 응답 형식이면 시스템 프롬프트에 강제 안내 추가
  let finalSystem = systemPrompt;
  if (responseFormat === 'json') {
    finalSystem = `${systemPrompt}\n\n⚠️ CRITICAL: 응답은 반드시 단일 JSON 오브젝트(코드 펜스 없이)로만 반환하세요. 다른 설명/주석/문구 절대 금지. 응답 시작은 { 로 끝은 } 로 끝나야 합니다.`;
  }

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: finalSystem,
    messages: [{ role: 'user', content: userPrompt }],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // 브라우저에서 Claude 직접 호출 시 필요 (CORS)
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API 오류 (${res.status}): ${errText}`);
  }
  const data = await res.json();
  let content = data?.content?.[0]?.text;
  if (!content) throw new Error('Claude 응답이 비어있습니다.');

  // JSON 응답인 경우, 혹시 모를 코드 펜스/앞뒤 텍스트 제거
  if (responseFormat === 'json') {
    content = extractJsonFromText(content);
  }

  return {
    content,
    usage: {
      input: data?.usage?.input_tokens || 0,
      output: data?.usage?.output_tokens || 0,
    },
    raw: data,
  };
}

// ─────────────────────────── Google (Gemini) ───────────────────────────
// Gemini API: https://ai.google.dev/api/generate-content
async function callGoogle({ apiKey, model, systemPrompt, userPrompt, responseFormat, temperature, maxTokens }) {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };
  if (responseFormat === 'json') {
    body.generationConfig.responseMimeType = 'application/json';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API 오류 (${res.status}): ${errText}`);
  }
  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Gemini 응답이 비어있습니다.');
  return {
    content,
    usage: {
      input: data?.usageMetadata?.promptTokenCount || 0,
      output: data?.usageMetadata?.candidatesTokenCount || 0,
    },
    raw: data,
  };
}

// ─────────────────────────── 유틸 ───────────────────────────
/**
 * 응답에서 JSON 부분만 추출 (Claude가 가끔 ```json ... ``` 으로 감싸는 경우 대비)
 */
function extractJsonFromText(text) {
  if (!text) return text;
  // 1) 코드 펜스 제거
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // 2) 첫 { ~ 마지막 } 추출
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return s.substring(firstBrace, lastBrace + 1);
  }
  return s;
}

/**
 * 비용 계산 헬퍼 (USD)
 */
export function calculateCost(provider, model, usage) {
  const models = AI_MODELS[provider] || [];
  const modelInfo = models.find((m) => m.id === model);
  if (!modelInfo || !usage) return 0;
  const inputCost = (usage.input / 1_000_000) * modelInfo.input;
  const outputCost = (usage.output / 1_000_000) * modelInfo.output;
  return inputCost + outputCost;
}
