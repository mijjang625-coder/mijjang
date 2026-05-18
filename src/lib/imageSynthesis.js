/**
 * imageSynthesis.js — AI 사진 합성 라이브러리
 *
 * 청소솔/생활용품 등 단품 사진 + AI 합성으로 다양한 연출컷 생성
 *
 * 4가지 모드:
 *   1. background    — 배경만 교체 (욕실/주방/베란다/자동차/거실/직접입력)
 *   2. usage         — 사용 장면 합성 (실제로 사용하는 모습)
 *   3. beforeAfter   — Before / After 한 쌍 생성 (더러운→깨끗한)
 *   4. handHeld      — 손에 쥔 모습 (그립감/사이즈감 강조)
 *
 * 지원 모델:
 *   - nano-banana-2  : fal.ai Nano Banana 2 (추천, 가성비)
 *   - nano-banana-pro: fal.ai Nano Banana Pro (최고 품질)
 *   - gpt-image-2    : OpenAI GPT Image 2 via fal.ai (최신, 고품질)
 *   - openai         : OpenAI gpt-image-1 직접 호출 (저렴)
 *
 * Returns: { url: 'data:image/png;base64,...', prompt: '...' }
 */

const OPENAI_IMAGE_EDIT_URL = 'https://api.openai.com/v1/images/edits';
const OPENAI_IMAGE_GEN_URL = 'https://api.openai.com/v1/images/generations';

// fal.ai 모델별 엔드포인트 (queue API)
// queue.fal.run/{model-id} 로 POST 후 status_url / response_url 폴링
const FAL_QUEUE_BASE = 'https://queue.fal.run';
const FAL_MODELS = {
  'gpt-image-2': {
    edit: 'openai/gpt-image-2/edit',
    generate: 'fal-ai/gpt-image-2',     // text-to-image (사진 없을 때)
    label: '🆕 GPT Image 2 (최신 · 최고)',
    cost: '약 160~300원/장',
    quality: '⭐⭐⭐⭐⭐',
    badge: 'NEW',
    keyType: 'fal',                     // fal.ai 키 사용 (BYOK 방식)
    description: 'OpenAI 최신 모델. fal.ai 키 + OpenAI 키 둘 다 필요 (BYOK)',
  },
  'nano-banana-2': {
    edit: 'fal-ai/nano-banana-2/edit',
    generate: 'fal-ai/nano-banana-2',
    label: '🍌 Nano Banana 2 (추천)',
    cost: '약 110원/장',
    quality: '⭐⭐⭐⭐½',
    keyType: 'fal',
    description: '빠르고 가성비 최고. 제품 배경 교체에 최적',
  },
  'nano-banana-pro': {
    edit: 'fal-ai/nano-banana-pro/edit',
    generate: 'fal-ai/nano-banana-pro',
    label: '🍌 Nano Banana Pro (고품질)',
    cost: '약 195원/장',
    quality: '⭐⭐⭐⭐⭐',
    keyType: 'fal',
    description: '제품 디테일 보존 우수. 프리미엄 연출에 적합',
  },
  'openai': {
    edit: null, // OpenAI 직접 호출 — 별도 함수 사용
    generate: null,
    label: '🤖 GPT Image 1 (저렴)',
    cost: '약 55원/장',
    quality: '⭐⭐⭐',
    keyType: 'openai',
    description: 'OpenAI gpt-image-1 직접 호출. 가장 저렴',
  },
};

export const SYNTHESIS_MODELS = FAL_MODELS;

