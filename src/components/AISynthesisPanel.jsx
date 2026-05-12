import { useState, useEffect, useMemo } from 'react';
import {
  synthesizeBatch,
  BACKGROUND_PRESETS,
  MOOD_PRESETS,
  SYNTHESIS_MODELS,
} from '../lib/imageSynthesis.js';

/**
 * AISynthesisPanel — AI 사진 합성 패널 (청소솔/생활용품 특화)
 *
 * Props:
 *   apiKey            OpenAI API 키
 *   productName       제품명 (브리프에서 가져옴)
 *   uploadedImages    업로드된 사진 목록 (data URL 배열)
 *   initialSourceUrl  🆕 미리보기에서 클릭/활성화된 사진의 실제 URL
 *                     이 값이 있으면 모달이 열릴 때 자동으로 그 사진을 기준 사진으로 선택
 *                     (라이브러리에 없는 URL이라도 그 자체를 기준으로 사용 — 자유 사진 등)
 *   currentPage       현재 작업 페이지 (P1~P10) — 안내 표시용
 *   onAddImages(urls) 생성된 이미지를 사진 라이브러리에 추가하는 콜백
 */
export default function AISynthesisPanel({
  apiKey,
  falApiKey = '',
  productName = '',
  uploadedImages = [],
  initialSourceUrl = null,
  currentPage = '',
  onAddImages = () => {},
}) {
  // 🆕 모델 선택 (기본: nano-banana-2 — 가성비 최고)
  // localStorage 에서 마지막 선택 복원
  const [modelKey, setModelKey] = useState(() => {
    try {
      const saved = localStorage.getItem('ai_synthesis_model');
      if (saved && SYNTHESIS_MODELS[saved]) return saved;
    } catch (_) {}
    return 'nano-banana-2';
  });
  useEffect(() => {
    try { localStorage.setItem('ai_synthesis_model', modelKey); } catch (_) {}
  }, [modelKey]);
  const provider = modelKey === 'openai' ? 'openai' : 'fal';
  // ───────── 상태 ─────────
  const [mode, setMode] = useState('background');

  // sourceIdx 의 의미:
  //   -1  → 단품 사진 없이 (텍스트만)
  //   -2  → 외부 URL 사용 (initialSourceUrl, 라이브러리에 없는 URL)
  //   ≥0  → uploadedImages[sourceIdx] 사용
  // initialSourceUrl 이 라이브러리에 있으면 그 인덱스, 없으면 -2 로 시작
  const initialIdx = useMemo(() => {
    if (initialSourceUrl) {
      const idx = uploadedImages.indexOf(initialSourceUrl);
      if (idx >= 0) return idx;
      return -2; // 외부 URL (자유 사진 등 — 라이브러리에 없음)
    }
    return uploadedImages.length > 0 ? 0 : -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount 시점 1회만

  const [sourceIdx, setSourceIdx] = useState(initialIdx);

  // initialSourceUrl 이 바뀌면 (사용자가 다른 사진 클릭 후 모달 다시 열기 등) 갱신
  useEffect(() => {
    if (!initialSourceUrl) return;
    const idx = uploadedImages.indexOf(initialSourceUrl);
    if (idx >= 0) {
      setSourceIdx(idx);
    } else {
      setSourceIdx(-2);
    }
  }, [initialSourceUrl, uploadedImages]);

  const [backgroundKey, setBackgroundKey] = useState('bathroom');
  const [customBackground, setCustomBackground] = useState('');
  const [moodKey, setMoodKey] = useState('clean');
  const [extraNote, setExtraNote] = useState('');
  const [count, setCount] = useState(1);
  const [size, setSize] = useState('1024x1024');

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(''); // '2/4 생성 중...'
  const [results, setResults] = useState([]);   // [{ url, prompt }]
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false); // 기준 사진 변경 셀렉터 펼치기

  // 모드 정의
  const MODES = [
    {
      key: 'background',
      label: '🖼️ 배경 교체',
      desc: '제품은 그대로, 배경만 바꿔요',
    },
    {
      key: 'usage',
      label: '🧽 사용 장면',
      desc: '제품을 실제로 사용하는 장면',
    },
    {
      key: 'beforeAfter',
      label: '✨ Before/After',
      desc: '더러운 → 깨끗한 비교 (2장 자동)',
    },
    {
      key: 'handHeld',
      label: '🤚 손에 쥔 컷',
      desc: '그립감 · 사이즈 강조',
    },
    {
      key: 'multiAngle',
      label: '🔄 다양한 각도',
      desc: '같은 제품 다른 각도 여러 컷',
    },
  ];

  // 모드별 표시 제어
  const showBackground = mode !== 'multiAngle' || true; // 모든 모드에서 배경 사용
  const showCount = mode === 'multiAngle' || mode === 'background' || mode === 'usage' || mode === 'handHeld';
  const showMood = mode !== 'beforeAfter'; // beforeAfter는 자동으로 톤 설정

  const handleGenerate = async () => {
    setError('');
    setResults([]);

    // 모델별 API 키 검증
    if (provider === 'fal') {
      if (!falApiKey || !falApiKey.trim()) {
        setError('fal.ai API 키를 사이드바에 먼저 입력해 주세요. (Nano Banana 모델 사용 시 필요)');
        return;
      }
    } else {
      if (!apiKey || !apiKey.trim()) {
        setError('OpenAI API 키를 사이드바에 먼저 입력해 주세요.');
        return;
      }
    }
    if (sourceIdx >= 0 && !uploadedImages[sourceIdx]) {
      setError('기준 사진을 선택하거나 "단품 사진 없이"를 선택해 주세요.');
      return;
    }
    if (sourceIdx === -2 && !initialSourceUrl) {
      setError('기준 사진을 선택해 주세요.');
      return;
    }
    if (backgroundKey === 'custom' && !customBackground.trim()) {
      setError('직접 입력을 선택했어요. 배경 설명을 적어 주세요.');
      return;
    }

    const realCount = mode === 'beforeAfter' ? 2 : count;
    setBusy(true);
    setProgress(`${realCount}장 생성 시작... (${SYNTHESIS_MODELS[modelKey]?.label || modelKey})`);

    try {
      // 기준 사진 URL 결정:
      //   sourceIdx >= 0 → 라이브러리의 사진
      //   sourceIdx === -2 → 외부(자유 사진 등) URL
      //   sourceIdx === -1 → null (텍스트만)
      const sourceImageDataUrl =
        sourceIdx >= 0 ? uploadedImages[sourceIdx] :
        sourceIdx === -2 ? initialSourceUrl :
        null;

      const items = await synthesizeBatch({
        apiKey,
        falApiKey,
        provider,
        modelKey,
        mode,
        productName,
        backgroundKey,
        customBackground,
        moodKey,
        extraNote,
        sourceImageDataUrl,
        size,
        count: realCount,
      });

      setResults(items);
      setProgress(`✅ ${items.length}장 생성 완료!`);
      setTimeout(() => setProgress(''), 3000);
    } catch (e) {
      setError(`생성 실패: ${e.message || e}`);
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  const handleAddOne = (idx) => {
    const item = results[idx];
    if (!item) return;
    onAddImages([item.url]);
    // 추가 후 결과에서는 회색 처리만 (재추가 가능)
  };

  const handleAddAll = () => {
    if (!results.length) return;
    onAddImages(results.map((r) => r.url));
  };

  const downloadOne = (idx) => {
    const item = results[idx];
    if (!item) return;
    const a = document.createElement('a');
    a.href = item.url;
    a.download = `ai-synthesis-${Date.now()}-${idx + 1}.png`;
    a.click();
  };

  // ───────── 렌더 ─────────
  return (
    <div className="space-y-3">
      {/* 안내 박스 */}
      <div className="p-3 rounded-lg text-[12px] leading-relaxed" style={{
        backgroundColor: '#FFF8F0',
        borderLeft: '3px solid #E87A2B',
      }}>
        <div className="font-bold mb-1" style={{ color: '#C2410C' }}>
          🎨 AI 사진 합성 (청소솔/생활용품 특화)
        </div>
        <div className="text-slate-700">
          단품 사진 한 장만 있으면 → 다양한 배경 · 사용 장면 · Before/After 컷을 AI가 자동으로 만들어줍니다.
          생성된 사진은 바로 위 "제품 사진 업로드" 라이브러리에 추가할 수 있어요.
        </div>
      </div>

      {/* 🆕 0) AI 모델 선택 */}
      <div>
        <div className="text-[12px] font-bold mb-1.5" style={{ color: '#2F2A26' }}>
          0. AI 모델 선택
          <span className="ml-2 text-[10px] font-normal text-slate-500">
            (제품 일관성 · 자연스러움이 가장 중요한 부분)
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {Object.entries(SYNTHESIS_MODELS).map(([key, info]) => {
            const active = modelKey === key;
            const needsFalKey = key !== 'openai';
            const keyMissing = needsFalKey ? !falApiKey?.trim() : !apiKey?.trim();
            return (
              <button
                key={key}
                type="button"
                onClick={() => setModelKey(key)}
                className="text-left p-2 rounded-lg transition border-2 flex items-center justify-between gap-2"
                style={{
                  borderColor: active ? '#E87A2B' : '#e2ddd4',
                  backgroundColor: active ? '#FFF8F0' : '#fff',
                }}
              >
                <div className="flex-1">
                  <div className="text-[12px] font-bold" style={{ color: active ? '#C2410C' : '#2F2A26' }}>
                    {info.label}
                    {keyMissing && (
                      <span className="ml-1 text-[9px] font-bold text-red-500">⚠️ API 키 필요</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    품질 {info.quality} · {info.cost}
                  </div>
                </div>
                {active && <span style={{ color: '#E87A2B', fontWeight: 800 }}>✓</span>}
              </button>
            );
          })}
        </div>
        {provider === 'fal' && !falApiKey?.trim() && (
          <div className="mt-1.5 text-[10px] text-red-600 leading-relaxed p-2 rounded bg-red-50 border border-red-200">
            🔑 사이드바 "1. OpenAI 설정" 섹션에서 <b>fal.ai API Key</b>를 먼저 입력해 주세요.<br />
            발급: <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer" className="underline font-bold">fal.ai/dashboard/keys</a>
          </div>
        )}
      </div>

      {/* 1) 모드 선택 */}
      <div>
        <div className="text-[12px] font-bold mb-1.5" style={{ color: '#2F2A26' }}>
          1. 어떤 사진을 만들까요?
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className="text-left p-2 rounded-lg transition border-2"
              style={{
                borderColor: mode === m.key ? '#E87A2B' : '#e2ddd4',
                backgroundColor: mode === m.key ? '#FFF8F0' : '#fff',
              }}
            >
              <div className="text-[12px] font-bold" style={{ color: mode === m.key ? '#C2410C' : '#2F2A26' }}>
                {m.label}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 2) 기준 사진 — 선택된 1장만 크게 표시 + 변경 버튼 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[12px] font-bold" style={{ color: '#2F2A26' }}>
            2. 기준 사진
            {currentPage && sourceIdx === -2 && (
              <span className="ml-2 text-[10px] font-normal text-orange-600">
                ({currentPage} 미리보기에서 클릭한 사진)
              </span>
            )}
            {uploadedImages.length === 0 && sourceIdx !== -2 && (
              <span className="text-red-500 font-normal"> (업로드된 사진이 없어요)</span>
            )}
          </div>
          {(uploadedImages.length > 0 || sourceIdx === -2) && (
            <button
              type="button"
              onClick={() => setShowPicker((s) => !s)}
              className="text-[11px] font-bold px-2 py-1 rounded-md border transition"
              style={{
                borderColor: showPicker ? '#E87A2B' : '#C8B6A6',
                backgroundColor: showPicker ? '#FFF8F0' : '#fff',
                color: showPicker ? '#C2410C' : '#2F2A26',
              }}
            >
              {showPicker ? '✓ 닫기' : '🔄 사진 변경'}
            </button>
          )}
        </div>

        {(uploadedImages.length > 0 || sourceIdx === -2) ? (
          <>
            {/* 선택된 사진 크게 표시 */}
            <div className="rounded-xl overflow-hidden border-2 bg-slate-50" style={{ borderColor: '#E87A2B' }}>
              {sourceIdx === -1 ? (
                <div className="aspect-video flex items-center justify-center" style={{ backgroundColor: '#FFF8F0' }}>
                  <div className="text-center">
                    <div className="text-3xl mb-1">🚫</div>
                    <div className="text-[12px] font-bold" style={{ color: '#C2410C' }}>단품 사진 없이 (텍스트만으로 생성)</div>
                    <div className="text-[10px] text-slate-500 mt-1">결과는 일반적인 제품 이미지가 됩니다</div>
                  </div>
                </div>
              ) : sourceIdx === -2 && initialSourceUrl ? (
                <div className="relative">
                  <img
                    src={initialSourceUrl}
                    alt=""
                    className="w-full"
                    style={{ maxHeight: 280, objectFit: 'contain', backgroundColor: '#fff' }}
                  />
                  <div className="absolute top-2 left-2 bg-orange-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                    ✓ 미리보기에서 선택한 사진
                  </div>
                </div>
              ) : uploadedImages[sourceIdx] ? (
                <div className="relative">
                  <img
                    src={uploadedImages[sourceIdx]}
                    alt=""
                    className="w-full"
                    style={{ maxHeight: 280, objectFit: 'contain', backgroundColor: '#fff' }}
                  />
                  <div className="absolute top-2 left-2 bg-orange-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                    ✓ 기준 사진 #{sourceIdx + 1}
                  </div>
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center text-[12px] text-slate-500">
                  사진을 선택해 주세요
                </div>
              )}
            </div>

            {/* 변경 버튼 누르면 작은 셀렉터 펼침 */}
            {showPicker && (
              <div className="mt-2 p-2 rounded-lg border" style={{ borderColor: '#e2ddd4', backgroundColor: '#fafafa' }}>
                <div className="text-[10px] font-bold mb-1.5 text-slate-600">
                  사진을 클릭해서 기준 사진을 변경하세요
                </div>
                <div className="grid grid-cols-6 gap-1.5 max-h-[180px] overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => { setSourceIdx(-1); setShowPicker(false); }}
                    className="aspect-square rounded-md border-2 border-dashed flex items-center justify-center transition"
                    style={{
                      borderColor: sourceIdx === -1 ? '#E87A2B' : '#C8B6A6',
                      backgroundColor: sourceIdx === -1 ? '#FFF8F0' : '#fff',
                    }}
                    title="단품 사진 없이 텍스트로만 생성"
                  >
                    <div className="text-center">
                      <div className="text-base">🚫</div>
                      <div className="text-[8px] font-bold" style={{ color: sourceIdx === -1 ? '#C2410C' : '#7C6F65' }}>
                        없이
                      </div>
                    </div>
                  </button>
                  {uploadedImages.map((src, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => { setSourceIdx(idx); setShowPicker(false); }}
                      className="relative aspect-square rounded-md overflow-hidden border-2 transition"
                      style={{
                        borderColor: sourceIdx === idx ? '#E87A2B' : '#e2ddd4',
                      }}
                    >
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <div className="absolute top-0.5 left-0.5 bg-black/70 text-white text-[8px] font-bold px-1 rounded">
                        #{idx + 1}
                      </div>
                      {sourceIdx === idx && (
                        <div className="absolute inset-0 bg-orange-500/30 flex items-center justify-center">
                          <div className="bg-orange-600 text-white text-[8px] font-bold px-1 rounded">✓</div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-2 rounded-lg text-[11px] text-slate-600" style={{ backgroundColor: '#F7F3EE' }}>
            위 "제품 사진 업로드" 섹션에서 단품 사진을 먼저 업로드하면 그 사진을 기준으로 합성할 수 있어요.
            (또는 텍스트만으로도 생성 가능)
          </div>
        )}
      </div>

      {/* 3) 배경 / 장소 */}
      {showBackground && (
        <div>
          <div className="text-[12px] font-bold mb-1.5" style={{ color: '#2F2A26' }}>
            3. 배경 / 장소
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {Object.entries(BACKGROUND_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => setBackgroundKey(key)}
                className="p-1.5 rounded-lg text-[11px] font-semibold transition border-2"
                style={{
                  borderColor: backgroundKey === key ? '#E87A2B' : '#e2ddd4',
                  backgroundColor: backgroundKey === key ? '#FFF8F0' : '#fff',
                  color: backgroundKey === key ? '#C2410C' : '#2F2A26',
                }}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setBackgroundKey('custom')}
              className="p-1.5 rounded-lg text-[11px] font-semibold transition border-2"
              style={{
                borderColor: backgroundKey === 'custom' ? '#E87A2B' : '#e2ddd4',
                backgroundColor: backgroundKey === 'custom' ? '#FFF8F0' : '#fff',
                color: backgroundKey === 'custom' ? '#C2410C' : '#2F2A26',
              }}
            >
              ✏️ 직접입력
            </button>
          </div>
          {backgroundKey === 'custom' && (
            <input
              type="text"
              value={customBackground}
              onChange={(e) => setCustomBackground(e.target.value)}
              placeholder="예: 흰색 대리석 위, 자연광"
              className="mt-2 w-full px-3 py-2 text-[12px] border rounded-lg"
              style={{ borderColor: '#C8B6A6' }}
            />
          )}
        </div>
      )}

      {/* 4) 분위기 */}
      {showMood && (
        <div>
          <div className="text-[12px] font-bold mb-1.5" style={{ color: '#2F2A26' }}>
            4. 분위기
          </div>
          <div className="flex gap-1.5">
            {Object.entries(MOOD_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMoodKey(key)}
                className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition border-2"
                style={{
                  borderColor: moodKey === key ? '#E87A2B' : '#e2ddd4',
                  backgroundColor: moodKey === key ? '#FFF8F0' : '#fff',
                  color: moodKey === key ? '#C2410C' : '#2F2A26',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5) 컷 수 + 사이즈 */}
      <div className="flex gap-3">
        {showCount && (
          <div className="flex-1">
            <div className="text-[12px] font-bold mb-1.5" style={{ color: '#2F2A26' }}>
              5. 생성할 컷 수
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className="flex-1 py-1.5 rounded-lg text-[12px] font-bold transition border-2"
                  style={{
                    borderColor: count === n ? '#E87A2B' : '#e2ddd4',
                    backgroundColor: count === n ? '#FFF8F0' : '#fff',
                    color: count === n ? '#C2410C' : '#2F2A26',
                  }}
                >
                  {n}장
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1">
          <div className="text-[12px] font-bold mb-1.5" style={{ color: '#2F2A26' }}>
            크기 (가로:세로)
          </div>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="w-full px-2 py-1.5 text-[12px] border rounded-lg"
            style={{ borderColor: '#C8B6A6' }}
          >
            <option value="1024x1024">정사각형 (1:1)</option>
            <option value="1024x1536">세로형 (2:3)</option>
            <option value="1536x1024">가로형 (3:2)</option>
          </select>
        </div>
      </div>

      {/* 6) 추가 지시 (선택) */}
      <div>
        <div className="text-[12px] font-bold mb-1.5" style={{ color: '#2F2A26' }}>
          6. 추가 지시 (선택)
        </div>
        <input
          type="text"
          value={extraNote}
          onChange={(e) => setExtraNote(e.target.value)}
          placeholder="예: 파란색 청소솔, 빨간 손잡이 강조, 바닥 타일 청소"
          className="w-full px-3 py-2 text-[12px] border rounded-lg"
          style={{ borderColor: '#C8B6A6' }}
        />
      </div>

      {/* 비용 안내 */}
      <div className="text-[10px] text-slate-500 px-1">
        💰 OpenAI gpt-image-1 사용 · 1장당 약 $0.04~0.17 (사이즈/품질에 따라 다름) · 본인 API 키 사용
      </div>

      {/* 생성 버튼 */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy || !apiKey}
        className="w-full py-3 rounded-xl text-[14px] font-bold text-white transition disabled:opacity-50"
        style={{ backgroundColor: '#E87A2B' }}
      >
        {busy ? `⏳ ${progress || '생성 중...'}` : `✨ AI 합성 시작 (${mode === 'beforeAfter' ? 2 : (showCount ? count : 1)}장)`}
      </button>

      {error && (
        <div className="p-2 rounded-lg text-[12px]" style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
          {error}
        </div>
      )}

      {progress && !busy && (
        <div className="p-2 rounded-lg text-[12px] font-semibold" style={{ backgroundColor: '#ECFDF5', color: '#065F46' }}>
          {progress}
        </div>
      )}

      {/* 결과 */}
      {results.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px] font-bold" style={{ color: '#2F2A26' }}>
              🎉 생성 결과 ({results.length}장)
            </div>
            <button
              type="button"
              onClick={handleAddAll}
              className="px-3 py-1 text-[11px] font-bold rounded-lg text-white"
              style={{ backgroundColor: '#10B981' }}
            >
              ⬆️ 모두 사진 라이브러리에 추가
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {results.map((item, idx) => (
              <div key={idx} className="rounded-lg border-2 overflow-hidden" style={{ borderColor: '#e2ddd4' }}>
                <div className="relative">
                  <img src={item.url} alt="" className="w-full" />
                  {mode === 'beforeAfter' && (
                    <div className="absolute top-1 left-1 text-white text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                      backgroundColor: idx === 0 ? '#991B1B' : '#065F46',
                    }}>
                      {idx === 0 ? 'BEFORE' : 'AFTER'}
                    </div>
                  )}
                </div>
                <div className="flex">
                  <button
                    type="button"
                    onClick={() => handleAddOne(idx)}
                    className="flex-1 py-1.5 text-[11px] font-bold text-white"
                    style={{ backgroundColor: '#E87A2B' }}
                  >
                    ⬆️ 라이브러리 추가
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadOne(idx)}
                    className="flex-1 py-1.5 text-[11px] font-bold border-l"
                    style={{ borderColor: '#e2ddd4', color: '#2F2A26' }}
                  >
                    💾 다운로드
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
