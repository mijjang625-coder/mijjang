/**
 * Field — 사이드바 입력 필드 라벨 래퍼
 * @param {string} label 필드 라벨
 * @param {boolean} required 필수 표시 여부
 * @param {ReactNode} children input/textarea/select 등 입력 요소
 */
export default function Field({ label, required, children }) {
  return (
    <label className="block">
      <div className="text-[11px] font-bold mb-1" style={{ color: '#6b635c' }}>
        {label} {required && <span style={{ color: '#C8B6A6' }}>*</span>}
      </div>
      {children}
    </label>
  );
}
