/**
 * competitorAnalyzer.js — 경쟁사 상세페이지 분석기
 *
 * 사용자가 업로드한 경쟁사 상세페이지 스크린샷(1~10장)을 gpt-4o (vision) 으로 분석
 * 4가지 결과를 JSON 으로 반환:
 *
 *   1. structure       — 페이지 흐름 구조 (인트로 → 문제제기 → ... → CTA)
 *   2. usp             — 경쟁사가 강조하는 셀링포인트 Top 3~5
 *   3. gapAnalysis     — 약점 / 우리가 보완할 부분 (리뷰의 불만과 매칭)
 *   4. headlines       — 벤치마킹할 카피 + 우리 톤 변형 제안
 *
 * 비용 (gpt-4o):
 *   - 이미지 1장 ≈ $0.005 (텍스트 입력 토큰 약 1500개 차지)
 *   - 5장 + 분석 응답 ≈ $0.05 (≈70원)
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// 이미지 dataURL → 크기 축소 (긴 변 1024px 로 다운스케일, JPEG 75%)
// 토큰 비용 절감 + 빠른 응답
async function downscaleImage(dataUrl, maxSide = 1024, quality = 0.75) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longSide = Math.max(width, height);
      if (longSide > maxSide) {
        const scale = maxSide / longSide;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl); // 실패 시 원본
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * 경쟁사 상세페이지 스크린샷 분석
 *
 * @param {Object} opts
 * @param {string} opts.apiKey       OpenAI API 키
 * @param {string} opts.model        기본 'gpt-4o' (vision 지원)
 * @param {string[]} opts.screenshots 스크린샷 dataURL 배열 (최대 10장 권장)
 * @param {string} opts.competitorUrl  경쟁사 URL (선택, 컨텍스트로 전달)
 * @param {string} opts.myProductName  내 제품명 (선택)
 * @param {string} opts.myProductType  내 제품 유형 (선택)
 * @param {string} opts.myToneNote     내 브랜드 톤 (선택, 헤드라인 변형용)
 * @param {Object} opts.reviewInsights (선택) ReviewAnalyzer 결과 — 불만 매칭에 활용
 *                                       { painPoints: [{title, desc, freq}], ... }
 * @returns {Promise<{
 *   summary: string,
 *   structure: { flow: string, sections: [{order, name, purpose, note}] },
 *   usp: [{rank, point, evidence}],
 *   gapAnalysis: [{weakness, ourOpportunity, linkedPainPoint}],
 *   headlines: [{original, ourVersion, why}],
 *   meta: { imageCount, model }
 * }>}
 */