// ─────────────────────────────────────────────────────────────
// 배경 프리셋 — 청소솔/생활용품 특화
// ─────────────────────────────────────────────────────────────
export const BACKGROUND_PRESETS = {
  bathroom: {
    label: '🚿 욕실',
    description: 'clean modern bathroom with white tiles, soft natural light from window, minimal styling',
  },
  kitchen: {
    label: '🍳 주방',
    description: 'clean modern kitchen counter with stainless steel sink, natural daylight, minimalist style',
  },
  veranda: {
    label: '🌿 베란다',
    description: 'sunny veranda with light gray tiles, plants in the background, warm natural light',
  },
  car: {
    label: '🚗 자동차',
    description: 'car interior or wheel area, automotive cleaning context, realistic outdoor lighting',
  },
  living: {
    label: '🏠 거실',
    description: 'cozy living room with wooden floor and warm lighting, lifestyle setting',
  },
  studio: {
    label: '⚪ 화이트 스튜디오',
    description: 'pure white seamless studio background, soft even lighting, professional product photography',
  },
  beige: {
    label: '🟤 베이지 스튜디오',
    description: 'soft beige seamless studio background, warm lighting, premium product photography',
  },
  outdoor: {
    label: '🌳 야외',
    description: 'outdoor garden or balcony setting, natural daylight, fresh and clean atmosphere',
  },
};

// ─────────────────────────────────────────────────────────────
// 분위기 프리셋
// ─────────────────────────────────────────────────────────────
export const MOOD_PRESETS = {
  clean: { label: '깔끔한', prompt: 'clean, minimal, bright, fresh atmosphere' },
  warm: { label: '따뜻한', prompt: 'warm, cozy, inviting, soft golden light' },
  modern: { label: '모던한', prompt: 'modern, sleek, sophisticated, premium feel' },
  natural: { label: '자연스러운', prompt: 'natural, lifestyle, candid, everyday feeling' },
};

// ─────────────────────────────────────────────────────────────
// 제품 일관성 가드 — 범용 버전 (모든 제품 카테고리 대응)
// ─────────────────────────────────────────────────────────────
const IDENTITY_GUARD = [
  'CRITICAL: The product in the output MUST be VISUALLY IDENTICAL to the product shown in the reference image.',
  'Preserve the EXACT shape, silhouette, color, surface texture, material finish, design details, logo, label, and proportions — do NOT redesign, replace, or reinterpret the product in any way.',
  'Do NOT substitute the product with a different object. Do NOT change the product category.',
  'The reference image defines the product precisely — only the background, environment, lighting, and staging may change.',
].join(' ');

const QUALITY_TAIL = [
  'Photorealistic, commercial-grade product photography, sharp focus on the product, fine surface detail, accurate color reproduction, soft realistic shadow grounding the product, 4K detail, no text overlays, no watermarks.',
].join(' ');

