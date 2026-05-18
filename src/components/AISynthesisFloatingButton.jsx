import { useEffect, useRef, useState, lazy, Suspense } from 'react';

// 🚀 AISynthesisPanel은 lazy load — 모달 열릴 때만 로드 (nano-banana 합성 라이브러리 무거움)
const AISynthesisPanel = lazy(() => import('./AISynthesisPanel.jsx'));

/**
 * AISynthesisFloatingButton
 *
 * 편집 모드 ON 일 때 화면 우측에 떠있는 플로팅 버튼.
 * "🟦 도형 추가" 버튼 바로 아래에 위치.
 * 클릭 시 화면 가운데에 큰 모달이 뜨고 그 안에서 AISynthesisPanel 사용.
 *
 * Props:
 *   editMode       — 편집 모드 여부 (false면 안 보임)
 *   apiKey         — OpenAI API 키
 *   falApiKey      — fal.ai API 키 (nano-banana 모델 사용 시)
 *   productName    — 제품명
 *   uploadedImages — 사진 라이브러리
 *   onAddImages(urls) — 생성된 사진을 라이브러리에 추가
 */
export default function AISynthesisFloatingButton({
  editMode = false,
  apiKey = '',
  falApiKey = '',
  productName = '',
  uploadedImages = [],
  activeImageSrc = null,   // 🆕 현재 클릭/활성화된 사진의 실제 URL
  currentPage = '',
  onAddImages = () => {},
}) {
  const [open, setOpen] = useState(false);
  const modalRef = useRef(null);

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!editMode) return null;

  return (
    <>
      {/* 🎨 플로팅 버튼 — '레이어'(top:318) 바로 밑 (top:368) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="단품 사진 → AI 합성으로 다양한 연출컷 생성 (배경교체 / 사용장면 / Before/After / 손에쥔컷)"
        style={{
          position: 'fixed',
          right: 8, top: 368,
          zIndex: 100000,
          backgroundColor: open ? '#C2410C' : '#E87A2B',
          color: '#fff',
          border: '2px solid #fff',
          padding: '8px 12px',
          borderRadius: 12,
          fontSize: 15, fontWeight: 800,
          lineHeight: 1.2,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(232,122,43,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 96,
          height: 44,
        }}
      >
        <span>AI 이미지</span>
      </button>

      {/* 🪟 모달 */}
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.55)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            ref={modalRef}
            style={{
              width: '100%',
              maxWidth: 720,
              height: '88vh',
              maxHeight: '88vh',
              backgroundColor: '#fff',
              borderRadius: 16,
              boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* 닫기 버튼만 — 채팅형 UI라 제목은 패널 내부 헤더로 이동 */}
            <div style={{
              position: 'absolute',
              top: 10, right: 12,
              zIndex: 10,
            }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  width: 30, height: 30,
                  borderRadius: 8,
                  border: '1px solid #e2ddd4',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#7C6F65',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="닫기 (ESC)"
              >
                ×
              </button>
            </div>

            {/* 본문 — 채팅 패널이 flex 스스로 높이를 관리 */}
            <div style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
            }}>
              <Suspense fallback={
                <div style={{ padding: 40, textAlign: 'center', color: '#6b635c' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🍌</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold' }}>합성 패널 로딩 중...</div>
                </div>
              }>
                <AISynthesisPanel
                  apiKey={apiKey}
                  falApiKey={falApiKey}
                  productName={productName}
                  uploadedImages={uploadedImages}
                  initialSourceUrl={activeImageSrc}
                  currentPage={currentPage}
                  onAddImages={(urls) => {
                    onAddImages(urls);
                    // 추가 후 모달은 열어둠 (여러 번 합성 가능)
                  }}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
