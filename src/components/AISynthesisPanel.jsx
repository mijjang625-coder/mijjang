import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  synthesizeBatch,
  BACKGROUND_PRESETS,
  MOOD_PRESETS,
  SYNTHESIS_MODELS,
} from '../lib/imageSynthesis.js';

/* ─────────────────────────────────────────────────────────────
   빠른 프롬프트 칩 정의
   클릭 → 입력창에 자동 삽입되는 자주 쓰는 명령어들
───────────────────────────────────────────────────────────── */
const QUICK_PROMPTS = [
  { emoji: '🖼️', label: '배경 교체', mode: 'background', bg: 'studio', mood: 'clean',    text: '흰색 스튜디오 배경으로 교체해줘' },
  { emoji: '🚿', label: '욕실 배경', mode: 'background', bg: 'bathroom', mood: 'clean',  text: '욕실 배경으로 바꿔줘' },
  { emoji: '🍳', label: '주방 배경', mode: 'background', bg: 'kitchen', mood: 'clean',   text: '주방 배경으로 바꿔줘' },
  { emoji: '🧽', label: '사용 장면', mode: 'usage',      bg: 'bathroom', mood: 'natural', text: '실제로 사용하는 장면 만들어줘' },
  { emoji: '✨', label: 'Before/After', mode: 'beforeAfter', bg: 'bathroom', mood: 'clean', text: '청소 전후 비교 사진 만들어줘' },
  { emoji: '🤚', label: '손에 쥔 컷', mode: 'handHeld',  bg: 'studio', mood: 'modern',  text: '손에 들고 있는 컷 만들어줘' },
  { emoji: '🔄', label: '다각도', mode: 'multiAngle',    bg: 'studio', mood: 'clean',    text: '다양한 각도로 찍어줘' },
  { emoji: '🌿', label: '베란다',  mode: 'background',   bg: 'veranda', mood: 'natural', text: '베란다 배경으로 바꿔줘' },
];

/* ─────────────────────────────────────────────────────────────
   메시지 타입:
   { id, role: 'user'|'assistant'|'system', type: 'text'|'image'|'loading',
     content, images, prompt, timestamp }
───────────────────────────────────────────────────────────── */

let msgId = 0;
const mkId = () => ++msgId;

/* 모델 표시용 이름 (드롭다운 버튼 축약 라벨) */
const MODEL_LABELS = {
  'gpt-image-2':     '🆕 GPT Image 2',
  'nano-banana-2':   '🍌 Nano Banana 2',
  'nano-banana-pro': '🍌 Nano Banana Pro',
  'openai':          '🤖 GPT Image 1',
};

/* GPT Image 2 자유 모드 여부 판단 */
const isDirectMode = (modelKey) => modelKey === 'gpt-image-2';

/* 빠른 캐치문구 — GPT Image 2용 한국어 직접 전달 */
const QUICK_PROMPTS_DIRECT = [
  { emoji: '🖼️', label: '흰 배경',    text: '배경을 순수한 흰색으로 바꿘주세요. 제품은 그대로 유지하고 배경만 교체해주세요.' },
  { emoji: '🚣', label: '욕실 배경',   text: '배경을 깨끗한 웑실로 바꿘주세요. 제품은 그대로 유지해주세요.' },
  { emoji: '🍳', label: '주방 배경',   text: '배경을 현대적인 주방으로 바꿘주세요. 제품은 그대로 유지해주세요.' },
  { emoji: '✨',    label: '보정',          text: '사진을 더 날카롭게, 밝게, 선명하게 보정해주세요.' },
  { emoji: '👀', label: '무없애도 생성', text: '이 사진을 보고 광고 사진으로 만들어주세요.' },
  { emoji: '🌟', label: '조명 보정',  text: '조명을 더 자연스럽게 밝게 보정해주세요.' },
  { emoji: '📸', label: '프로틉 변환', text: '일반 사진을 전문 제품 광고 사진 스타일로 변환해주세요.' },
  { emoji: '🏹', label: '배경 제거',  text: '배경을 투명하게 제거하고 제품만 남겨주세요.' },
];

