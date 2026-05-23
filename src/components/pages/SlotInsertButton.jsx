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
  const openUpward = slot === 'bottom';

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
      height: 0,
      pointerEvents: 'none',
      margin: 0,
      zIndex: 30,
    }}>
      <button
        onClick={() => setOpen((s) => !s)}
        style={{
          position: 'absolute',
          right: 18,
          top: slot === 'bottom' ? -8 : 56,
          width: 30,
          height: 30,
          border: '1.5px dashed #94a3b8',
          backgroundColor: open ? '#dbeafe' : '#f8fafc',
          color: '#475569',
          borderRadius: 999,
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 900,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          transition: 'background-color 0.15s, border-color 0.15s',
          pointerEvents: 'auto',
          zIndex: 31,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}
        title={label}
        aria-label={label}
        onMouseEnter={(e) => { if (!open) { e.currentTarget.style.backgroundColor = '#eff6ff'; e.currentTarget.style.borderColor = '#3b82f6'; } }}
        onMouseLeave={(e) => { if (!open) { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#94a3b8'; } }}
      >
        +
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 14,
            top: openUpward ? 'auto' : 14,
            bottom: openUpward ? 14 : 'auto',
            transform: 'none',
            marginTop: openUpward ? 0 : 4,
            width: 340, maxHeight: 380, overflow: 'auto',
            backgroundColor: '#fff', border: '1px solid #e2ddd4',
            borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 12, zIndex: 100000,
            pointerEvents: 'auto',
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
            pointerEvents: 'auto',
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
                      backgroundColor: '#f3f4f6', position: 'relative',
                      pointerEvents: 'auto',
                    }}
                    title="이 사진 추가"
                  >
                    <img src={src} alt="" crossOrigin="anonymous"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <span style={{
                      position: 'absolute', right: 4, bottom: 4,
                      background: 'rgba(15,23,42,0.72)', color: '#fff',
                      borderRadius: 999, padding: '2px 6px', fontSize: 10, fontWeight: 700,
                    }}>
                      + 추가
                    </span>
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
