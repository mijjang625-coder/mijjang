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
 * OpenAI Images API 사용:
 *   - 단품 사진이 있을 때: /v1/images/edits (gpt-image-1)
 *   - 단품 사진이 없을 때: /v1/images/generations (gpt-image-1)
 *
 * Returns: { url: 'data:image/png;base64,...', prompt: '...' }
 */

const OPENAI_IMAGE_EDIT_URL = 'https://api.openai.com/v1/images/edits';
const OPENAI_IMAGE_GEN_URL = 'https://api.openai.com/v1/images/generations';

// fal.ai 모델별 엔드포인트 (queue API)
// queue.fal.run/{model-id} 로 POST 후 status_url / response_url 폴링
const FAL_QUEUE_BASE = 'https://queue.fal.run';
const FAL_MODELS = {
  'nano-banana-2': {
    edit: 'fal-ai/nano-banana-2/edit',
    generate: 'fal-ai/nano-banana-2',
    label: '🍌 Nano Banana 2 (추천)',
    cost: '약 110원/장',
    quality: '⭐⭐⭐⭐½',
  },
  'nano-banana-pro': {
    edit: 'fal-ai/nano-banana-pro/edit',
    generate: 'fal-ai/nano-banana-pro',
    label: '🍌 Nano Banana Pro (최고 품질)',
    cost: '약 195원/장',
    quality: '⭐⭐⭐⭐⭐',
  },
  'openai': {
    edit: null, // OpenAI는 별도 함수 사용
    generate: null,
    label: '🤖 OpenAI gpt-image-1 (저렴)',
    cost: '약 55원/장',
    quality: '⭐⭐⭐',
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
// 제품 일관성을 강제하는 공통 가드 문구
// (gpt-image-1 이 reference image 의 디테일을 최대한 보존하도록)
// ─────────────────────────────────────────────────────────────
const IDENTITY_GUARD = [
  'CRITICAL: The product in the output MUST be IDENTICAL to the reference image.',
  'Preserve the exact shape, silhouette, color hue, surface texture, material, bristle pattern, handle design, logo, label text, and proportions of the reference product — pixel-faithful, no modification, no redesign, no stylization.',
  'Do NOT invent new colors, do NOT redesign the bristles or handle, do NOT change the brand markings.',
  'The reference image shows the EXACT product to be used — only the surrounding environment, lighting, and pose may change.',
].join(' ');

const QUALITY_TAIL = [
  'Photorealistic, commercial-grade product photography, sharp focus on the product, fine surface detail, accurate color reproduction, soft realistic shadow grounding the product, 4K detail, no text overlays, no watermarks, no fake brand logos.',
].join(' ');

// ─────────────────────────────────────────────────────────────
// 모드별 프롬프트 빌더
// ─────────────────────────────────────────────────────────────
function buildPrompt({ mode, productName, backgroundKey, customBackground, moodKey, extraNote }) {
  const product = productName?.trim() || 'the product shown in the reference image';
  const bg = backgroundKey === 'custom'
    ? (customBackground?.trim() || 'a clean neutral background')
    : (BACKGROUND_PRESETS[backgroundKey]?.description || BACKGROUND_PRESETS.studio.description);
  const mood = MOOD_PRESETS[moodKey]?.prompt || MOOD_PRESETS.clean.prompt;
  const extra = extraNote?.trim() ? ` Additional instruction: ${extraNote.trim()}.` : '';

  switch (mode) {
    case 'background':
      return [
        `Task: Replace ONLY the background of the reference image. Keep ${product} completely unchanged.`,
        IDENTITY_GUARD,
        `New environment: ${bg}.`,
        `Keep the product centered with realistic ground shadow that matches the new lighting direction.`,
        `Mood: ${mood}.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');

    case 'usage':
      return [
        `Task: Generate a photorealistic in-use lifestyle photo of ${product} being actively used by realistic human hands in ${bg}.`,
        IDENTITY_GUARD,
        `The hands should be holding the product naturally and using it for its intended purpose (e.g., scrubbing tiles, cleaning sink, wiping a surface). Show a visible cleaning interaction or contact with a surface.`,
        `Hands should look clean, natural, and well-lit. Realistic skin tone and texture.`,
        `Mood: ${mood}.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');

    case 'handHeld':
      return [
        `Task: A photorealistic close-up of a human hand holding ${product}, set in ${bg}.`,
        IDENTITY_GUARD,
        `Show a clean, natural-looking hand with a confident grip that emphasizes the product's size, ergonomics, and how it feels to hold. Soft shallow depth of field with the product in razor-sharp focus.`,
        `Mood: ${mood}.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');

    case 'beforeBefore':
      // Before 컷: 더러운 표면 (제품은 옆에 놓이거나 부분적으로 보임)
      return [
        `Task: A realistic "BEFORE cleaning" photo set in ${bg}. The dominant subject is a visibly dirty surface — show realistic grime, soap scum, water stains, mildew, dust, or buildup that genuinely looks like it needs to be cleaned.`,
        `${product} is placed neatly nearby (e.g., on the counter, in the corner) — ready to be used but NOT in active use yet.`,
        IDENTITY_GUARD,
        `Lighting should be clear and slightly cool, showing the dirt honestly.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');

    case 'beforeAfter':
      // After 컷: 깨끗하게 청소된 표면 + 제품
      return [
        `Task: A satisfying "AFTER cleaning" photo set in ${bg}. The surface is sparkling clean, shiny, and reflective — with subtle highlights and a fresh, bright atmosphere that conveys "wow, so clean".`,
        `${product} is proudly placed in the scene as the tool that delivered this result.`,
        IDENTITY_GUARD,
        `Mood: ${mood}, with fresh and bright lighting.`,
        QUALITY_TAIL,
        extra,
      ].filter(Boolean).join(' ');

    case 'multiAngle':
      return [
        `Task: Product photography showing ${product} from a different camera angle than the reference image, set in ${bg}.`,
        IDENTITY_GUARD,
        `Only the camera angle and pose of the product changes — the product itself (color, material, design, proportions) must remain identical.`,
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

async function callFalEdit({ apiKey, modelKey, prompt, sourceImageDataUrl, size = '1024x1024' }) {
  const modelPath = FAL_MODELS[modelKey]?.edit;
  if (!modelPath) throw new Error(`fal.ai 모델 경로 없음: ${modelKey}`);

  // size → aspect_ratio 변환
  const aspectRatio = size === '1024x1536' ? '2:3' : size === '1536x1024' ? '3:2' : '1:1';

  const input = {
    prompt,
    image_urls: [sourceImageDataUrl], // base64 data URL 그대로 전달 가능
    num_images: 1,
    aspect_ratio: aspectRatio,
    output_format: 'png',
    resolution: '1K',
  };

  const submitted = await falSubmit({ apiKey, modelPath, input });
  const result = await falPollResult({
    apiKey,
    statusUrl: submitted.status_url,
    responseUrl: submitted.response_url,
  });

  const imgUrl = result?.images?.[0]?.url;
  if (!imgUrl) throw new Error('fal.ai 이미지 응답이 비어 있습니다.');
  // 외부 URL을 data URL로 변환해서 일관된 인터페이스 유지
  return urlToDataUrl(imgUrl);
}

async function callFalGen({ apiKey, modelKey, prompt, size = '1024x1024' }) {
  const modelPath = FAL_MODELS[modelKey]?.generate;
  if (!modelPath) throw new Error(`fal.ai 모델 경로 없음: ${modelKey}`);

  const aspectRatio = size === '1024x1536' ? '2:3' : size === '1536x1024' ? '3:2' : '1:1';

  const input = {
    prompt,
    num_images: 1,
    aspect_ratio: aspectRatio,
    output_format: 'png',
    resolution: '1K',
  };

  const submitted = await falSubmit({ apiKey, modelPath, input });
  const result = await falPollResult({
    apiKey,
    statusUrl: submitted.status_url,
    responseUrl: submitted.response_url,
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
  } = opts;

  if (!mode) throw new Error('합성 모드를 선택해 주세요.');

  const prompt = buildPrompt({
    mode,
    productName,
    backgroundKey,
    customBackground,
    moodKey,
    extraNote,
  });

  let url;

  // fal.ai 모델 (nano-banana-2, nano-banana-pro)
  if (provider === 'fal' && (modelKey === 'nano-banana-2' || modelKey === 'nano-banana-pro')) {
    if (!falApiKey) throw new Error('fal.ai API 키가 필요합니다. 사이드바에서 입력해 주세요.');
    if (sourceImageDataUrl) {
      url = await callFalEdit({ apiKey: falApiKey, modelKey, prompt, sourceImageDataUrl, size });
    } else {
      url = await callFalGen({ apiKey: falApiKey, modelKey, prompt, size });
    }
  } else {
    // OpenAI gpt-image-1
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