export async function analyzeCompetitor({
  apiKey,
  model = 'gpt-4o',
  screenshots = [],
  competitorUrl = '',
  myProductName = '',
  myProductType = '',
  myToneNote = '',
  reviewInsights = null,
}) {
  if (!apiKey) throw new Error('OpenAI API 키가 필요합니다.');
  if (!Array.isArray(screenshots) || screenshots.length === 0) {
    throw new Error('스크린샷이 최소 1장 이상 필요합니다.');
  }
  if (screenshots.length > 10) {
    throw new Error('스크린샷은 최대 10장까지 분석 가능합니다.');
  }

  // 모든 이미지 다운스케일 (병렬)
  const scaled = await Promise.all(
    screenshots.map((url) => (url?.startsWith('data:') ? downscaleImage(url) : Promise.resolve(url)))
  );

  // 리뷰 인사이트가 있으면 컨텍스트로 전달
  const painContext = reviewInsights?.painPoints?.length
    ? `

## 참고: 이 카테고리 제품에서 고객들이 자주 호소하는 불만
${reviewInsights.painPoints
  .map((p, i) => `${i + 1}. ${p.title} (${p.freq || ''}) — ${p.desc || ''}`)
  .join('\n')}
→ 이 불만들 중 경쟁사 페이지가 충분히 다루지 않는 부분이 있다면, gapAnalysis 의 linkedPainPoint 에 해당 title 을 명시하세요.`
    : '';

  const systemPrompt = `당신은 쿠팡/네이버쇼핑 상세페이지 기획 전문가입니다.
경쟁사 상세페이지 스크린샷 ${scaled.length}장을 분석하여 다음 4가지를 JSON 으로 추출합니다.

【규칙】
- 모든 출력은 한국어.
- 추측 최소화. 스크린샷에 보이는 내용을 근거로 작성.
- 마케팅 실무에 바로 쓸 수 있도록 구체적·실용적으로.
- 비방·과장 금지. 객관적 분석 톤.

【1. summary】
경쟁사 페이지 전반에 대한 2~3 문장 요약. 어떤 컨셉인지·강점/약점이 한눈에 보이게.

【2. structure】 — 페이지 흐름 구조
- flow: 한 줄로 흐름 정리 (예: "인트로 → 문제제기 → 해결책 → 신뢰성 → 사용씬 → 혜택")
- sections: 섹션 단위로 ${scaled.length >= 3 ? '5~8개' : '3~6개'}
  - order: 1부터 시작하는 순서
  - name: 섹션 이름 (예: "히어로 — 메인 슬로건")
  - purpose: 그 섹션의 목적 (예: "구매 전환 후크 제시")
  - note: 어떻게 구성했는지 한 줄 메모 (예: "1+1 가성비를 큰 글씨로 강조")

【3. usp】 — 경쟁사가 가장 강조하는 셀링포인트 Top 3~5
- rank: 1, 2, 3, ...
- point: 핵심 강점 한 줄 (예: "국내 유일 의료용 실리콘 사용")
- evidence: 페이지 어디에서 그렇게 강조하는지 근거 (예: "P3 인증마크 섹션에서 큰 배지로 표시")

【4. gapAnalysis】 — 경쟁사 페이지의 약점 / 우리가 비집고 들어갈 틈 3~5개
- weakness: 경쟁사 페이지가 부족한 부분 (예: "사용 후 청결 관리법 설명 없음")
- ourOpportunity: 우리가 어떻게 보완할지 (예: "P8에 세척·건조 단계별 사진 + 곰팡이 방지 팁 추가")
- linkedPainPoint: (선택) 위 painPoints 중 매칭되는 title (없으면 빈 문자열)

【5. headlines】 — 벤치마킹할 카피 6~10개
- original: 경쟁사 스크린샷에서 본 강력한 헤드라인 그대로 (한 줄)
- ourVersion: 우리 톤에 맞춰 변형한 버전 (15~25자, 카피 톤 적용)
- why: 왜 이 카피가 강력한지 1줄 분석 (예: "숫자로 신뢰성 + 결과 약속")

【출력 JSON 형식】
{
  "summary": "...",
  "structure": {
    "flow": "...",
    "sections": [{"order":1,"name":"...","purpose":"...","note":"..."}]
  },
  "usp": [{"rank":1,"point":"...","evidence":"..."}],
  "gapAnalysis": [{"weakness":"...","ourOpportunity":"...","linkedPainPoint":""}],
  "headlines": [{"original":"...","ourVersion":"...","why":"..."}]
}`;

  const userTextParts = [
    `## 분석 대상 (경쟁사)`,
    competitorUrl ? `URL: ${competitorUrl}` : null,
    `스크린샷 수: ${scaled.length}장`,
    '',
    `## 내 제품 정보`,
    myProductName ? `제품명: ${myProductName}` : `제품명: (미입력)`,
    myProductType ? `유형: ${myProductType}` : null,
    myToneNote ? `브랜드 톤: ${myToneNote}` : `브랜드 톤: 친근하고 신뢰감 있게, 자취생/주부 타겟`,
    painContext,
    '',
    `위 스크린샷들을 순서대로 본 뒤 JSON 으로 분석 결과를 반환하세요.`,
  ].filter(Boolean).join('\n');

  // OpenAI vision 메시지 구성
  const userContent = [
    { type: 'text', text: userTextParts },
    ...scaled.map((url) => ({
      type: 'image_url',
      image_url: { url, detail: 'high' }, // 'high' 는 디테일 분석용 (비용 약간 ↑)
    })),
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
      temperature: 0.4,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = errText;
    try {
      const j = JSON.parse(errText);
      msg = j?.error?.message || errText;
    } catch (_) {}
    throw new Error(`OpenAI API 오류 (${response.status}): ${msg}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI 응답이 비어있습니다.');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI 응답을 JSON으로 파싱할 수 없습니다.');
  }

  return {
    summary: parsed.summary || '',
    structure: {
      flow: parsed.structure?.flow || '',
      sections: Array.isArray(parsed.structure?.sections) ? parsed.structure.sections : [],
    },
    usp: Array.isArray(parsed.usp) ? parsed.usp.slice(0, 5) : [],
    gapAnalysis: Array.isArray(parsed.gapAnalysis) ? parsed.gapAnalysis.slice(0, 6) : [],
    headlines: Array.isArray(parsed.headlines) ? parsed.headlines.slice(0, 12) : [],
    meta: { imageCount: scaled.length, model },
  };
}
