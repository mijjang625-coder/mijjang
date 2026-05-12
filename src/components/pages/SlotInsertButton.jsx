import { useEffect, useRef, useState } from 'react';

/**
 * 슬롯에 사진 끼워넣기 버튼 (편집모드에서만 노출)
 * 클릭 시 업로드/생성된 사진 선택 패널이 열림.
 * onInsert(slot, src) — 슬롯 키와 base64/URL 전달.
 *
 * 공용으로 P2/P7/P9 등 인라인 슬롯이 있는 페이지에서 사용.
 */
export default function SlotInsertButton({ slot, onInsert, allImages = [], label = '＋ 이 자리에 사진 끼워넣기' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const valid = (allImages || []).filter(Boolean);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} data-edit-ui data-slot-insert-button style={{
      position: 'relative',
      width: '100%',
      pointerEvents: 'auto',
      margin: '8px 0',
    }}>
      <button
        onClick={() => setOpen((s) => !s)}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '2px dashed #94a3b8',
          backgroundColor: open ? '#dbeafe' : '#f8fafc',
          color: '#475569',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'background-color 0.15s, border-color 0.15s',
        }}
        title="이 자리에 사진을 끼워 넣으면 아래 콘텐츠가 자동으로 밀려납니다"
        onMouseEnter={(e) => { if (!open) { e.currentTarget.style.backgroundColor = '#eff6ff'; e.currentTarget.style.borderColor = '#3b82f6'; } }}
        onMouseLeave={(e) => { if (!open) { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#94a3b8'; } }}
      >
        {label}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            left: '50%', top: '100%',
            transform: 'translateX(-50%)',
            marginTop: 4,
            width: 340, maxHeight: 380, overflow: 'auto',
            backgroundColor: '#fff', border: '1px solid #e2ddd4',
            borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 12, zIndex: 100000,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2F2A26' }}>📸 사진 끼워넣기</div>
            <button onClick={() => setOpen(false)}
              style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>✕</button>
          </div>
          <label style={{
            display: 'block', border: '2px dashed #93c5fd', backgroundColor: '#eff6ff',
            borderRadius: 8, padding: '10px', textAlign: 'center',
            fontSize: 11, fontWeight: 700, color: '#1d4ed8', cursor: 'pointer',
            marginBottom: 8,
          }}>
            ⬆️ 컴퓨터에서 업로드
            <input type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                files.forEach((f) => {
                  if (!f.type.startsWith('image/')) return;
                  const r = new FileReader();
                  r.onload = (ev) => { if (ev.target?.result) onInsert(slot, ev.target.result); };
                  r.readAsDataURL(f);
                });
                e.target.value = '';
                setOpen(false);
              }} />
          </label>
          {valid.length > 0 ? (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                또는 생성된 사진 {valid.length}장
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {valid.map((src, idx) => (
                  <button key={idx}
                    onClick={() => { onInsert(slot, src); setOpen(false); }}
                    style={{
                      border: '1px solid #e2ddd4', borderRadius: 6, padding: 0,
                      overflow: 'hidden', cursor: 'pointer', aspectRatio: '1 / 1',
                      backgroundColor: '#f3f4f6',
                    }}
                  >
                    <img src={src} alt="" crossOrigin="anonymous"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>
              생성된 사진이 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