/* ─────────────────────────────────────────────────────────────
   메인 컴포넌트
───────────────────────────────────────────────────────────── */
export default function AISynthesisPanel({
  apiKey,
  falApiKey = '',
  productName = '',
  uploadedImages = [],
  initialSourceUrl = null,
  currentPage = '',
  onAddImages = () => {},
}) {
  /* ── 모델 선택 (localStorage 복원) ── */
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
  // gpt-image-2는 fal.ai 경유, openai(gpt-image-1)만 직접 호출
  const provider = modelKey === 'openai' ? 'openai' : 'fal';

  /* ── 채팅 메시지 목록 (localStorage 복원) ── */
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('ai_synthesis_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // msgId 동기화 — 저장된 메시지 중 가장 큰 id보다 크게 시작
          const maxId = Math.max(...parsed.map((m) => m.id || 0));
          if (maxId >= msgId) msgId = maxId + 1;
          return parsed;
        }
      }
    } catch (_) {}
    return [
      {
        id: mkId(),
        role: 'assistant',
        type: 'text',
        content: `안녕하세요! AI 사진 합성 도우미예요 👋\n\n아래 **빠른 메뉴**를 클릭하거나, 원하는 내용을 직접 입력해 보세요.\n\n예) "욕실 배경으로 바꿔줘", "실제로 사용하는 장면 만들어줘"`,
        timestamp: Date.now(),
      },
    ];
  });

  /* ── messages 변경 시 localStorage 자동 저장 (loading 제외, 최근 30개) ── */
  useEffect(() => {
    try {
      const toSave = messages
        .filter((m) => m.type !== 'loading')
        .slice(-30);
      localStorage.setItem('ai_synthesis_messages', JSON.stringify(toSave));
    } catch (_) {}
  }, [messages]);

  /* ── 입력 상태 ── */
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState(null); // { url, label }
  const [busy, setBusy] = useState(false);

  /* ── 모델 드롭다운 표시 ── */
  const [showModelMenu, setShowModelMenu] = useState(false);

  /* ── 이미지 피커 표시 ── */
  const [showImagePicker, setShowImagePicker] = useState(false);

  /* ── Refs ── */
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  /* ── initialSourceUrl 변경 시 첨부 이미지 자동 세팅 ── */
  useEffect(() => {
    if (initialSourceUrl) {
      const idx = uploadedImages.indexOf(initialSourceUrl);
      const label = idx >= 0 ? `사진 #${idx + 1}` : (currentPage ? `${currentPage} 미리보기 사진` : '선택한 사진');
      setAttachedImage({ url: initialSourceUrl, label });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSourceUrl]);

  /* ── 새 메시지 추가 시 스크롤 ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── 메시지 추가 헬퍼 ── */
  const addMsg = useCallback((msg) => {
    setMessages((prev) => [...prev, { id: mkId(), timestamp: Date.now(), ...msg }]);
  }, []);

  const updateLastMsg = useCallback((patch) => {
    setMessages((prev) => {
      const next = [...prev];
      Object.assign(next[next.length - 1], patch);
      return next;
    });
  }, []);

  /* ─────────────────────────────────────────────────────────
     핵심: 생성 실행
  ───────────────────────────────────────────────────────── */
  const runGenerate = useCallback(async ({
    mode,
    backgroundKey,
    customBackground,
    moodKey,
    extraNote,
    count,
    size,
    sourceUrl,    // 기준 사진 data URL (또는 null)
    userText,     // 사용자 메시지 텍스트
    directPrompt, // ← GPT Image 2 자유 모드: 프롬프트 변환 없이 그대로 전달
  }) => {
    /* API 키 검증 */
    const needsFal = provider === 'fal';
    const needsBothForGpt2 = modelKey === 'gpt-image-2';

    if (needsFal && !falApiKey?.trim()) {
      addMsg({
        role: 'assistant',
        type: 'text',
        content: '⚠️ **fal.ai API 키**가 필요해요.\n왼쪽 사이드바 "API 설정"에서 입력해 주세요.\n\n발급: https://fal.ai/dashboard/keys',
      });
      return;
    }
    if (needsBothForGpt2 && !apiKey?.trim()) {
      addMsg({
        role: 'assistant',
        type: 'text',
        content: '⚠️ **GPT Image 2**는 fal.ai 키 외에 **OpenAI API 키**도 함께 필요해요.\n왼쪽 사이드바 "API 설정"에서 OpenAI API Key를 입력해 주세요.\n\n(fal.ai가 OpenAI 키를 대신 사용하는 BYOK 방식)',
      });
      return;
    }
    if (!needsFal && !apiKey?.trim()) {
      addMsg({
        role: 'assistant',
        type: 'text',
        content: '⚠️ **OpenAI API 키**가 필요해요. 왼쪽 사이드바 "API 설정"에서 입력해 주세요.',
      });
      return;
    }

    const realCount = mode === 'beforeAfter' ? 2 : (count || 1);
    const modelLabel = MODEL_LABELS[modelKey] || modelKey;

    /* 로딩 메시지 */
    addMsg({
      role: 'assistant',
      type: 'loading',
      content: `${modelLabel}로 ${realCount}장 생성 중...`,
    });

    setBusy(true);
    try {
      const items = await synthesizeBatch({
        apiKey,
        falApiKey,
        provider,
        modelKey,
        mode: mode || 'background',
        productName,
        backgroundKey: backgroundKey || 'studio',
        customBackground: customBackground || '',
        moodKey: moodKey || 'clean',
        extraNote: extraNote || '',
        sourceImageDataUrl: sourceUrl || null,
        size: size || '1024x1024',
        count: realCount,
        directPrompt: directPrompt || null, // GPT Image 2 자유 모드
      });

      /* 로딩 → 결과로 교체 */
      updateLastMsg({
        type: 'images',
        content: `✅ ${items.length}장 생성했어요!`,
        images: items,           // [{ url, prompt }]
        mode,
      });
    } catch (e) {
      updateLastMsg({
        type: 'text',
        content: `❌ 생성 실패: ${e.message || e}`,
      });
    } finally {
      setBusy(false);
    }
  }, [apiKey, falApiKey, provider, modelKey, productName, addMsg, updateLastMsg]);

  /* ─────────────────────────────────────────────────────────
     빠른 프롬프트 클릭 처리
  ───────────────────────────────────────────────────────── */
  const handleQuickPrompt = useCallback((qp) => {
    addMsg({
      role: 'user',
      type: 'text',
      content: qp.text,
      attachedImage: attachedImage || null,
    });

    if (isDirectMode(modelKey)) {
      // GPT Image 2: 한국어 텍스트 그대로 전달
      runGenerate({
        mode: 'background',
        count: 1,
        size: '1024x1024',
        sourceUrl: attachedImage?.url || null,
        directPrompt: qp.text,
      });
    } else {
      // Nano Banana / GPT-1: 기존 모드 방식
      runGenerate({
        mode: qp.mode,
        backgroundKey: qp.bg,
        customBackground: '',
        moodKey: qp.mood,
        extraNote: '',
        count: qp.mode === 'beforeAfter' ? 2 : 1,
        size: '1024x1024',
        sourceUrl: attachedImage?.url || null,
      });
    }
    setInputText('');
  }, [attachedImage, modelKey, addMsg, runGenerate]);

  /* ─────────────────────────────────────────────────────────
     자유 텍스트 전송 처리 (간단한 NLP 파싱)
  ───────────────────────────────────────────────────────── */
  const parseUserText = (text) => {
    const t = text.toLowerCase();

    let mode = 'background';
    let backgroundKey = 'studio';
    let moodKey = 'clean';
    let count = 1;

    // 모드 감지
    if (t.includes('before') || t.includes('after') || t.includes('비교') || t.includes('전후')) {
      mode = 'beforeAfter'; count = 2;
    } else if (t.includes('사용') || t.includes('쓰는') || t.includes('장면')) {
      mode = 'usage';
    } else if (t.includes('손') || t.includes('쥔') || t.includes('들고')) {
      mode = 'handHeld';
    } else if (t.includes('각도') || t.includes('다양')) {
      mode = 'multiAngle';
    }

    // 배경 감지
    if (t.includes('욕실') || t.includes('화장실') || t.includes('bathroom')) backgroundKey = 'bathroom';
    else if (t.includes('주방') || t.includes('부엌') || t.includes('kitchen')) backgroundKey = 'kitchen';
    else if (t.includes('베란다') || t.includes('발코니')) backgroundKey = 'veranda';
    else if (t.includes('자동차') || t.includes('차')) backgroundKey = 'car';
    else if (t.includes('거실') || t.includes('living')) backgroundKey = 'living';
    else if (t.includes('야외') || t.includes('outdoor')) backgroundKey = 'outdoor';
    else if (t.includes('베이지') || t.includes('beige')) backgroundKey = 'beige';
    else if (t.includes('흰') || t.includes('화이트') || t.includes('white') || t.includes('스튜디오')) backgroundKey = 'studio';

    // 분위기 감지
    if (t.includes('따뜻') || t.includes('warm')) moodKey = 'warm';
    else if (t.includes('모던') || t.includes('modern')) moodKey = 'modern';
    else if (t.includes('자연') || t.includes('natural')) moodKey = 'natural';

    // 장 수 감지
    const matchN = t.match(/(\d+)\s*장/);
    if (matchN) count = Math.min(4, Math.max(1, parseInt(matchN[1])));
    if (mode === 'beforeAfter') count = 2;

    return { mode, backgroundKey, moodKey, count, extraNote: text };
  };

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text && !attachedImage) return;
    if (busy) return;

    const displayText = text || '사진으로 생성해줘';

    addMsg({
      role: 'user',
      type: 'text',
      content: displayText,
      attachedImage: attachedImage || null,
    });

    if (isDirectMode(modelKey)) {
      // GPT Image 2: 입력한 텍스트를 프롬프트 변환 없이 그대로 전달
      runGenerate({
        mode: 'background',
        count: 1,
        size: '1024x1024',
        sourceUrl: attachedImage?.url || null,
        directPrompt: displayText,
      });
    } else {
      // Nano Banana / GPT-1: 기존 NLP 파싱 방식
      const parsed = parseUserText(displayText);
      runGenerate({
        ...parsed,
        size: '1024x1024',
        sourceUrl: attachedImage?.url || null,
      });
    }

    setInputText('');
  }, [inputText, attachedImage, modelKey, busy, addMsg, runGenerate]);

  /* ── Enter 전송 ── */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ── 파일 업로드 처리 ── */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachedImage({ url: reader.result, label: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /* ── 라이브러리에서 이미지 선택 ── */
  const handlePickImage = (url, idx) => {
    setAttachedImage({ url, label: `사진 #${idx + 1}` });
    setShowImagePicker(false);
  };

  /* ── 결과 이미지 라이브러리 추가 ── */
  const handleAddOne = (url) => onAddImages([url]);
  const handleAddAll = (images) => onAddImages(images.map((i) => i.url));

  const downloadOne = (url, idx) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-synthesis-${Date.now()}-${idx + 1}.png`;
    a.click();
  };

  /* ─────────────────────────────────────────────────────────
     렌더
  ───────────────────────────────────────────────────────── */
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      backgroundColor: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* ── 헤더 ── */}
      <div style={{
        flexShrink: 0,
        borderBottom: '1px solid #f0ede9',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2F2A26' }}>✨ AI 사진 합성</span>
          <button
            type="button"
            title="대화 초기화"
            onClick={() => {
              if (!window.confirm('대화 기록을 모두 삭제할까요?')) return;
              try { localStorage.removeItem('ai_synthesis_messages'); } catch (_) {}
              msgId = 0;
              setMessages([{
                id: mkId(),
                role: 'assistant',
                type: 'text',
                content: `안녕하세요! AI 사진 합성 도우미예요 👋\n\n아래 **빠른 메뉴**를 클릭하거나, 원하는 내용을 직접 입력해 보세요.\n\n예) "욕실 배경으로 바꿔줘", "실제로 사용하는 장면 만들어줘"`,
                timestamp: Date.now(),
              }]);
            }}
            style={{
              fontSize: 12, padding: '2px 7px', borderRadius: 6,
              border: '1px solid #e2ddd4',
              backgroundColor: '#fafaf9', color: '#999',
              cursor: 'pointer', lineHeight: 1.4,
            }}
          >
            🗑️ 초기화
          </button>
        </div>
        {/* 모델 선택 드롭다운 */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowModelMenu((s) => !s)}
            style={{
              fontSize: 11, fontWeight: 600,
              padding: '4px 10px', borderRadius: 20,
              border: '1.5px solid #e2ddd4',
              backgroundColor: showModelMenu ? '#FFF8F0' : '#fafaf9',
              color: showModelMenu ? '#C2410C' : '#666',
              cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {MODEL_LABELS[modelKey] || modelKey}
            <span style={{ fontSize: 9 }}>▼</span>
          </button>
          {showModelMenu && (
            <div style={{
              position: 'absolute', right: 0, top: '110%', zIndex: 50,
              backgroundColor: '#fff', borderRadius: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              border: '1px solid #e2ddd4',
              minWidth: 200, overflow: 'hidden',
            }}>
              {Object.entries(SYNTHESIS_MODELS).map(([key, info]) => {
                const active = modelKey === key;
                const missing = info.keyType === 'fal' ? !falApiKey?.trim() : !apiKey?.trim();
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setModelKey(key); setShowModelMenu(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 14px',
                      backgroundColor: active ? '#FFF8F0' : key === 'gpt-image-2' ? '#fafff7' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      borderBottom: '1px solid #f5f5f5',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#C2410C' : '#2F2A26' }}>
                        {info.label}
                      </span>
                      {info.badge && (
                        <span style={{
                          fontSize: 9, fontWeight: 800,
                          padding: '1px 5px', borderRadius: 4,
                          backgroundColor: '#16a34a', color: '#fff',
                          letterSpacing: '0.05em',
                        }}>
                          {info.badge}
                        </span>
                      )}
                      {missing && (
                        <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 700 }}>⚠️ 키필요</span>
                      )}
                    </div>
                    {info.description && (
                      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                        {info.description}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>
                      품질 {info.quality} · {info.cost}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 채팅 메시지 영역 ── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 12px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
      }}>
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            msg={msg}
            onAddOne={handleAddOne}
            onAddAll={handleAddAll}
            onDownload={downloadOne}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── 빠른 프롬프트 칩 ── */}
      <div style={{
        flexShrink: 0,
        padding: '6px 12px 4px',
        borderTop: '1px solid #f0ede9',
      }}>
        {/* GPT Image 2일 때 자유 모드 안내 배너 */}
        {isDirectMode(modelKey) && (
          <div style={{
            fontSize: 10, color: '#16a34a', fontWeight: 600,
            marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span>✦</span>
            <span>자유 모드 — 입력한 내용을 GPT Image 2에 그대로 전달해요</span>
          </div>
        )}
        <div style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}>
          {/* 모델에 따라 칩 목록 전환 */}
          {(isDirectMode(modelKey) ? QUICK_PROMPTS_DIRECT : QUICK_PROMPTS).map((qp) => (
            <button
              key={qp.label}
              type="button"
              onClick={() => !busy && handleQuickPrompt(qp)}
              disabled={busy}
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: 20,
                border: isDirectMode(modelKey) ? '1.5px solid #bbf7d0' : '1.5px solid #e2ddd4',
                backgroundColor: isDirectMode(modelKey) ? '#f0fdf4' : '#fafaf9',
                fontSize: 11, fontWeight: 600,
                color: busy ? '#ccc' : (isDirectMode(modelKey) ? '#16a34a' : '#2F2A26'),
                cursor: busy ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              {qp.emoji} {qp.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 첨부 이미지 미리보기 칩 ── */}
      {attachedImage && (
        <div style={{
          flexShrink: 0,
          padding: '4px 12px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px 4px 4px',
            borderRadius: 10,
            border: '1.5px solid #E87A2B',
            backgroundColor: '#FFF8F0',
            fontSize: 11,
          }}>
            <img
              src={attachedImage.url}
              alt=""
              style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6 }}
            />
            <span style={{ color: '#C2410C', fontWeight: 600, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attachedImage.label}
            </span>
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              style={{
                width: 16, height: 16, borderRadius: '50%',
                backgroundColor: '#C2410C', color: '#fff',
                border: 'none', cursor: 'pointer',
                fontSize: 10, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}
            >×</button>
          </div>
          <span style={{ fontSize: 10, color: '#888' }}>기준 사진으로 사용</span>
        </div>
      )}

      {/* ── 이미지 피커 (라이브러리) ── */}
      {showImagePicker && (
        <div style={{
          flexShrink: 0,
          padding: '8px 12px',
          borderTop: '1px solid #f0ede9',
          backgroundColor: '#fafaf9',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6 }}>
            사진 라이브러리에서 선택
          </div>
          {uploadedImages.length === 0 ? (
            <div style={{ fontSize: 11, color: '#999', padding: '8px 0' }}>
              업로드된 사진이 없어요. 위 사이드바에서 먼저 사진을 올려주세요.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {uploadedImages.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePickImage(url, idx)}
                  style={{
                    flexShrink: 0,
                    width: 56, height: 56,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: attachedImage?.url === url ? '2.5px solid #E87A2B' : '2px solid #e2ddd4',
                    cursor: 'pointer',
                    padding: 0,
                    position: 'relative',
                  }}
                >
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{
                    position: 'absolute', top: 1, left: 1,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    color: '#fff', fontSize: 8, fontWeight: 700,
                    padding: '1px 3px', borderRadius: 3,
                  }}>
                    #{idx + 1}
                  </div>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowImagePicker(false)}
            style={{
              marginTop: 6, fontSize: 10, color: '#888',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            닫기
          </button>
        </div>
      )}

      {/* ── 입력창 ── */}
      <div style={{
        flexShrink: 0,
        padding: '8px 12px 12px',
        borderTop: '1px solid #f0ede9',
        backgroundColor: '#fff',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
          padding: '8px 10px',
          borderRadius: 16,
          border: '1.5px solid #e2ddd4',
          backgroundColor: '#fafaf9',
          transition: 'border-color 0.15s',
        }}>
          {/* 이미지 첨부 버튼 */}
          <div style={{ flexShrink: 0, display: 'flex', gap: 3 }}>
            {/* 파일 직접 업로드 */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="사진 파일 첨부"
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: '1.5px solid #e2ddd4',
                backgroundColor: '#fff',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15,
              }}
            >
              📎
            </button>
            {/* 라이브러리에서 선택 */}
            <button
              type="button"
              onClick={() => setShowImagePicker((s) => !s)}
              title="업로드된 사진 라이브러리에서 선택"
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: showImagePicker ? '1.5px solid #E87A2B' : '1.5px solid #e2ddd4',
                backgroundColor: showImagePicker ? '#FFF8F0' : '#fff',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15,
              }}
            >
              🖼️
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {/* 텍스트 입력 */}
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              busy ? '생성 중...' :
              isDirectMode(modelKey)
                ? 'ChatGPT처럼 자유롭게 입력하세요. 예) "배경을 욕실로 바꿔줘", "밝기를 높여줘"'
                : '원하는 사진을 설명하거나 빠른 메뉴를 클릭하세요...'
            }
            disabled={busy}
            rows={1}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              fontSize: 13,
              color: '#2F2A26',
              resize: 'none',
              lineHeight: 1.5,
              maxHeight: 100,
              overflowY: 'auto',
              padding: '2px 0',
            }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
            }}
          />

          {/* 전송 버튼 */}
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || (!inputText.trim() && !attachedImage)}
            style={{
              flexShrink: 0,
              width: 34, height: 34,
              borderRadius: 10,
              border: 'none',
              backgroundColor: (busy || (!inputText.trim() && !attachedImage)) ? '#e5e7eb' : '#E87A2B',
              color: '#fff',
              cursor: (busy || (!inputText.trim() && !attachedImage)) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15,
              transition: 'background-color 0.15s',
            }}
          >
            {busy ? <SpinnerIcon /> : '↑'}
          </button>
        </div>
        <div style={{ fontSize: 9, color: '#bbb', marginTop: 4, textAlign: 'center' }}>
          Enter로 전송 · Shift+Enter 줄바꿈 · 사진을 첨부하면 해당 사진 기반으로 생성
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   채팅 메시지 컴포넌트
───────────────────────────────────────────────────────────── */
function ChatMessage({ msg, onAddOne, onAddAll, onDownload }) {
  const isUser = msg.role === 'user';

  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 8,
    }}>
      {/* 아바타 */}
      <div style={{
        flexShrink: 0,
        width: 28, height: 28,
        borderRadius: '50%',
        backgroundColor: isUser ? '#E87A2B' : '#f0ede9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        color: isUser ? '#fff' : '#666',
      }}>
        {isUser ? '나' : '✨'}
      </div>

      {/* 말풍선 */}
      <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        {/* 첨부 이미지 (사용자) */}
        {isUser && msg.attachedImage && (
          <div style={{
            borderRadius: 10, overflow: 'hidden',
            border: '1.5px solid #e2ddd4',
            maxWidth: 140,
          }}>
            <img
              src={msg.attachedImage.url}
              alt={msg.attachedImage.label}
              style={{ display: 'block', width: '100%', maxHeight: 120, objectFit: 'cover' }}
            />
          </div>
        )}

        {/* 텍스트 버블 */}
        {(msg.type === 'text' || msg.type === 'loading' || msg.type === 'images') && msg.content && (
          <div style={{
            padding: '9px 12px',
            borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
            backgroundColor: isUser ? '#E87A2B' : '#f5f3f0',
            color: isUser ? '#fff' : '#2F2A26',
            fontSize: 12.5,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}>
            {msg.type === 'loading' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SpinnerIcon /> {msg.content}
              </span>
            ) : (
              <MarkdownText text={msg.content} />
            )}
          </div>
        )}

        {/* 생성된 이미지 결과 */}
        {msg.type === 'images' && msg.images?.length > 0 && (
          <ImageResultGrid
            images={msg.images}
            mode={msg.mode}
            onAddOne={onAddOne}
            onAddAll={onAddAll}
            onDownload={onDownload}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   이미지 결과 그리드 컴포넌트
───────────────────────────────────────────────────────────── */
function ImageResultGrid({ images, mode, onAddOne, onAddAll, onDownload }) {
  const [added, setAdded] = useState(new Set());

  const handleAddOne = (url, idx) => {
    onAddOne(url);
    setAdded((prev) => new Set([...prev, idx]));
  };

  const handleAddAll = () => {
    onAddAll(images);
    setAdded(new Set(images.map((_, i) => i)));
  };

  return (
    <div style={{ width: '100%', marginTop: 4 }}>
      {/* 모두 추가 버튼 */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={handleAddAll}
          style={{
            display: 'block',
            width: '100%',
            marginBottom: 6,
            padding: '7px 0',
            borderRadius: 10,
            border: 'none',
            backgroundColor: '#10B981',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ⬆️ {images.length}장 모두 사진 라이브러리에 추가
        </button>
      )}

      {/* 이미지 그리드 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: images.length === 1 ? '1fr' : '1fr 1fr',
        gap: 6,
      }}>
        {images.map((item, idx) => (
          <div key={idx} style={{
            borderRadius: 10,
            overflow: 'hidden',
            border: '1.5px solid #e2ddd4',
            backgroundColor: '#fafaf9',
          }}>
            <div style={{ position: 'relative' }}>
              <img
                src={item.url}
                alt=""
                style={{ display: 'block', width: '100%' }}
              />
              {mode === 'beforeAfter' && (
                <div style={{
                  position: 'absolute', top: 6, left: 6,
                  padding: '2px 7px',
                  borderRadius: 5,
                  backgroundColor: idx === 0 ? '#991B1B' : '#065F46',
                  color: '#fff',
                  fontSize: 9, fontWeight: 800,
                }}>
                  {idx === 0 ? 'BEFORE' : 'AFTER'}
                </div>
              )}
              {added.has(idx) && (
                <div style={{
                  position: 'absolute', top: 6, right: 6,
                  padding: '2px 6px',
                  borderRadius: 5,
                  backgroundColor: '#10B981',
                  color: '#fff',
                  fontSize: 9, fontWeight: 700,
                }}>
                  ✓ 추가됨
                </div>
              )}
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid #e2ddd4' }}>
              <button
                type="button"
                onClick={() => handleAddOne(item.url, idx)}
                style={{
                  flex: 1, padding: '7px 0',
                  border: 'none',
                  backgroundColor: added.has(idx) ? '#d1fae5' : '#E87A2B',
                  color: added.has(idx) ? '#065F46' : '#fff',
                  fontSize: 10, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {added.has(idx) ? '✓ 추가됨' : '⬆️ 추가'}
              </button>
              <button
                type="button"
                onClick={() => onDownload(item.url, idx)}
                style={{
                  flex: 1, padding: '7px 0',
                  border: 'none',
                  borderLeft: '1px solid #e2ddd4',
                  backgroundColor: '#fff',
                  color: '#555',
                  fontSize: 10, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                💾 저장
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   간단한 마크다운 렌더 (굵게, 줄바꿈만 처리)
───────────────────────────────────────────────────────────── */
function MarkdownText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={i}>{p.slice(2, -2)}</strong>;
        }
        return p.split('\n').map((line, j) => (
          <span key={`${i}-${j}`}>
            {j > 0 && <br />}
            {line}
          </span>
        ));
      })}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   스피너 아이콘
───────────────────────────────────────────────────────────── */
function SpinnerIcon() {
  return (
    <svg
      width="14" height="14"
      viewBox="0 0 24 24"
      style={{ animation: 'spin 1s linear infinite' }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31 11" />
    </svg>
  );
}
