import { useEffect, useRef, useState } from 'react';
import AISynthesisPanel from './AISynthesisPanel.jsx';

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
 *   productName    — 제품명
 *   uploadedImages — 사진 라이브러리
 *   onAddImages(urls) — 생성된 사진을 라이브러리에 추가
 */
export default function AISynthesisFloatingButton({
  editMode = false,
  apiKey = '',
  productName = '',
  uploadedImages = [],
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
      {/* 🎨 플로팅 버튼 — '도형 추가'(top:272) 바로 밑 (top:330) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="단품 사진 → AI 합성으로 다양한 연출컷 생성 (배경교체 / 사용장면 / Before/After / 손에쥔컷)"
        style={{
          position: 'fixed',
          right: 24, top: 330,
          zIndex: 9999,
          backgroundColor: open ? '#C2410C' : '#E87A2B',
          color: '#fff',
          border: '2px solid #fff',
          padding: '8px 12px',
          borderRadius: 999,
          fontSize: 12, fontWeight: 800,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(232,122,43,0.45)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        🎨 AI 합성
        <span style={{
          backgroundColor: '#fef3c7',
          color: '#92400e',
          borderRadius: 999,
          padding: '1px 6px',
          fontSize: 9,
          fontWeight: 900,
        }}>NEW</span>
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
              maxHeight: '92vh',
              backgroundColor: '#fff',
              borderRadius: 16,
              boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* 헤더 */}
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid #e2ddd4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#FFF8F0',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#C2410C' }}>
                  🎨 AI 사진 합성
                </div>
                <div style={{ fontSize: 11, color: '#7C6F65', marginTop: 2 }}>
                  단품 사진 한 장 → 배경교체 · 사용장면 · Before/After · 손에쥔컷 자동 생성
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  width: 32, height: 32,
                  borderRadius: 8,
                  border: '1px solid #e2ddd4',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#7C6F65',
                }}
                title="닫기 (ESC)"
              >
                ×
              </button>
            </div>

            {/* 본문 (스크롤) */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
            }}>
              <AISynthesisPanel
                apiKey={apiKey}
                productName={productName}
                uploadedImages={uploadedImages}
                onAddImages={(urls) => {
                  onAddImages(urls);
                  // 추가 후 모달은 열어둠 (여러 번 합성 가능)
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
