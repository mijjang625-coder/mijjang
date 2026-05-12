/**
 * OnboardingTour.jsx — 첫 사용자 온보딩 튜토리얼
 *
 * 구성:
 *  1. Welcome 모달 (첫 진입 시 1회 자동 / ❓버튼으로 재실행)
 *  2. 5단계 스포트라이트 투어
 *     - ① OpenAI API 키 입력
 *     - ② 제품 정보 입력
 *     - ③ 사진 업로드
 *     - ④ 페이지 생성 버튼
 *     - ⑤ PNG/HTML 내보내기
 *
 * 사용법:
 *   const [showOnboarding, setShowOnboarding] = useState(false);
 *   <OnboardingTour open={showOnboarding} onClose={() => setShowOnboarding(false)} />
 *
 * data-tour="api-key" 같은 속성을 타겟 요소에 부여하면 스포트라이트가 그 요소를 강조합니다.
 */
import { useEffect, useState, useLayoutEffect } from 'react';

const STEPS = [
  {
    target: '[data-tour="api-key"]',
    title: '1단계 · OpenAI API 키 입력',
    body: (
      <>
        먼저 <strong>OpenAI API 키</strong>를 입력해주세요. <br />
        키는 브라우저에만 저장되며 외부로 전송되지 않습니다.
        <br />
        <span className="text-[11px] text-slate-500">
          키 발급: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="underline">platform.openai.com/api-keys</a>
        </span>
      </>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="product-info"]',
    title: '2단계 · 제품 기본 정보 입력',
    body: (
      <>
        <strong>제품명·카테고리·핵심 특징</strong>을 입력하세요. <br />
        쿠팡 URL을 붙여넣고 <strong>"자동 채우기"</strong>를 누르면 AI가 알아서 채워드립니다 ✨
      </>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="image-upload"]',
    title: '3단계 · 제품 사진 업로드',
    body: (
      <>
        <strong>4~10장</strong>의 사진을 업로드하세요. <br />
        각 페이지(P1~P10)에 자동으로 분배됩니다.
        <br />
        <span className="text-[11px] text-slate-500">
          💡 메인컷·디테일컷·사용씬을 골고루 준비하면 결과가 좋아져요
        </span>
      </>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="generate-button"]',
    title: '4단계 · 페이지 생성',
    body: (
      <>
        <strong>"이 페이지 생성"</strong> 버튼을 누르면 <br />
        AI가 약 <strong>15~35초</strong>에 한 페이지를 만들어줍니다.
        <br />
        진행률·예상 시간이 실시간으로 표시돼요 ⏱️
      </>
    ),
    placement: 'left',
  },
  {
    target: '[data-tour="export-button"]',
    title: '5단계 · 내보내기',
    body: (
      <>
        모든 페이지가 완성되면 <strong>"내보내기"</strong>로 <br />
        PNG·HTML 파일을 다운로드할 수 있습니다.
        <br />
        쿠팡 상세페이지 등록란에 그대로 업로드하면 끝! 🎉
      </>
    ),
    placement: 'left',
  },
];