// ─────────────────────────────────────────────────────────────
// 모드별 프롬프트 빌더
// ─────────────────────────────────────────────────────────────
function buildPrompt({ mode, productName, backgroundKey, customBackground, moodKey, extraNote }) {
  // productName이 없거나 너무 일반적이면 "reference image의 제품"으로 처리
  // → 모델이 productName을 상상해서 엉뚱한 제품을 만드는 것을 방지
  const product = productName?.trim()
    ? `the product shown in the reference image (${productName.trim()})`
    : 'the product shown in the reference image';
  const bg = backgroundKey === 'custom'
    ? (customBackground?.trim() || 'a clean neutral background')
    : (BACKGROUND_PRESETS[backgroundKey]?.description || BACKGROUND_PRESETS.studio.description);
  const mood = MOOD_PRESETS[moodKey]?.prompt || MOOD_PRESETS.clean.prompt;
  const extra = extraNote?.trim() ? ` Additional instruction: ${extraNote.trim()}.` : '';

  switch (mode) {
    case 'background':
      return [
        `Task: This is an image editing task. Keep the product EXACTLY as it appears in the reference image — do NOT replace or change the product in any way.`,
        `ONLY change the background environment to: ${bg}.`,
        IDENTITY_GUARD,
        `Position the product naturally in the new environment with a realistic shadow. Mood: ${mood}.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');

    case 'usage':
      return [
        `Task: Create a lifestyle photo showing ${product} being actively used in ${bg}.`,
        IDENTITY_GUARD,
        `Add realistic human hands holding and using the product naturally. The hands should look clean, natural, and well-lit with realistic skin tone.`,
        `Mood: ${mood}.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');

    case 'handHeld':
      return [
        `Task: Create a close-up photo of a human hand holding ${product} in ${bg}.`,
        IDENTITY_GUARD,
        `Show a confident, natural grip. Shallow depth of field with the product in sharp focus. Emphasize the product's size and ergonomics.`,
        `Mood: ${mood}.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');

    case 'beforeBefore':
      return [
        `Task: Create a "BEFORE cleaning" lifestyle photo set in ${bg}.`,
        `Show a visibly dirty surface with realistic grime or buildup. ${product} is placed nearby, ready to be used.`,
        IDENTITY_GUARD,
        `Lighting should be clear and honest, showing the dirt realistically.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');

    case 'beforeAfter':
      return [
        `Task: Create an "AFTER cleaning" lifestyle photo set in ${bg}.`,
        `The surface is sparkling clean and shiny. ${product} is featured prominently as the tool that achieved this result.`,
        IDENTITY_GUARD,
        `Mood: ${mood}, fresh and bright lighting.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');

    case 'multiAngle':
      return [
        `Task: Show ${product} from a different camera angle than the reference image, in ${bg}.`,
        IDENTITY_GUARD,
        `Only the camera angle changes. The product itself must remain identical in every detail.`,
        `Mood: ${mood}.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');

    default:
      return [
        `Task: Photorealistic product photography of ${product} in ${bg}.`,
        IDENTITY_GUARD,
        `Mood: ${mood}.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');
  }
}

// ─────────────────────────────────────────────────────────────
// dataURL → File 변환 (FormData 전송용)
// ─────────────────────────────────────────────────────────────
async function dataUrlToFile(dataUrl, filename = 'image.png') {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  // gpt-image-1은 png/jpg/webp 지원. 일단 그대로 전달.
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return new File([blob], filename.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type || 'image/png' });
}

// ─────────────────────────────────────────────────────────────
// OpenAI 이미지 편집 API 호출 (단품 사진 있을 때)
// ─────────────────────────────────────────────────────────────
async function callImageEdit({ apiKey, prompt, sourceImageDataUrl, size = '1024x1024' }) {
  const file = await dataUrlToFile(sourceImageDataUrl, 'source');
  const fd = new FormData();
  fd.append('model', 'gpt-image-1');
  fd.append('image', file);
  fd.append('prompt', prompt);
  fd.append('size', size);
  fd.append('n', '1');
  // gpt-image-1은 항상 base64 응답 (response_format 파라미터 받지 않음)

  const res = await fetch(OPENAI_IMAGE_EDIT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = errText;
    try {
      const j = JSON.parse(errText);
      msg = j?.error?.message || errText;
    } catch (_) {}
    throw new Error(`OpenAI 이미지 API 오류 (${res.status}): ${msg}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('이미지 응답이 비어 있습니다.');
  return `data:image/png;base64,${b64}`;
}

// ─────────────────────────────────────────────────────────────
// OpenAI 이미지 생성 API 호출 (단품 사진 없을 때 — 폴백)
// ─────────────────────────────────────────────────────────────
async function callImageGen({ apiKey, prompt, size = '1024x1024' }) {
  const res = await fetch(OPENAI_IMAGE_GEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size,
      n: 1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = errText;
    try {
      const j = JSON.parse(errText);
      msg = j?.error?.message || errText;
    } catch (_) {}
    throw new Error(`OpenAI 이미지 API 오류 (${res.status}): ${msg}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('이미지 응답이 비어 있습니다.');
  return `data:image/png;base64,${b64}`;
}

// ─────────────────────────────────────────────────────────────
// fal.ai 호출 (queue 기반: submit → polling → result)
// ─────────────────────────────────────────────────────────────

async function falSubmit({ apiKey, modelPath, input }) {
  const res = await fetch(`${FAL_QUEUE_BASE}/${modelPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errText = await res.text();
    let msg = errText;
    try {
      const j = JSON.parse(errText);
      msg = j?.detail || j?.error || errText;
    } catch (_) {}
    throw new Error(`fal.ai 요청 오류 (${res.status}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  const data = await res.json();
  // { request_id, status_url, response_url, ... }
  return data;
}

async function falPollResult({ apiKey, statusUrl, responseUrl, maxWaitMs = 120000, intervalMs = 1500 }) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`fal.ai 상태 조회 오류 (${res.status}): ${errText}`);
    }
    const status = await res.json();
    if (status?.status === 'COMPLETED') {
      // 결과 가져오기
      const r = await fetch(responseUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`fal.ai 결과 조회 오류 (${r.status}): ${errText}`);
      }
      return r.json();
    }
    if (status?.status === 'FAILED' || status?.status === 'ERROR') {
      throw new Error(`fal.ai 생성 실패: ${JSON.stringify(status)}`);
    }
    // IN_QUEUE / IN_PROGRESS
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('fal.ai 응답 시간 초과 (2분)');
}

// 외부 이미지 URL을 data URL로 변환 (CORS 안전한 fetch)
async function urlToDataUrl(url) {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─────────────────────────────────────────────────────────────
// size 문자열 → 각 모델용 파라미터 변환 헬퍼
// ─────────────────────────────────────────────────────────────

/** Nano Banana 계열: aspect_ratio 문자열 */
function sizeToAspectRatio(size) {
  if (size === '1024x1536') return '2:3';
  if (size === '1536x1024') return '3:2';
  return '1:1';
}

/** GPT Image 2: image_size 프리셋 or { width, height } */
function sizeToGptImage2Size(size) {
  if (size === '1024x1536') return 'portrait_4_3';   // 768×1024 (세로형)
  if (size === '1536x1024') return 'landscape_4_3';  // 1024×768 (가로형)
  return 'square_hd';                                // 1024×1024
}

// ─────────────────────────────────────────────────────────────
// fal.ai 이미지 편집 호출
// ─────────────────────────────────────────────────────────────
//
// GPT Image 2 (openai/gpt-image-2/edit) 특이사항:
//   - BYOK 방식: openai_api_key 파라미터 필수 (fal 키 + OpenAI 키 둘 다 필요)
//   - sync_mode: true → 즉시 data URI 반환, 폴링 불필요 (훨씬 빠름)
//   - image_size: 'auto' → 입력 이미지 크기 자동 유지
// ─────────────────────────────────────────────────────────────
async function callFalEdit({ falApiKey, openaiApiKey, modelKey, prompt, sourceImageDataUrl, size = '1024x1024' }) {
  const modelPath = FAL_MODELS[modelKey]?.edit;
  if (!modelPath) throw new Error(`fal.ai 모델 경로 없음: ${modelKey}`);

  if (modelKey === 'gpt-image-2') {
    // ── GPT Image 2: sync_mode로 즉시 응답 (폴링 없음) ──
    if (!openaiApiKey?.trim()) {
      throw new Error('GPT Image 2는 OpenAI API 키도 필요합니다. 사이드바에서 OpenAI API Key를 입력해 주세요.');
    }

    const input = {
      prompt,
      image_urls: [sourceImageDataUrl],
      image_size: sizeToGptImage2Size(size),
      quality: 'high',
      num_images: 1,
      output_format: 'png',
      sync_mode: true,           // 즉시 data URI 반환 → 폴링 불필요
      openai_api_key: openaiApiKey.trim(), // BYOK 필수
    };

    // sync_mode=true → queue 아닌 직접 호출 (fal.run)
    const res = await fetch(`https://fal.run/${modelPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        const j = JSON.parse(errText);
        msg = j?.detail || j?.error?.message || j?.error || errText;
      } catch (_) {}
      throw new Error(`GPT Image 2 오류 (${res.status}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    }

    const data = await res.json();
    const imgUrl = data?.images?.[0]?.url;
    if (!imgUrl) throw new Error('GPT Image 2 응답이 비어 있습니다.');

    // sync_mode=true → url이 이미 data URI 또는 fal CDN URL
    return imgUrl.startsWith('data:') ? imgUrl : urlToDataUrl(imgUrl);
  }

  // ── Nano Banana 계열: queue 기반 폴링 ──
  const input = {
    prompt,
    image_urls: [sourceImageDataUrl],
    num_images: 1,
    aspect_ratio: sizeToAspectRatio(size),
    output_format: 'png',
    resolution: '1K',
  };

  const submitted = await falSubmit({ apiKey: falApiKey, modelPath, input });
  const result = await falPollResult({
    apiKey: falApiKey,
    statusUrl: submitted.status_url,
    responseUrl: submitted.response_url,
    maxWaitMs: 120000,
  });

  const imgUrl = result?.images?.[0]?.url;
  if (!imgUrl) throw new Error('fal.ai 이미지 응답이 비어 있습니다.');
  return urlToDataUrl(imgUrl);
}

// ─────────────────────────────────────────────────────────────
// fal.ai 이미지 생성 (기준 사진 없을 때 — 폴백)
// ─────────────────────────────────────────────────────────────
async function callFalGen({ falApiKey, openaiApiKey, modelKey, prompt, size = '1024x1024' }) {
  const modelPath = FAL_MODELS[modelKey]?.generate;
  if (!modelPath) throw new Error(`fal.ai 모델 경로 없음: ${modelKey}`);

  if (modelKey === 'gpt-image-2') {
    // sync_mode로 즉시 응답
    if (!openaiApiKey?.trim()) {
      throw new Error('GPT Image 2는 OpenAI API 키도 필요합니다.');
    }
    const input = {
      prompt,
      image_size: sizeToGptImage2Size(size),
      quality: 'high',
      num_images: 1,
      output_format: 'png',
      sync_mode: true,
      openai_api_key: openaiApiKey.trim(),
    };
    const res = await fetch(`https://fal.run/${modelPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try { const j = JSON.parse(errText); msg = j?.detail || j?.error?.message || errText; } catch (_) {}
      throw new Error(`GPT Image 2 생성 오류 (${res.status}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    }
    const data = await res.json();
    const imgUrl = data?.images?.[0]?.url;
    if (!imgUrl) throw new Error('GPT Image 2 응답이 비어 있습니다.');
    return imgUrl.startsWith('data:') ? imgUrl : urlToDataUrl(imgUrl);
  }

  // Nano Banana 계열
  const input = {
      prompt,
      num_images: 1,
      aspect_ratio: sizeToAspectRatio(size),
      output_format: 'png',
      resolution: '1K',
    };

  const submitted = await falSubmit({ apiKey: falApiKey, modelPath, input });
  const result = await falPollResult({
    apiKey: falApiKey,
    statusUrl: submitted.status_url,
    responseUrl: submitted.response_url,
    maxWaitMs: 120000,
  });

  const imgUrl = result?.images?.[0]?.url;
  if (!imgUrl) throw new Error('fal.ai 이미지 응답이 비어 있습니다.');
  return urlToDataUrl(imgUrl);
}

// ─────────────────────────────────────────────────────────────
// 외부 노출 API
// ─────────────────────────────────────────────────────────────

/**
 * 단일 이미지 합성
 *
 * @param {Object} opts
 * @param {string} opts.apiKey       OpenAI API 키 (provider='openai'일 때)
 * @param {string} opts.falApiKey    fal.ai API 키 (provider='fal'일 때)
 * @param {string} opts.provider     'openai' | 'fal' (기본: 'fal')
 * @param {string} opts.modelKey     'nano-banana-2' | 'nano-banana-pro' | 'openai' (기본: 'nano-banana-2')
 * @param {string} opts.mode         'background' | 'usage' | 'handHeld' | 'beforeAfter' | 'multiAngle'
 * @param {string} opts.productName  제품명 (예: "욕실 청소솔")
 * @param {string} opts.backgroundKey 'bathroom' | 'kitchen' | ... | 'custom'
 * @param {string} opts.customBackground 'custom' 일 때 사용자 입력 텍스트
 * @param {string} opts.moodKey      'clean' | 'warm' | 'modern' | 'natural'
 * @param {string} opts.extraNote    추가 지시사항 (선택)
 * @param {string} opts.sourceImageDataUrl  기준 사진 (data URL). 있으면 edit, 없으면 generation.
 * @param {string} opts.size         '1024x1024' | '1024x1536' | '1536x1024'
 * @returns {Promise<{url: string, prompt: string}>}
 */
export async function synthesizeImage(opts) {
  const {
    apiKey,
    falApiKey,
    provider = 'fal',
    modelKey = 'nano-banana-2',
    mode,
    productName,
    backgroundKey,
    customBackground,
    moodKey,
    extraNote,
    sourceImageDataUrl,
    size = '1024x1024',
    directPrompt,   // ← 이 값이 있으면 buildPrompt 없이 그대로 사용
  } = opts;

  // directPrompt가 있으면 프롬프트 변환 없이 사용자 입력을 그대로 전달
  // (GPT Image 2 자유 모드 — ChatGPT처럼 자연어 직접 전달)
  const prompt = directPrompt?.trim()
    ? directPrompt.trim()
    : (() => {
        if (!mode) throw new Error('합성 모드를 선택해 주세요.');
        return buildPrompt({ mode, productName, backgroundKey, customBackground, moodKey, extraNote });
      })();

  let url;

  const modelInfo = FAL_MODELS[modelKey];
  const isFalModel = modelInfo?.keyType === 'fal'; // gpt-image-2, nano-banana-2, nano-banana-pro

  if (isFalModel) {
    // ── fal.ai 경유 모델 (GPT Image 2 포함) ──
    if (!falApiKey) throw new Error('fal.ai API 키가 필요합니다. 사이드바에서 입력해 주세요.');
    if (sourceImageDataUrl) {
      url = await callFalEdit({ falApiKey, openaiApiKey: apiKey, modelKey, prompt, sourceImageDataUrl, size });
    } else {
      url = await callFalGen({ falApiKey, openaiApiKey: apiKey, modelKey, prompt, size });
    }
  } else {
    // ── OpenAI 직접 호출 (gpt-image-1) ──
    if (!apiKey) throw new Error('OpenAI API 키가 필요합니다.');
    if (sourceImageDataUrl) {
      url = await callImageEdit({ apiKey, prompt, sourceImageDataUrl, size });
    } else {
      url = await callImageGen({ apiKey, prompt, size });
    }
  }

  return { url, prompt };
}

/**
 * 여러 컷 동시 생성 (병렬 호출)
 *
 * Before/After 모드는 자동으로 [beforeBefore, beforeAfter] 한 쌍을 생성.
 *
 * @returns {Promise<Array<{url, prompt}>>}
 */
export async function synthesizeBatch(opts) {
  const { mode, count = 1 } = opts;

  // Before/After 모드: 강제로 2장 (Before + After)
  if (mode === 'beforeAfter') {
    const promises = [
      synthesizeImage({ ...opts, mode: 'beforeBefore' }),
      synthesizeImage({ ...opts, mode: 'beforeAfter' }),
    ];
    return Promise.all(promises);
  }

  // 다중 컷 모드 (multiAngle)
  if (mode === 'multiAngle' && count > 1) {
    // 다양성을 위해 각 호출에 angle 변형 추가
    const angles = [
      'front view',
      'side view',
      'top-down view',
      '45-degree three-quarter angle',
    ];
    const promises = [];
    for (let i = 0; i < count; i += 1) {
      const angleNote = angles[i % angles.length];
      promises.push(
        synthesizeImage({
          ...opts,
          extraNote: `${opts.extraNote || ''} Specifically a ${angleNote} of the product.`,
        }),
      );
    }
    return Promise.all(promises);
  }

  // 일반 모드: 같은 프롬프트로 N장 (각각 약간 다르게 나옴)
  const promises = [];
  for (let i = 0; i < count; i += 1) {
    promises.push(synthesizeImage(opts));
  }
  return Promise.all(promises);
}
