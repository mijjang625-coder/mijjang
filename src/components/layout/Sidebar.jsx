import { lazy, Suspense } from 'react';
import Section from '../ui/Section.jsx';
import Field from '../ui/Field.jsx';
import InfoCard from '../ui/InfoCard.jsx';
import { CheckIcon as CheckIconPreview } from '../pages/Shared.jsx';
import { THEME_PRESETS, FONT_PRESETS } from '../../lib/theme.js';
import { DEFAULT_BRIEF, PRODUCT_TYPES } from '../../lib/briefDefaults.js';

// 🚀 분석 도구는 lazy load — 사이드바 섹션 펼쳐졌을 때만 로드 (xlsx + 분석 로직 포함)
const ReviewAnalyzer = lazy(() => import('../ReviewAnalyzer.jsx'));
const CompetitorAnalyzer = lazy(() => import('../CompetitorAnalyzer.jsx'));

// 분석 도구 로딩 표시
function AnalyzerFallback({ icon = '🔍', label = '도구 로딩 중...' }) {
  return (
    <div style={{ padding: 24, textAlign: 'center', color: '#6b635c' }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 12, fontWeight: 'bold' }}>{label}</div>
    </div>
  );
}

/**
 * Sidebar — 좌측 입력/설정 사이드바 (16개 섹션)
 *
 * 주요 섹션:
 *  1. OpenAI 설정    — apiKey, falApiKey, model
 *  2. 톤앤매너       — themeId, brandTone, accentColor 등
 *  3. 리뷰 분석      — ReviewAnalyzer 통합
 *  4. 경쟁사 분석    — CompetitorAnalyzer 통합
 *  5. 폰트           — fontId
 *  6. P1 강점 카드   — p1CardSettings
 *  7. 참조 자료      — referenceUrl, pastedText 자동 채우기
 *  8. 제품 기본 정보 — productName, productType, strengths 등
 *  9. 제품 사진      — handleImageUpload
 * 10~16. 리뷰/비교/활용/사용순서/FAQ
 */
