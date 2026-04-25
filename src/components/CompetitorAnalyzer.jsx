import { useState, useRef } from 'react';
import { analyzeCompetitor } from '../lib/competitorAnalyzer.js';

/**
 * CompetitorAnalyzer — 경쟁사 상세페이지 AI 분석기
 *
 * Props:
 *   apiKey         OpenAI API 키
 *   model          텍스트 모델 — vision 호출은 항상 gpt-4o 사용
 *   productName    내 제품명
 *   productType    내 제품 유형
 *   toneNote       내 브랜드 톤 (선택)
 *   reviewInsights ReviewAnalyzer 결과 (선택, 갭 분석에 활용)
 *   onApplyToBrief(updates)  분석 결과를 브리프에 자동반영하는 콜백
 *                  updates = { painPointHints?, uspHints?, headlineHints?, structureHint? }
 */
export default function CompetitorAnalyzer({
  apiKey,
  model = 'gpt-4o-mini',
  productName = '',
  productType = '',
  toneNote = '',
  reviewInsights = null,
  onApplyToBrief = null,
}) {
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [screenshots, setScreenshots] = useState([]); // dataURL[]
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('summary'); // summary | structure | usp | gap | headlines
  const [applied, setApplied] = useState(false); // 브리프 반영 여부 표시
  const fileInputRef = useRef(null);

  // 스크린샷 업로드 (data URL 변환)
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (screenshots.length + files.length > 10) {
      setError('스크린샷은 최대 10장까지만 가능합니다.');
      e.target.value = '';
      return;
    }
    const reads = await Promise.all(
      files.map(
        (f) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(f);
          }),
      ),
    );
    const valid = reads.filter(Boolean);
    setScreenshots((prev) => [...prev, ...valid]);
    setError('');
    e.target.value = '';
  };

  const removeShot = (idx) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAnalyze = async () => {
    setError('');
    setResult(null);
    setApplied(false);

    if (!apiKey?.trim()) {
      setError('사이드바에 OpenAI API 키를 먼저 입력해 주세요.');
      return;
    }
    if (screenshots.length === 0) {
      setError('스크린샷을 1장 이상 업로드해 주세요.');
      return;
    }

    setBusy(true);
    setProgress(`${screenshots.length}장 분석 중... (약 20~40초)`);

    try {
      const r = await analyzeCompetitor({
        apiKey,
        model: 'gpt-4o', // vision 필수
        screenshots,
        competitorUrl,
        myProductName: productName,
        myProductType: productType,
        myToneNote: toneNote,
        reviewInsights,
      });
      setResult(r);
      setProgress('✅ 분석 완료');
      setTimeout(() => setProgress(''), 2500);
      setActiveTab('summary');
    } catch (e) {
      setError(e?.message || String(e));
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  // 브리프 자동 반영
  const handleApplyToBrief = () => {
    if (!result || !onApplyToBrief) return;
    onApplyToBrief({
      uspHints: result.usp.map((u) => u.point).filter(Boolean),
      gapHints: result.gapAnalysis.map((g) => g.ourOpportunity).filter(Boolean),
      headlineHints: result.headlines.map((h) => h.ourVersion).filter(Boolean),
      structureHint: result.structure?.flow || '',
    });
    setApplied(true);
    setTimeout(() => setApplied(false), 4000);
  };

  // 결과 JSON 다운로드
  const downloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify({ url: competitorUrl, ...result }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `competitor-analysis-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ───────── 렌더 ─────────
  return (
    <div className="space-y-3">
      {/* 안내 박스 */}
      <div
        className="p-3 rounded-lg text-[12px] leading-relaxed"
        style={{ backgroundColor: '#F0F9FF', borderLeft: '3px solid #0EA5E9' }}
      >
        <div className="font-bold mb-1" style={{ color: '#0369A1' }}>
          🔍 경쟁사 상세페이지 AI 분석기
        </div>
        <div className="text-slate-700">
          경쟁사 페이지를 캡처해서 올리면 AI가 <b>구조 / USP / 약점 / 카피</b> 4가지를 분석합니다.
          {reviewInsights?.painPoints?.length > 0 && (
            <>
              <br />
              💡 위 리뷰 분석의 <b>불만 포인트 {reviewInsights.painPoints.length}개</b>도 자동 매칭됩니다.
            </>
          )}
        </div>
      </div>

      {/* URL 입력 (선택) */}
      <div>
        <div className="text-[12px] font-bold mb-1" style={{ color: '#2F2A26' }}>
          1. 경쟁사 URL <span className="font-normal text-slate-500 text-[11px]">(선택, 메모용)</span>
        </div>
        <input
          type="url"
          value={competitorUrl}
          onChange={(e) => setCompetitorUrl(e.target.value)}
          placeholder="https://www.coupang.com/vp/products/..."
          className="input"
        />
        <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
          ⚠️ 쿠팡은 봇 차단으로 URL만으로는 본문을 못 읽습니다. <b>스크린샷이 필수</b>예요.
        </div>
      </div>

      {/* 스크린샷 업로드 */}
      <div>
        <div className="text-[12px] font-bold mb-1" style={{ color: '#2F2A26' }}>
          2. 상세페이지 스크린샷 <span className="text-red-500">*</span>
          <span className="ml-2 text-[10px] font-normal text-slate-500">
            ({screenshots.length}/10장)
          </span>
        </div>
        <label className="block">
          <div
            className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition hover:bg-slate-50"
            style={{ borderColor: '#0EA5E9' }}
          >
            <div className="text-xl mb-1">📸</div>
            <div className="text-sm font-semibold" style={{ color: '#0369A1' }}>
              클릭해서 스크린샷 업로드
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              여러 장 동시 가능 · 1~10장 권장 · PNG/JPG
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        </label>

        {/* 캡처 가이드 */}
        <details className="mt-2 text-[11px]">
          <summary className="cursor-pointer text-slate-600 font-semibold hover:text-slate-800">
            💡 캡처 방법 모르겠어요 (클릭해서 가이드 보기)
          </summary>
          <div className="mt-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 leading-relaxed text-slate-700">
            <div className="mb-1.5">
              <b>🖥️ PC (Chrome, 추천)</b>
              <br />
              경쟁사 페이지 열기 → 우클릭 → <b>검사</b> → Cmd/Ctrl + Shift + P → "Capture full size
              screenshot" 입력 → Enter
              <br />→ 페이지 전체가 한 장에 캡처됩니다.
            </div>
            <div className="mb-1.5">
              <b>📱 갤럭시</b>: 캡처 → 하단 "스크롤 캡처" 반복
            </div>
            <div className="mb-1.5">
              <b>📱 아이폰</b>: 캡처 → 미리보기 → "전체 페이지" 탭 → PDF로 저장 후 PNG 변환
            </div>
            <div>
              <b>🐢 가장 쉬운 방법</b>: 일반 캡처로 위 → 중간 → 아래 3~5장 따로 올리기
            </div>
          </div>
        </details>

        {/* 업로드된 스크린샷 미리보기 */}
        {screenshots.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {screenshots.map((src, idx) => (
              <div
                key={idx}
                className="relative aspect-[3/4] rounded-lg overflow-hidden bg-slate-100 border-2"
                style={{ borderColor: '#bae6fd' }}
              >
                <img src={src} alt={`screenshot-${idx + 1}`} className="w-full h-full object-cover" />
                <div className="absolute top-1 left-1 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  #{idx + 1}
                </div>
                <button
                  onClick={() => removeShot(idx)}
                  title="삭제"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm font-bold shadow-md flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 분석 버튼 */}
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={busy || screenshots.length === 0}
        className="w-full py-2.5 rounded-lg font-bold text-sm transition disabled:opacity-50"
        style={{
          backgroundColor: busy ? '#7DD3FC' : '#0EA5E9',
          color: '#fff',
          cursor: busy || screenshots.length === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? `🔍 ${progress || '분석 중...'}` : `🔍 AI 분석 시작 (${screenshots.length}장)`}
      </button>

      {/* 비용 안내 */}
      {!busy && screenshots.length > 0 && (
        <div className="text-[10px] text-slate-500 text-center">
          💰 예상 비용: 약 {Math.max(50, screenshots.length * 15)}~{screenshots.length * 25}원 (gpt-4o vision)
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="p-2.5 rounded-lg text-[12px]" style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
          ⚠️ {error}
        </div>
      )}

      {/* 진행 상태 */}
      {busy && progress && (
        <div className="p-2.5 rounded-lg text-[12px] bg-blue-50 text-blue-800 text-center">
          {progress}
        </div>
      )}

      {/* 결과 표시 */}
      {result && (
        <div className="border-2 rounded-xl overflow-hidden" style={{ borderColor: '#0EA5E9' }}>
          {/* 헤더 + 액션 */}
          <div className="p-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between flex-wrap gap-2">
            <div className="font-bold text-sm" style={{ color: '#0369A1' }}>
              📊 분석 결과 ({result.meta.imageCount}장 분석됨)
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {onApplyToBrief && (
                <button
                  onClick={handleApplyToBrief}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-md text-white transition"
                  style={{ backgroundColor: applied ? '#16A34A' : '#0EA5E9' }}
                >
                  {applied ? '✓ 브리프 반영됨' : '⚡ 브리프에 자동반영'}
                </button>
              )}
              <button
                onClick={downloadJson}
                className="text-[11px] font-bold px-2.5 py-1 rounded-md border bg-white"
                style={{ borderColor: '#0EA5E9', color: '#0369A1' }}
              >
                💾 JSON 저장
              </button>
            </div>
          </div>

          {/* 탭 */}
          <div className="flex border-b border-slate-200 bg-white overflow-x-auto">
            {[
              { key: 'summary', label: '📝 요약' },
              { key: 'structure', label: '📐 구조' },
              { key: 'usp', label: '💎 USP' },
              { key: 'gap', label: '⚠️ 약점' },
              { key: 'headlines', label: '📢 카피' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className="px-3 py-2 text-[11px] font-bold whitespace-nowrap transition"
                style={{
                  color: activeTab === t.key ? '#0369A1' : '#64748B',
                  borderBottom: activeTab === t.key ? '2px solid #0EA5E9' : '2px solid transparent',
                  backgroundColor: activeTab === t.key ? '#F0F9FF' : 'transparent',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 탭 콘텐츠 */}
          <div className="p-3 bg-white max-h-[420px] overflow-y-auto">
            {activeTab === 'summary' && (
              <div className="text-[12px] leading-relaxed text-slate-800">
                {result.summary || '(요약 없음)'}
              </div>
            )}

            {activeTab === 'structure' && (
              <div>
                <div className="text-[12px] mb-2 p-2 rounded bg-slate-50 border border-slate-200">
                  <b>전체 흐름:</b> {result.structure.flow || '(미파악)'}
                </div>
                <div className="space-y-1.5">
                  {result.structure.sections.map((s, i) => (
                    <div
                      key={i}
                      className="p-2 rounded border border-slate-200 bg-white text-[11px]"
                    >
                      <div className="font-bold text-slate-800">
                        {s.order}. {s.name}
                      </div>
                      <div className="text-slate-600 mt-0.5">
                        🎯 {s.purpose}
                      </div>
                      {s.note && (
                        <div className="text-slate-500 mt-0.5">📝 {s.note}</div>
                      )}
                    </div>
                  ))}
                  {result.structure.sections.length === 0 && (
                    <div className="text-slate-500 text-[11px]">(섹션 분석 결과 없음)</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'usp' && (
              <div className="space-y-1.5">
                {result.usp.map((u, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded border bg-amber-50 border-amber-200 text-[11px]"
                  >
                    <div className="font-bold text-amber-900">
                      💎 #{u.rank} {u.point}
                    </div>
                    {u.evidence && (
                      <div className="text-amber-800 mt-1">📍 근거: {u.evidence}</div>
                    )}
                  </div>
                ))}
                {result.usp.length === 0 && (
                  <div className="text-slate-500 text-[11px]">(USP 추출 결과 없음)</div>
                )}
              </div>
            )}

            {activeTab === 'gap' && (
              <div className="space-y-1.5">
                {result.gapAnalysis.map((g, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded border bg-rose-50 border-rose-200 text-[11px]"
                  >
                    <div className="font-bold text-rose-900">⚠️ {g.weakness}</div>
                    <div className="text-rose-700 mt-1">
                      💡 <b>우리의 기회:</b> {g.ourOpportunity}
                    </div>
                    {g.linkedPainPoint && (
                      <div className="text-rose-600 mt-1 text-[10px]">
                        🔗 연관 불만: <b>{g.linkedPainPoint}</b>
                      </div>
                    )}
                  </div>
                ))}
                {result.gapAnalysis.length === 0 && (
                  <div className="text-slate-500 text-[11px]">(약점 분석 결과 없음)</div>
                )}
              </div>
            )}

            {activeTab === 'headlines' && (
              <div className="space-y-1.5">
                {result.headlines.map((h, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded border bg-violet-50 border-violet-200 text-[11px]"
                  >
                    <div className="text-slate-500 line-through text-[10px]">
                      원본: {h.original}
                    </div>
                    <div className="font-bold text-violet-900 mt-1">
                      ✨ 우리 톤: {h.ourVersion}
                    </div>
                    {h.why && (
                      <div className="text-violet-700 mt-1 text-[10px]">💭 {h.why}</div>
                    )}
                  </div>
                ))}
                {result.headlines.length === 0 && (
                  <div className="text-slate-500 text-[11px]">(헤드라인 추출 결과 없음)</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