export default function OnboardingTour({ open, onClose, startStep = -1 }) {
  // -1 = Welcome 모달, 0~4 = 스포트라이트 단계
  const [step, setStep] = useState(startStep);
  const [rect, setRect] = useState(null);

  // open 변경 시 단계 초기화
  useEffect(() => {
    if (open) setStep(startStep);
  }, [open, startStep]);

  // 타겟 요소의 위치 측정
  useLayoutEffect(() => {
    if (!open || step < 0) {
      setRect(null);
      return;
    }
    const current = STEPS[step];
    if (!current) return;

    const measure = () => {
      const el = document.querySelector(current.target);
      if (el) {
        // 화면 밖이면 스크롤
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        // 스크롤 후 살짝 대기 후 측정
        setTimeout(() => {
          const r = el.getBoundingClientRect();
          setRect({
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
          });
        }, 350);
      } else {
        // 타겟을 못 찾으면 화면 중앙 placeholder
        setRect({ top: window.innerHeight / 2 - 50, left: window.innerWidth / 2 - 150, width: 300, height: 100 });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step]);

  if (!open) return null;

  // ── Welcome 모달 ──
  if (step === -1) {
    return (
      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(47, 42, 38, 0.6)' }}
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center mb-4">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-4xl font-black"
              style={{ backgroundColor: '#C8B6A6' }}
            >
              쿠
            </div>
          </div>
          <h2 className="text-2xl font-extrabold text-center mb-2" style={{ color: '#2F2A26' }}>
            쿠팡 상세페이지 제작 에이전트에 오신 것을 환영합니다 👋
          </h2>
          <p className="text-sm text-center text-slate-600 mb-6 leading-relaxed">
            AI가 <strong>P1~P10 페이지</strong>를 자동으로 만들어드립니다.<br />
            5분이면 외주 30만원짜리 상세페이지를 받을 수 있어요!
          </p>

          <div className="space-y-2 mb-6">
            {[
              { icon: '🔑', text: 'OpenAI API 키만 있으면 시작 가능' },
              { icon: '📝', text: '제품 정보 입력 (URL 자동 추출 지원)' },
              { icon: '📸', text: '사진 4~10장 업로드' },
              { icon: '🤖', text: 'AI가 페이지별 카피·구성 자동 생성' },
              { icon: '💾', text: 'PNG·HTML로 내보내기' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ backgroundColor: '#F7F3EE' }}>
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm font-medium" style={{ color: '#2F2A26' }}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-lg font-semibold border text-sm hover:bg-slate-50"
              style={{ borderColor: '#e2ddd4', color: '#6b6660' }}
            >
              건너뛰기
            </button>
            <button
              onClick={() => setStep(0)}
              className="flex-2 px-6 py-3 rounded-lg font-bold text-white text-sm"
              style={{ backgroundColor: '#C8B6A6', flex: 2 }}
            >
              👀 5분 둘러보기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 스포트라이트 투어 ──
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  // 툴팁 위치 계산
  const tooltipStyle = (() => {
    if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const margin = 16;
    const tooltipW = 360;
    const tooltipH = 220;

    if (current.placement === 'right') {
      let left = rect.left + rect.width + margin;
      let top = rect.top + rect.height / 2 - tooltipH / 2;
      // 화면 우측 초과 시 좌측 배치
      if (left + tooltipW > window.innerWidth - 16) {
        left = rect.left - tooltipW - margin;
      }
      // 좌측도 안 되면 아래
      if (left < 16) {
        left = Math.max(16, rect.left);
        top = rect.top + rect.height + margin;
      }
      top = Math.max(16, Math.min(top, window.innerHeight - tooltipH - 16));
      return { top: `${top}px`, left: `${left}px` };
    } else {
      // left
      let left = rect.left - tooltipW - margin;
      let top = rect.top + rect.height / 2 - tooltipH / 2;
      if (left < 16) {
        left = rect.left + rect.width + margin;
      }
      if (left + tooltipW > window.innerWidth - 16) {
        left = Math.max(16, rect.left);
        top = rect.top + rect.height + margin;
      }
      top = Math.max(16, Math.min(top, window.innerHeight - tooltipH - 16));
      return { top: `${top}px`, left: `${left}px` };
    }
  })();

  return (
    <div className="fixed inset-0 z-[1000] pointer-events-none">
      {/* SVG 마스크로 타겟 영역만 뚫린 어두운 오버레이 */}
      {rect && (
        <svg className="absolute inset-0 w-full h-full pointer-events-auto" onClick={onClose}>
          <defs>
            <mask id="onboarding-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={rect.left - 8}
                y={rect.top - 8}
                width={rect.width + 16}
                height={rect.height + 16}
                rx="12"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(47, 42, 38, 0.7)"
            mask="url(#onboarding-mask)"
          />
          {/* 타겟 강조 테두리 (애니메이션) */}
          <rect
            x={rect.left - 8}
            y={rect.top - 8}
            width={rect.width + 16}
            height={rect.height + 16}
            rx="12"
            fill="none"
            stroke="#C8B6A6"
            strokeWidth="3"
            style={{ filter: 'drop-shadow(0 0 12px rgba(200, 182, 166, 0.8))' }}
          />
        </svg>
      )}

      {/* 툴팁 */}
      <div
        className="absolute pointer-events-auto bg-white rounded-2xl shadow-2xl p-5"
        style={{ ...tooltipStyle, width: 360 }}
      >
        {/* 진행 표시 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === step ? 24 : 8,
                  backgroundColor: i === step ? '#C8B6A6' : i < step ? '#D4C5B5' : '#e2ddd4',
                }}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
            title="튜토리얼 닫기"
          >
            ✕
          </button>
        </div>

        <h3 className="text-lg font-extrabold mb-2" style={{ color: '#2F2A26' }}>
          {current.title}
        </h3>
        <div className="text-sm text-slate-600 leading-relaxed mb-5">{current.body}</div>

        <div className="flex gap-2 justify-between items-center">
          <span className="text-[11px] text-slate-400">
            {step + 1} / {STEPS.length}
          </span>
          <div className="flex gap-2">
            {!isFirst && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold border hover:bg-slate-50"
                style={{ borderColor: '#e2ddd4', color: '#6b6660' }}
              >
                ← 이전
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) {
                  onClose();
                } else {
                  setStep(step + 1);
                }
              }}
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: '#C8B6A6' }}
            >
              {isLast ? '✨ 시작하기' : '다음 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