export default function Sidebar({
  // OpenAI 설정
  apiKey, setApiKey,
  falApiKey, setFalApiKey,
  model, setModel,
  // 브리프
  brief, setBrief,
  updateBrief, updateArrayItem, updateObjectArrayItem,
  // 이미지
  images, handleImageUpload,
  // 리뷰/경쟁사 분석
  reviewInsights, setReviewInsights,
  // 참조 자료
  referenceUrl, setReferenceUrl,
  isExtracting,
  extractResult,
  extractMode, setExtractMode,
  pastedText, setPastedText,
  userNotes, setUserNotes,
  ocrImages, setOcrImages,
  showPasteHint,
  // 키워드 추출
  keywords, setKeywords,
  isExtractingKeywords,
  // 자동 채우기
  isAutoFilling,
  autoFillMessage,
  // 핸들러
  handleAutoFillFromUrl,
  handleAutoFillEmpty,
  handleExtractKeywords,
  // 🆕 경쟁사 분석기 → 추천 페이지에 헤드라인 직접 적용
  applyHeadlineToPage = null,
}) {
  return (
        <aside
          className="space-y-4 xl:sticky xl:overflow-y-auto xl:pr-2"
          style={{ top: '72px', maxHeight: 'calc(100vh - 88px)' }}
        >
          <div data-tour="api-key">
          <Section title="1. OpenAI 설정" emoji="🔑" collapsible defaultCollapsed={!!apiKey}>
            <Field label="OpenAI API Key" required>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="input" />
              <div className="text-[10px] text-slate-500 mt-1">텍스트 생성/수정용 (필수)</div>
            </Field>
            <Field label="모델">
              <select value={model} onChange={(e) => setModel(e.target.value)} className="input">
                <option value="gpt-4o-mini">gpt-4o-mini (빠르고 저렴)</option>
                <option value="gpt-4o">gpt-4o (고품질)</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                <option value="gpt-4.1">gpt-4.1</option>
              </select>
            </Field>
            <Field label="fal.ai API Key">
              <input type="password" value={falApiKey} onChange={(e) => setFalApiKey(e.target.value)} placeholder="fal_..." className="input" />
              <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                🍌 <b>AI 사진 합성용</b> (Nano Banana 2/Pro)<br />
                fal.ai에서 발급 → <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer" className="text-blue-600 underline">fal.ai/dashboard/keys</a><br />
                💰 nano-banana-2 약 110원/장, pro 약 195원/장
              </div>
            </Field>
          </Section>
          </div>

          <Section title="톤앤매너 (색상 테마)" emoji="🎨" collapsible defaultCollapsed>
            <div className="text-[11px] text-slate-500 mb-2 leading-relaxed">
              상품 분위기에 맞는 컬러 팔레트를 선택하세요.
              <br />모든 P1~P10 페이지에 즉시 적용됩니다.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(THEME_PRESETS).map((t) => {
                const active = brief.themeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => updateBrief({ themeId: t.id })}
                    className="p-2 rounded-lg border-2 text-left transition-all"
                    style={{
                      borderColor: active ? t.colors.main : '#e2ddd4',
                      backgroundColor: active ? t.colors.sub : '#fff',
                      boxShadow: active ? `0 0 0 2px ${t.colors.main}33` : 'none',
                    }}
                  >
                    <div className="flex gap-1 mb-1.5">
                      {t.swatch.map((c, i) => (
                        <div
                          key={i}
                          className="w-5 h-5 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: t.colors.text }}>
                      {t.name}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {t.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ─────────── 폰트 선택 (전체 페이지 일괄 적용) ─────────── */}
          <Section title="폰트 (전체 페이지 일괄 변경)" emoji="🔤" collapsible defaultCollapsed>
            <div className="text-[11px] text-slate-500 mb-2 leading-relaxed">
              선택한 폰트가 P1~P10 모든 페이지에 즉시 적용됩니다.
              <br />5종 무료 상업용 한글 폰트 제공.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(FONT_PRESETS).map((f) => {
                const active = brief.fontId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => updateBrief({ fontId: f.id })}
                    className="p-2 rounded-lg border-2 text-left transition-all"
                    style={{
                      borderColor: active ? '#C8B6A6' : '#e2ddd4',
                      backgroundColor: active ? '#F7F3EE' : '#fff',
                      boxShadow: active ? `0 0 0 2px rgba(200,182,166,0.3)` : 'none',
                      fontFamily: f.family,
                    }}
                  >
                    <div
                      className="text-[15px] font-bold mb-1"
                      style={{ color: '#2F2A26', fontFamily: f.family }}
                    >
                      {f.sample}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: '#2F2A26' }}>
                      {f.name}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {f.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ─────────── P1 강점 카드 디자인 (체크아이콘 모양 + 박스 크기) ─────────── */}
          <Section title="P1 강점 카드 디자인" emoji="✨" collapsible defaultCollapsed>
            <div className="text-[11px] text-slate-500 mb-2 leading-relaxed">
              P1 페이지의 3개 강점 카드(체크 아이콘 + 박스)를 직접 조정합니다.
            </div>

            <div className="text-[10px] -mt-1 mb-2 p-1.5 rounded" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
              💡 아래 옵션을 바꾸면 <b>오른쪽 P1 미리보기에 즉시 반영</b>됩니다 (별도 적용 버튼 없음)
            </div>

            {/* 아이콘 모양 6종 선택 */}
            <Field label="✓ 체크 아이콘 모양 (모든 카드 동일하게 적용)">
              <div className="grid grid-cols-6 gap-1.5">
                {[
                  { v: 0, name: '원형' },
                  { v: 1, name: '사각' },
                  { v: 2, name: '방패' },
                  { v: 3, name: '하트' },
                  { v: 4, name: '육각' },
                  { v: 5, name: '꽃' },
                ].map(({ v, name }) => {
                  const active = (brief.p1CardSettings?.iconVariant ?? 0) === v;
                  const previewColor = brief.p1CardSettings?.iconColor || '#C8B6A6';
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => updateBrief({
                        p1CardSettings: { ...(brief.p1CardSettings || {}), iconVariant: v },
                      })}
                      className="flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-all"
                      style={{
                        borderColor: active ? '#C8B6A6' : '#e2ddd4',
                        backgroundColor: active ? '#F7F3EE' : '#fff',
                        boxShadow: active ? '0 0 0 2px rgba(200,182,166,0.3)' : 'none',
                      }}
                    >
                      <CheckIconPreview variant={v} color={previewColor} size={28} />
                      <div className="text-[9px]" style={{ color: '#2F2A26' }}>{name}</div>
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* 아이콘 색상 선택 */}
            <Field label="🎨 체크 아이콘 색상">
              <div className="grid grid-cols-8 gap-1.5 mb-1.5">
                {[
                  { c: '', name: '테마' },                 // 빈값 = 테마색
                  { c: '#C8B6A6', name: '베이지' },
                  { c: '#2F2A26', name: '딥브라운' },
                  { c: '#ef4444', name: '레드' },
                  { c: '#f97316', name: '오렌지' },
                  { c: '#eab308', name: '옐로우' },
                  { c: '#22c55e', name: '그린' },
                  { c: '#3b82f6', name: '블루' },
                  { c: '#8b5cf6', name: '퍼플' },
                  { c: '#ec4899', name: '핑크' },
                  { c: '#06b6d4', name: '시안' },
                  { c: '#000000', name: '블랙' },
                  { c: '#ffffff', name: '화이트' },
                  { c: '#84cc16', name: '라임' },
                  { c: '#f59e0b', name: '앰버' },
                  { c: '#a855f7', name: '바이올렛' },
                ].map(({ c, name }) => {
                  const cur = brief.p1CardSettings?.iconColor ?? '';
                  const active = cur === c;
                  return (
                    <button
                      key={c || 'theme'}
                      type="button"
                      onClick={() => updateBrief({
                        p1CardSettings: { ...(brief.p1CardSettings || {}), iconColor: c },
                      })}
                      title={name + (c ? ` (${c})` : '')}
                      className="aspect-square rounded-md border-2 transition-all flex items-center justify-center text-[8px] font-bold"
                      style={{
                        borderColor: active ? '#2F2A26' : '#e2ddd4',
                        backgroundColor: c || 'linear-gradient(135deg,#C8B6A6,#F7F3EE)',
                        background: c
                          ? c
                          : 'linear-gradient(135deg,#C8B6A6 0%,#F7F3EE 100%)',
                        boxShadow: active ? '0 0 0 2px rgba(47,42,38,0.4)' : 'none',
                        color: c === '#ffffff' || c === '' ? '#2F2A26' : '#fff',
                      }}
                    >
                      {!c && 'T'}
                    </button>
                  );
                })}
              </div>
              {/* 커스텀 색상 입력 */}
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brief.p1CardSettings?.iconColor || '#C8B6A6'}
                  onChange={(e) => updateBrief({
                    p1CardSettings: { ...(brief.p1CardSettings || {}), iconColor: e.target.value },
                  })}
                  className="w-10 h-7 rounded border cursor-pointer"
                  style={{ borderColor: '#e2ddd4' }}
                  title="커스텀 색상 선택"
                />
                <input
                  type="text"
                  value={brief.p1CardSettings?.iconColor || ''}
                  onChange={(e) => updateBrief({
                    p1CardSettings: { ...(brief.p1CardSettings || {}), iconColor: e.target.value },
                  })}
                  placeholder="#C8B6A6 (비우면 테마색)"
                  className="input flex-1 text-[10px] font-mono"
                  style={{ padding: '4px 8px' }}
                />
              </div>
              <div className="text-[9px] text-slate-400 mt-0.5">
                💡 'T'(테마) 버튼: 현재 톤앤매너 색상 자동 사용
              </div>
            </Field>

            {/* 슬라이더 컨트롤 */}
            {(() => {
              const cfg = brief.p1CardSettings || {};
              const setCfg = (patch) => updateBrief({
                p1CardSettings: { ...(brief.p1CardSettings || {}), ...patch },
              });
              const Slider = ({ label, value, min, max, step = 1, suffix = 'px', valKey }) => (
                <div>
                  <div className="flex items-center justify-between text-[10px] mb-0.5" style={{ color: '#6b635c' }}>
                    <span>{label}</span>
                    <span className="font-bold" style={{ color: '#2F2A26' }}>{value}{suffix}</span>
                  </div>
                  <input
                    type="range"
                    min={min} max={max} step={step}
                    value={value}
                    onChange={(e) => setCfg({ [valKey]: Number(e.target.value) })}
                    className="w-full"
                    style={{ accentColor: '#C8B6A6' }}
                  />
                </div>
              );
              return (
                <div className="space-y-2 mt-2">
                  <Slider label="아이콘 크기" value={cfg.iconSize ?? 28} min={16} max={56} valKey="iconSize" />
                  <Slider label="카드 최소 높이" value={cfg.cardMinHeight ?? 220} min={140} max={320} valKey="cardMinHeight" />
                  <Slider label="카드 위쪽 여백" value={cfg.cardPaddingY ?? 18} min={4} max={50} valKey="cardPaddingY" />
                  <Slider label="카드 아래쪽 여백" value={cfg.cardPaddingYBottom ?? 20} min={4} max={50} valKey="cardPaddingYBottom" />
                  <Slider label="카드 좌우 여백" value={cfg.cardPaddingX ?? 10} min={4} max={40} valKey="cardPaddingX" />
                  <Slider label="카드 모서리 둥글기" value={cfg.cardRadius ?? 18} min={0} max={32} valKey="cardRadius" />
                  <Slider label="카드 사이 간격" value={cfg.cardGap ?? 22} min={4} max={50} valKey="cardGap" />
                  <button
                    type="button"
                    onClick={() => updateBrief({ p1CardSettings: DEFAULT_BRIEF.p1CardSettings })}
                    className="w-full mt-1 py-1.5 rounded-lg text-[10px] font-bold border"
                    style={{ borderColor: '#C8B6A6', backgroundColor: '#fff', color: '#2F2A26' }}
                  >
                    🔄 기본값으로 초기화
                  </button>
                </div>
              );
            })()}
          </Section>

          {/* ─────────── 🆕 분석 도구 (P1 강점 카드 다음) ─────────── */}
          <Section title="🔍 리뷰 분석 & 마케팅 문구 자동생성" emoji="🧠" collapsible defaultCollapsed>
            <Suspense fallback={<AnalyzerFallback icon="🔍" label="리뷰 분석 도구 로딩 중..." />}>
            <ReviewAnalyzer
              apiKey={apiKey}
              model={model}
              productName={brief.productName}
              productType={brief.productType}
              onAnalyzed={setReviewInsights}
              onApplyAdoptedToNotes={(text) => {
                // 🆕 (2026-04-28) 채택 문구를 "내 메모"에 자동 추가
                // 🆕 (2026-05-08) 채택 토글마다 자동 호출 — text 가 비면 섹션 제거
                const SECTION_TAG = '--- 📌 리뷰 분석 채택 문구 ---';
                const header = `\n\n${SECTION_TAG}\n`;
                setUserNotes((prev) => {
                  const cur = prev || '';
                  const idx = cur.indexOf(SECTION_TAG);
                  // 채택 0개 → 섹션 자체를 제거
                  if (!text || !text.trim()) {
                    if (idx < 0) return cur;
                    return cur.slice(0, idx).replace(/\n+$/, '');
                  }
                  // 이미 같은 섹션이 있으면 그 부분만 갱신
                  if (idx >= 0) {
                    return cur.slice(0, idx).replace(/\n+$/, '') + header + text;
                  }
                  return (cur ? cur.trimEnd() : '') + header + text;
                });
              }}
              onAddKeywordsToSearch={(reviewKeywords) => {
                if (!Array.isArray(reviewKeywords) || !reviewKeywords.length) return;
                const exists = new Set((keywords || []).map((k) => String(k.keyword).trim().toLowerCase()));
                const mapped = reviewKeywords
                  .map((k) => ({
                    keyword: String(k.keyword || '').trim(),
                    type: k.category || '리뷰',
                  }))
                  .filter((k) => k.keyword && !exists.has(k.keyword.toLowerCase()));
                if (!mapped.length) {
                  alert('이미 추가된 키워드입니다.');
                  return;
                }
                const merged = [...(keywords || []), ...mapped].map((k, idx) => ({
                  ...k,
                  rank: idx + 1,
                }));
                setKeywords(merged);
                alert(`✅ 리뷰 키워드 ${mapped.length}개를 검색어 목록에 추가했습니다.`);
              }}
            />
            </Suspense>
          </Section>

          <Section title="🕵️ 경쟁사 상세페이지 AI 분석" emoji="🔬" collapsible defaultCollapsed>
            <Suspense fallback={<AnalyzerFallback icon="🕵️" label="경쟁사 분석 도구 로딩 중..." />}>
            <CompetitorAnalyzer
              apiKey={apiKey}
              model={model}
              productName={brief.productName}
              productType={brief.productType}
              toneNote={brief.brandTone || ''}
              reviewInsights={reviewInsights}
              onApplyHeadlineToPage={applyHeadlineToPage}
              onApplyToBrief={(updates) => {
                const lines = [];
                if (updates.uspHints?.length) {
                  lines.push('━━ 경쟁사 USP (벤치마크) ━━');
                  updates.uspHints.forEach((u, i) => lines.push(`${i + 1}. ${u}`));
                }
                if (updates.gapHints?.length) {
                  lines.push('\n━━ 우리가 보완할 부분 (Gap) ━━');
                  updates.gapHints.forEach((g, i) => lines.push(`${i + 1}. ${g}`));
                }
                if (updates.headlineHints?.length) {
                  lines.push('\n━━ 추천 헤드라인 (변형) ━━');
                  updates.headlineHints.forEach((h, i) => lines.push(`${i + 1}. ${h}`));
                }
                if (updates.structureHint) {
                  lines.push(`\n━━ 추천 구조 ━━\n${updates.structureHint}`);
                }
                const block = lines.join('\n');
                if (!block) return;
                setBrief((prev) => {
                  const prevNote = prev.extraNotes || '';
                  const newNote = prevNote
                    ? `${prevNote}\n\n${block}`
                    : block;
                  return { ...prev, extraNotes: newNote };
                });
                alert('✅ 경쟁사 분석 결과가 브리프(추가 메모)에 반영되었습니다. P1~P10 생성 시 자동 참고됩니다.');
              }}
            />
            </Suspense>
          </Section>

          <Section title="2. 참조 자료로 자동 채우기" emoji="🔗" collapsible>
            {/* 모드 탭 */}
            <div className="flex gap-1 mb-2 p-1 rounded-lg" style={{ backgroundColor: '#F7F3EE' }}>
              <button
                type="button"
                onClick={() => setExtractMode('url')}
                className="flex-1 py-1.5 text-xs font-bold rounded transition-all"
                style={{
                  backgroundColor: extractMode === 'url' ? '#C8B6A6' : 'transparent',
                  color: extractMode === 'url' ? '#fff' : '#6b635c',
                }}
              >
                🌐 URL 입력
              </button>
              <button
                type="button"
                onClick={() => setExtractMode('paste')}
                className="flex-1 py-1.5 text-xs font-bold rounded transition-all"
                style={{
                  backgroundColor: extractMode === 'paste' ? '#C8B6A6' : 'transparent',
                  color: extractMode === 'paste' ? '#fff' : '#6b635c',
                }}
              >
                📋 텍스트 붙여넣기
              </button>
            </div>

            {extractMode === 'url' ? (
              <>
                <div className="text-[11px] text-slate-500 mb-1 leading-relaxed">
                  쿠팡 · 네이버 등 <b>봇 차단이 약한 사이트</b>의 URL에 권장합니다.
                  <br />
                  <span style={{ color: '#C8B6A6' }}>※ 이미 입력된 칸은 덮어쓰지 않습니다.</span>
                  <br />
                  <span style={{ color: '#9a3412' }}>
                    ⚠️ 1688 · 타오바오 · aliprice는 봇 차단(Captcha) 때문에 실패할 수 있어요.
                    <br />→ 실패 시 위 <b>📋 텍스트 붙여넣기</b> 탭을 이용해주세요.
                  </span>
                </div>
                <Field label="참조 URL">
                  <input
                    type="url"
                    value={referenceUrl}
                    onChange={(e) => setReferenceUrl(e.target.value)}
                    placeholder="https://www.coupang.com/vp/products/... (1688은 붙여넣기 탭 권장)"
                    className="input"
                  />
                </Field>
              </>
            ) : (
              <>
                <div className="text-[11px] text-slate-500 mb-1 leading-relaxed">
                  <b>1688 · 타오바오 등 봇 차단 페이지용 대안입니다.</b>
                  <br />사용법:
                  <br />① 브라우저에서 상품 페이지 열기
                  <br />② <b>Ctrl+A → Ctrl+C</b>로 페이지 전체 복사
                  <br />③ 아래 칸에 <b>Ctrl+V</b>로 붙여넣기
                  <br />④ 이미지는 따로 다운받아 <b>아래 이미지 첨부</b>에 올리면 자동으로 글씨까지 분석됨
                  <br />⑤ 아래 <b>✨ 내용 분석</b> 버튼 클릭
                </div>
                <Field label="① 1688/쿠팡 크롤링 자료 (텍스트 + 이미지 OCR)">
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="브라우저에서 상품 페이지 → Ctrl+A → Ctrl+C → 여기 Ctrl+V"
                    rows={8}
                    className="input font-mono text-[11px]"
                    style={{ resize: 'vertical', minHeight: '140px' }}
                  />
                </Field>
                <div className="text-[10px] text-slate-500 -mt-1 leading-relaxed">
                  📋 텍스트: <b>{pastedText.length.toLocaleString()}자</b> {pastedText.length >= 500 && '✓'}
                </div>

                {/* OCR 전용 이미지 업로드 — ①번 자료의 일부 */}
                <Field label="📷 1688 이미지 OCR (선택) — 그림 속 글씨도 분석">
                  <label className="block">
                    <div
                      className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition hover:bg-amber-50"
                      style={{ borderColor: '#fbbf24', backgroundColor: '#fffbeb' }}
                    >
                      <div className="text-base mb-0.5">🖼️ 클릭해서 OCR용 이미지 추가</div>
                      <div className="text-[10px] text-slate-600">
                        1688에서 다운받은 상세페이지 이미지를 올려주세요 (최대 8장)
                        <br />
                        <span style={{ color: '#92400e' }}>※ 여기 올린 이미지는 <b>글씨 추출용</b>이며, P1~P10에는 사용되지 않습니다</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (!files.length) return;
                          Promise.all(
                            files.map(
                              (file) =>
                                new Promise((resolve) => {
                                  const r = new FileReader();
                                  r.onload = () => resolve(r.result);
                                  r.readAsDataURL(file);
                                })
                            )
                          ).then((urls) => {
                            setOcrImages((prev) => [...prev, ...urls].slice(0, 8));
                          });
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </label>
                </Field>
                {ocrImages.length > 0 && (
                  <div className="-mt-1">
                    <div className="text-[10px] mb-1" style={{ color: '#92400e' }}>
                      📷 OCR 이미지 <b>{ocrImages.length}/8장</b>
                      <button
                        type="button"
                        onClick={() => setOcrImages([])}
                        className="ml-2 px-1.5 py-0.5 rounded text-[9px] border"
                        style={{ borderColor: '#fbbf24', backgroundColor: 'white' }}
                      >
                        전체 삭제
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {ocrImages.map((src, idx) => (
                        <div key={idx} className="relative group">
                          <img
                            src={src}
                            alt={`OCR ${idx + 1}`}
                            className="w-full h-14 object-cover rounded border"
                            style={{ borderColor: '#fbbf24' }}
                          />
                          <button
                            type="button"
                            onClick={() => setOcrImages((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute top-0 right-0 w-4 h-4 rounded-bl bg-black bg-opacity-60 text-white text-[10px] leading-none flex items-center justify-center"
                            title="삭제"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-[10px] text-slate-400 -mt-1">
                  💡 텍스트 + 이미지 OCR을 함께 사용하면 더 정확하게 분석됩니다
                </div>

                <Field label="② 🔑 내가 직접 쓴 메모 (최우선 적용)">
                  <div className="flex gap-1.5 mb-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const template = `[제품명] 

[제품 종류] (청소도구형/수납형/욕실위생형/주방정리형/소모품형/생활보조형/인테리어소품형 중 택1)

[소재] 

[사이즈/스펙] (가로 ○cm, 세로 ○cm, 높이 ○cm, 무게 ○g, 용량 ○L 등 구체 수치)

[색상] 

[모델명] 

[강점 3가지] (P1·P2에 사용)
1. 
2. 
3. 

[타깃 고객 3가지] (P3에 사용 - 한 문장씩)
1. 
2. 
3. 

[리뷰 4개] (P4에 사용 - 후기는 65자 이내)
1. 닉네임: / 날짜(YYYY-MM-DD): / 후기(65자 이내): 
2. 닉네임: / 날짜: / 후기(65자 이내): 
3. 닉네임: / 날짜: / 후기(65자 이내): 
4. 닉네임: / 날짜: / 후기(65자 이내): 

[비교 대상 일반 제품 이름] (P5 비교표 헤더)


[차별점 4쌍] (P5 비교표 - 일반 제품 vs 내 제품)
1. 일반 제품: / 내 제품: 
2. 일반 제품: / 내 제품: 
3. 일반 제품: / 내 제품: 
4. 일반 제품: / 내 제품: 

[소재/원료 상세 설명] (P6에 사용)


[활용법 4가지] (P7·P8에 사용)
1. 
2. 
3. 
4. 

[사용 순서 3단계] (P9에 사용)
1단계: 
2단계: 
3단계: 

[FAQ 5개] (P10에 사용)
Q1. 
A1. 
Q2. 
A2. 
Q3. 
A3. 
Q4. 
A4. 
Q5. 
A5. 

[기타 참고사항] (브랜드/원산지/인증 등)
`;
                        setUserNotes(template);
                      }}
                      className="px-2 py-1 rounded text-[10px] font-bold border"
                      style={{ backgroundColor: '#fef3c7', borderColor: '#fbbf24', color: '#92400e' }}
                    >
                      📋 빈 양식 불러오기 (P1~P10)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const aiPrompt = `아래 양식의 [ ] 안 빈칸을 모두 채워줘. 한국 쿠팡 상세페이지 제작용이야. 과장 없이 자연스럽게.

[제품명] (30자 이내, 핵심 키워드 중심)
[제품 종류] (청소도구형/수납형/욕실위생형/주방정리형/소모품형/생활보조형/인테리어소품형 중 택1)
[소재] 
[사이즈/스펙] (구체 수치 포함)
[색상] 
[모델명] 

[강점 3가지]
1. 
2. 
3. 

[타깃 고객 3가지] (한 문장씩)
1. 
2. 
3. 

[리뷰 4개] (후기는 65자 이내)
1. 닉네임: / 날짜(YYYY-MM-DD): / 후기(65자 이내):
2. 닉네임: / 날짜: / 후기(65자 이내):
3. 닉네임: / 날짜: / 후기(65자 이내):
4. 닉네임: / 날짜: / 후기(65자 이내):

[비교 대상 일반 제품 이름]

[차별점 4쌍] (일반 제품 vs 내 제품)
1. 일반 제품: / 내 제품:
2. 일반 제품: / 내 제품:
3. 일반 제품: / 내 제품:
4. 일반 제품: / 내 제품: 

[소재/원료 상세 설명]

[활용법 4가지]
1. 
2. 
3. 
4. 

[사용 순서 3단계]
1단계: 
2단계: 
3단계: 

[FAQ 5개]
Q1. / A1.
Q2. / A2.
Q3. / A3.
Q4. / A4.
Q5. / A5.

[기타 참고사항] (브랜드/원산지/인증 등)`;
                        navigator.clipboard.writeText(aiPrompt);
                        alert('✅ AI 프롬프트가 복사되었습니다!\n\nChatGPT 등에 붙여넣고 답변을 받은 뒤,\n그 답변을 다시 이 칸에 붙여넣어주세요.');
                      }}
                      className="px-2 py-1 rounded text-[10px] font-bold border"
                      style={{ backgroundColor: '#dbeafe', borderColor: '#60a5fa', color: '#1e40af' }}
                    >
                      🤖 AI에 보낼 프롬프트 복사
                    </button>
                  </div>
                  <textarea
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    placeholder={`✏️ 위 [📋 빈 양식 불러오기] 버튼을 눌러 양식을 불러온 뒤 빈칸을 채우거나,
[🤖 AI 프롬프트 복사] 버튼으로 복사된 양식을 ChatGPT에 보내고 받은 답변을 여기에 붙여넣으세요.

또는 메모장·엑셀·카톡에서 자유 형식으로 복사·붙여넣기 OK`}
                    rows={10}
                    className="input text-[11px]"
                    style={{ resize: 'vertical', minHeight: '180px', backgroundColor: '#fffbeb' }}
                  />
                </Field>
                <div
                  className="text-[10px] -mt-1 p-2 rounded leading-relaxed"
                  style={{ backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}
                >
                  💡 내 메모: <b>{userNotes.length.toLocaleString()}자</b>
                  <br />
                  • <b>①(크롤링 자료) 또는 ②(내 메모) 중 하나만</b> 있어도 OK
                  <br />
                  • <b>②(내 메모)가 ①(크롤링 자료)보다 항상 우선</b> 적용
                  <br />
                  • 🚫 자료에 <b>없는 정보는 빈 칸으로 둠</b> (AI가 추측해서 채우지 않음). 빈 칸은 나중에 직접 채우거나 <b>🪄 빈 칸 채우기</b> 버튼 사용
                </div>
              </>
            )}

            {showPasteHint && extractMode === 'url' && (
              <div className="p-2 rounded text-[11px] font-bold" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                💡 봇 차단이 감지되었습니다. 위 <b>📋 텍스트 붙여넣기</b> 탭으로 전환해주세요.
              </div>
            )}

            <button
              onClick={handleAutoFillFromUrl}
              disabled={
                isExtracting ||
                (extractMode === 'url' && !referenceUrl.trim()) ||
                (extractMode === 'paste' && pastedText.trim().length < 50 && userNotes.trim().length < 10 && ocrImages.length === 0)
              }
              className="w-full py-2.5 rounded-lg text-white font-bold text-sm shadow disabled:opacity-50"
              style={{ backgroundColor: '#C8B6A6' }}
            >
              {isExtracting
                ? '🔍 분석 중...'
                : extractMode === 'url'
                ? '✨ URL 분석해서 자동 채우기'
                : '✨ 붙여넣은 내용 분석해서 자동 채우기'}
            </button>
            {extractResult && (
              <div
                className="p-3 rounded-lg border text-[11px] leading-relaxed space-y-1.5"
                style={{
                  backgroundColor: extractResult.filledFields.length === 0 ? '#fff7ed' : '#F7F3EE',
                  borderColor: extractResult.filledFields.length === 0 ? '#fdba74' : '#C8B6A6',
                  color: '#2F2A26',
                }}
              >
                {extractResult.normalizeNote && (
                  <div className="text-[10px] p-1.5 rounded" style={{ backgroundColor: '#fff', color: '#6b635c' }}>
                    {extractResult.normalizeNote}
                  </div>
                )}
                <div className="font-bold">
                  {extractResult.filledFields.length > 0 ? '✅' : '⚠️'} {extractResult.source}에서 {extractResult.contentLength?.toLocaleString() || 0}자 읽어와 {extractResult.filledFields.length}개 항목을 채웠습니다.
                </div>

                {extractResult.filledFields.length > 0 ? (
                  <div className="text-slate-600">
                    채워진 항목: <b>{extractResult.filledFields.join(', ')}</b>
                  </div>
                ) : (
                  <div className="space-y-1" style={{ color: '#9a3412' }}>
                    <div className="font-bold">페이지에서 제품 정보를 추출하지 못했습니다.</div>
                    <div className="text-[11px] leading-relaxed">
                      가능한 원인:
                      <br />• 중개·비교 사이트(aliprice 등)라 JS로만 로딩됨
                      <br />• 로그인·지역 차단된 페이지
                      <br />• 봇 차단이 강한 페이지
                    </div>
                    <div className="text-[11px] font-bold mt-1">
                      👉 해결 방법:
                      <br />1) 원본 1688/쿠팡 상품 페이지 URL을 직접 입력
                      <br />2) 페이지 내용을 복사해 아래 '제품 기본 정보' 칸에 직접 입력
                    </div>
                  </div>
                )}

                {extractResult.weakContent && extractResult.filledFields.length > 0 && (
                  <div className="text-[10px] p-1.5 rounded" style={{ backgroundColor: '#fef2f2', color: '#991b1b' }}>
                    ⚠️ 페이지 내용이 부족해 일부 정보만 추출되었을 수 있습니다. 결과를 확인해주세요.
                  </div>
                )}

                {extractResult.attempts && extractResult.attempts.length > 0 && (
                  <details className="mt-1">
                    <summary className="text-[10px] cursor-pointer text-slate-500">진단 정보</summary>
                    <div className="mt-1 text-[10px] text-slate-500 space-y-0.5">
                      {extractResult.finalUrl && (
                        <div>• 최종 URL: <code className="break-all">{extractResult.finalUrl}</code></div>
                      )}
                      {extractResult.attempts.map((a, i) => (
                        <div key={i}>• {a}</div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* ────── 추천 검색어 20개 추출 (쿠팡 SEO) ────── */}
            <div className="pt-3 mt-2 border-t" style={{ borderColor: '#f0ebe4' }}>
              <div className="text-[11px] font-bold mb-1.5" style={{ color: '#2F2A26' }}>
                🔍 쿠팡 추천 검색어 20개 추출
              </div>
              <div className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                위 자료(텍스트·메모·OCR 이미지·제품명)를 분석해 쿠팡/네이버쇼핑에 등록할 추천 검색어 20개를 자동 생성합니다.
              </div>
              <button
                type="button"
                onClick={handleExtractKeywords}
                disabled={isExtractingKeywords}
                className="w-full py-2 rounded-lg text-white font-bold text-[12px] shadow disabled:opacity-50"
                style={{ backgroundColor: '#7c5e4a' }}
              >
                {isExtractingKeywords ? '🔍 키워드 추출 중...' : '🔍 추천 검색어 20개 뽑기'}
              </button>

              {keywords.length > 0 && (
                <div className="mt-2 p-2 rounded-lg border" style={{ backgroundColor: '#F7F3EE', borderColor: '#C8B6A6' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[11px] font-bold" style={{ color: '#2F2A26' }}>
                      ✅ 추출된 검색어 {keywords.length}개
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const text = keywords.map((k) => `${k.rank}. ${k.keyword}`).join('\n');
                          navigator.clipboard.writeText(text);
                          alert('✅ 검색어 20개가 복사되었습니다!');
                        }}
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold border"
                        style={{ borderColor: '#C8B6A6', backgroundColor: '#fff', color: '#2F2A26' }}
                      >
                        📋 전체 복사
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // 쿠팡용 콤마 구분
                          const text = keywords.map((k) => k.keyword).join(', ');
                          navigator.clipboard.writeText(text);
                          alert('✅ 콤마 구분으로 복사됨 (쿠팡 검색어 입력칸에 바로 붙여넣기 가능)');
                        }}
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold border"
                        style={{ borderColor: '#C8B6A6', backgroundColor: '#fff', color: '#2F2A26' }}
                      >
                        📋 콤마 복사
                      </button>
                      <button
                        type="button"
                        onClick={() => setKeywords([])}
                        className="px-1.5 py-0.5 rounded text-[9px] border"
                        style={{ borderColor: '#C8B6A6', backgroundColor: '#fff', color: '#6b635c' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="space-y-0.5 max-h-[260px] overflow-y-auto pr-1">
                    {keywords.map((k, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 p-1 rounded text-[11px]"
                        style={{ backgroundColor: '#fff' }}
                      >
                        <span className="font-bold w-5 text-right" style={{ color: '#C8B6A6' }}>{k.rank ?? i + 1}.</span>
                        <span className="flex-1 truncate" style={{ color: '#2F2A26' }}>{k.keyword}</span>
                        {k.type && (
                          <span
                            className="text-[9px] px-1 py-0.5 rounded"
                            style={{
                              backgroundColor:
                                k.type === '핵심' ? '#dbeafe' :
                                k.type === '조합' ? '#dcfce7' :
                                k.type === '용도' ? '#fef3c7' : '#fce7f3',
                              color: '#2F2A26',
                            }}
                          >
                            {k.type}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(k.keyword);
                          }}
                          className="text-[9px] px-1 py-0.5 rounded border"
                          style={{ borderColor: '#e2ddd4', backgroundColor: '#fff', color: '#6b635c' }}
                          title="이 검색어 복사"
                        >
                          📋
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          <div data-tour="product-info">
          <Section title="3. 제품 기본 정보" emoji="🛍️" collapsible>
            <Field label="제품명" required>
              <input value={brief.productName} onChange={(e) => updateBrief({ productName: e.target.value })} className="input" placeholder="예) 욕실용 실리콘 미끄럼방지 매트" />
            </Field>

            {/* ✨ AI 자동 채움 버튼 — 제품명만 있으면 나머지 전부 채움 */}
            <div className="mb-3 rounded-lg border-2 border-dashed p-3" style={{ borderColor: '#E87A2B', background: '#FFF8F0' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm font-bold" style={{ color: '#E87A2B' }}>
                    ✨ AI가 나머지 빈 칸 알아서 채우기
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    제품명만 입력하면 강점·고객층·리뷰·FAQ 등 모든 칸을 AI가 추론해 채워줍니다. 이후 직접 수정 가능.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAutoFillEmpty}
                  disabled={isAutoFilling || !brief.productName?.trim()}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 whitespace-nowrap"
                  style={{ background: '#E87A2B' }}
                >
                  {isAutoFilling ? '채우는 중…' : '🪄 빈 칸 채우기'}
                </button>
              </div>
              {autoFillMessage && (
                <div className="mt-2 text-xs font-medium" style={{ color: '#2F7A3F' }}>{autoFillMessage}</div>
              )}
            </div>

            <Field label="제품 유형">
              <select value={brief.productType} onChange={(e) => updateBrief({ productType: e.target.value })} className="input">
                <option value="">(선택)</option>
                {PRODUCT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              {brief.productType && (
                <div className="text-[11px] mt-1.5 px-2 py-1.5 rounded" style={{ backgroundColor: '#FFF8F0', borderLeft: '3px solid #FDBA74', color: '#9A3412' }}>
                  ✨ <b>{brief.productType}</b> 카테고리 가이드 적용 중 — 톤/강조점/사진추천이 카테고리에 맞게 자동 조정됩니다.
                </div>
              )}
            </Field>
            <Field label="핵심 강점 3가지" required>
              {brief.strengths.map((s, i) => (
                <input key={i} value={s} onChange={(e) => updateArrayItem('strengths', i, e.target.value)} placeholder={`강점 ${i + 1}`} className="input mb-1.5" />
              ))}
            </Field>
            <Field label="주 고객층 3가지" required>
              {brief.targetCustomers.map((c, i) => (
                <input
                  key={i}
                  value={c}
                  onChange={(e) => updateArrayItem('targetCustomers', i, e.target.value)}
                  placeholder={
                    i === 0 ? '예) 좁은 주방 공간의 1인가구 30대 여성' :
                    i === 1 ? '예) 위생에 민감한 어린 자녀를 둔 부모' :
                              '예) 인테리어/수납에 관심 많은 신혼부부'
                  }
                  className="input mb-1.5"
                />
              ))}
            </Field>
            <Field label="소재">
              <input value={brief.material} onChange={(e) => updateBrief({ material: e.target.value })} placeholder="예) 식품 등급 실리콘, 스테인리스 304" className="input" />
            </Field>
            <Field label="사이즈/스펙" required={!brief.material}>
              <textarea rows={2} value={brief.sizeSpec} onChange={(e) => updateBrief({ sizeSpec: e.target.value })} placeholder="예) 가로 28cm × 세로 18cm × 높이 10cm / 1.2L" className="input resize-none" />
            </Field>
            <Field label="보유 사진 종류" required>
              <input value={brief.photoTypes} onChange={(e) => updateBrief({ photoTypes: e.target.value })} placeholder="예) 제품 단독컷, 디테일컷, 사용 장면컷, 라이프스타일컷" className="input" />
            </Field>

            {/* ─────────── 필수표기사항 (쿠팡 하단 필수 정보) ─────────── */}
            <div
              className="mt-4 p-3 rounded-lg border"
              style={{ backgroundColor: '#FFF8F0', borderColor: '#FDBA74' }}
            >
              <div className="text-sm font-extrabold mb-1" style={{ color: '#C2410C' }}>
                📋 상품 필수표기사항 (P10 하단에 자동 삽입)
              </div>
              <div className="text-[11px] mb-3" style={{ color: '#9A3412' }}>
                전자상거래법에 따른 필수 표기 정보입니다. 비우면 AI가 일반적인 값으로 자동 채웁니다.
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="품명 및 모델명">
                  <input
                    value={brief.compliance?.modelName || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, modelName: e.target.value } })}
                    placeholder="예) 주방선반 SK-100"
                    className="input"
                  />
                </Field>
                <Field label="크기/무게">
                  <input
                    value={brief.compliance?.sizeWeight || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, sizeWeight: e.target.value } })}
                    placeholder="예) 40×60×15cm / 1.2kg"
                    className="input"
                  />
                </Field>
                <Field label="색상">
                  <input
                    value={brief.compliance?.color || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, color: e.target.value } })}
                    placeholder="예) 실버, 화이트, 블랙"
                    className="input"
                  />
                </Field>
                <Field label="재질">
                  <input
                    value={brief.compliance?.material || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, material: e.target.value } })}
                    placeholder="예) 스테인리스 304"
                    className="input"
                  />
                </Field>
                <Field label="제조자/수입자">
                  <input
                    value={brief.compliance?.manufacturer || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, manufacturer: e.target.value } })}
                    placeholder="예) (주)○○기업"
                    className="input"
                  />
                </Field>
                <Field label="제조국">
                  <input
                    value={brief.compliance?.origin || ''}
                    onChange={(e) => updateBrief({ compliance: { ...brief.compliance, origin: e.target.value } })}
                    placeholder="예) 대한민국 / 중국"
                    className="input"
                  />
                </Field>
                <div className="col-span-2">
                  <Field label="A/S 책임자 및 연락처">
                    <input
                      value={brief.compliance?.asContact || ''}
                      onChange={(e) => updateBrief({ compliance: { ...brief.compliance, asContact: e.target.value } })}
                      placeholder="예) 고객센터 1588-0000 (평일 10:00-17:00)"
                      className="input"
                    />
                  </Field>
                </div>
              </div>
            </div>
          </Section>
          </div>

          <div data-tour="image-upload">
          <Section title="4. 제품 사진 업로드" emoji="📸" collapsible defaultCollapsed={images.length > 0} badge={images.length > 0 ? `${images.length}장` : null}>
            {/* 사진 개수 가이드 */}
            <div className="mb-2 p-2 rounded-lg text-[11px]" style={{
              backgroundColor: images.length >= 23 ? '#ECFDF5' : images.length >= 10 ? '#FFF8F0' : '#FEF2F2',
              borderLeft: `3px solid ${images.length >= 23 ? '#10B981' : images.length >= 10 ? '#E87A2B' : '#EF4444'}`,
            }}>
              <div className="font-bold mb-0.5">
                📸 현재 <span style={{ color: images.length >= 23 ? '#059669' : images.length >= 10 ? '#C2410C' : '#991B1B' }}>
                  {images.length}장
                </span> 업로드됨 {images.length >= 23 ? '✓ 모든 페이지에 다른 사진 배치 가능!' : `(이상적 23장, ${Math.max(0, 23 - images.length)}장 더 추가하면 완벽)`}
              </div>
              <div className="text-slate-600 leading-relaxed">
                각 페이지별 사진 할당: P1(1장)·P2(3장)·P3(1장)·P4(4장)·P5(1장)·P6(2장)·P7(3장)·P8(4장)·P9(3장)·P10(1장) = <b>총 23장</b>.
                {images.length < 23 && <span className="block mt-0.5">부족하면 처음부터 순환해서 재사용됩니다 (중복 발생).</span>}
              </div>
            </div>

            <label className="block">
              <div className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition" style={{ borderColor: '#C8B6A6' }}>
                <div className="text-xl mb-1">⬆️</div>
                <div className="text-sm font-semibold" style={{ color: '#2F2A26' }}>클릭해서 이미지 추가</div>
                <div className="text-[11px] text-slate-500 mt-1">여러 장 한번에 추가 가능 · 우측 상단 × 버튼으로 삭제</div>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
              </div>
            </label>
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {images.map((src, idx) => {
                  // 사진 인덱스에 따른 페이지 할당 라벨
                  const pageLabel = (() => {
                    if (idx === 0) return 'P1';
                    if (idx >= 1 && idx <= 3) return 'P2';
                    if (idx === 4) return 'P3';
                    if (idx >= 5 && idx <= 8) return 'P4';
                    if (idx === 9) return 'P5';
                    if (idx >= 10 && idx <= 11) return 'P6';
                    if (idx >= 12 && idx <= 14) return 'P7';
                    if (idx >= 15 && idx <= 18) return 'P8';
                    if (idx >= 19 && idx <= 21) return 'P9';
                    if (idx === 22) return 'P10';
                    return '순환';
                  })();
                  return (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 border-2" style={{ borderColor: '#e2ddd4' }}>
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <div className="absolute top-1 left-1 bg-black/80 text-white text-[11px] font-bold px-1.5 py-0.5 rounded">
                        #{idx + 1}
                      </div>
                      {/* 페이지 할당 라벨 */}
                      <div className="absolute top-1 right-8 text-white text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                        backgroundColor: pageLabel === '순환' ? '#9CA3AF' : '#E87A2B',
                      }}>
                        {pageLabel}
                      </div>
                      {/* 항상 보이는 삭제 버튼 */}
                      <button
                        onClick={() => removeImage(idx)}
                        title="이 사진 삭제"
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm font-bold shadow-md flex items-center justify-center"
                      >
                        ×
                      </button>

                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-2 text-[11px] text-slate-500">
              💡 각 사진의 오렌지 라벨은 <b>해당 페이지에 배치될 순서</b>를 뜻합니다 (P1→P2→…→P10).
              23장 넘으면 "순환"으로 재사용됩니다.
            </div>
          </Section>
          </div>

          <Section title="5. 리뷰 4개 (P4 필수)" emoji="⭐" collapsible>
            {brief.reviews.map((r, i) => (
              <div key={i} className="space-y-1.5 mb-3 pb-3 border-b last:border-b-0" style={{ borderColor: '#e2ddd4' }}>
                <div className="text-[11px] font-bold text-slate-500">리뷰 {i + 1}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input placeholder="닉네임" value={r.nickname} onChange={(e) => updateObjectArrayItem('reviews', i, 'nickname', e.target.value)} className="input" />
                  <input placeholder="날짜 (예: 2024.08.12)" value={r.date} onChange={(e) => updateObjectArrayItem('reviews', i, 'date', e.target.value)} className="input" />
                </div>
                <textarea rows={2} placeholder="리뷰 내용 (60자 내외 권장)" value={r.body} onChange={(e) => updateObjectArrayItem('reviews', i, 'body', e.target.value)} className="input resize-none text-[13px]" />
              </div>
            ))}
          </Section>

          <Section title="6. P5 2지선다 비교표 (내 제품 vs 일반 제품)" emoji="⚖️" collapsible>
            <div className="text-[11px] text-slate-500 mb-2 leading-relaxed">
              각 행에 <b>내 제품의 차별점</b>과 <b>일반 제품의 모습</b>을 함께 입력하세요.
              <br />비워두면 AI가 "일반적인 모습"을 추측해서 채웁니다.
            </div>
            <Field label="일반 제품 이름 (비교 대상)">
              <input
                value={brief.generalProductName}
                onChange={(e) => updateBrief({ generalProductName: e.target.value })}
                placeholder="예) 일반 주방선반, 기존 방식, 타사 제품"
                className="input"
              />
            </Field>
            <div className="space-y-2 mt-2">
              {brief.differences.map((d, i) => (
                <div
                  key={i}
                  className="p-2 rounded border"
                  style={{ backgroundColor: '#F7F3EE', borderColor: '#e2ddd4' }}
                >
                  <div className="text-[10px] font-bold text-slate-500 mb-1">
                    비교 항목 {i + 1}
                  </div>
                  <input
                    value={d}
                    onChange={(e) => updateArrayItem('differences', i, e.target.value)}
                    placeholder={`내 제품: 예) 두께 3mm로 튼튼함`}
                    className="input mb-1 text-[12px]"
                    style={{ borderColor: '#C8B6A6' }}
                  />
                  <input
                    value={brief.generalProductFeatures?.[i] || ''}
                    onChange={(e) => updateArrayItem('generalProductFeatures', i, e.target.value)}
                    placeholder={`일반 제품: 예) 두께 1mm로 잘 휘어짐`}
                    className="input text-[12px]"
                    style={{ borderColor: '#d4d0c9' }}
                  />
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs mt-2">
              <input type="checkbox" checked={brief.hasGeneralProductPhoto} onChange={(e) => updateBrief({ hasGeneralProductPhoto: e.target.checked })} />
              비교용 일반 제품 사진 있음
            </label>
          </Section>

          <Section title="7. 활용법 4가지 (P8 필수)" emoji="💡" collapsible>
            {brief.usages.map((u, i) => (
              <input key={i} value={u} onChange={(e) => updateArrayItem('usages', i, e.target.value)} placeholder={`활용법 ${i + 1}`} className="input mb-1.5" />
            ))}
          </Section>

          <Section title="8. 사용 순서 3단계 (P9 필수)" emoji="🔢" collapsible>
            {brief.usageSteps.map((s, i) => (
              <input key={i} value={s} onChange={(e) => updateArrayItem('usageSteps', i, e.target.value)} placeholder={`STEP ${i + 1}`} className="input mb-1.5" />
            ))}
          </Section>

          <Section title="9. FAQ 5개 (P10 필수)" emoji="❓" collapsible>
            {brief.faqs.map((f, i) => (
              <div key={i} className="space-y-1.5 mb-2 pb-2 border-b last:border-b-0" style={{ borderColor: '#e2ddd4' }}>
                <input placeholder={`Q${i + 1}`} value={f.q} onChange={(e) => updateObjectArrayItem('faqs', i, 'q', e.target.value)} className="input" />
                <input placeholder={`A${i + 1}`} value={f.a} onChange={(e) => updateObjectArrayItem('faqs', i, 'a', e.target.value)} className="input" />
              </div>
            ))}
          </Section>
        </aside>
  );
}
