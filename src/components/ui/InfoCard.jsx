/**
 * InfoCard — 작은 정보 카드 (제목 + 불릿 리스트)
 * @param {string} title 카드 제목
 * @param {string[]} items 불릿 리스트 항목 배열
 */
export default function InfoCard({ title, items }) {
  return (
    <div className="p-3 rounded-lg border text-xs" style={{ backgroundColor: '#fff', borderColor: '#e2ddd4' }}>
      <div className="font-bold mb-1.5" style={{ color: '#2F2A26' }}>{title}</div>
      {items?.length ? (
        <ul className="list-disc list-inside space-y-0.5" style={{ color: '#6b635c' }}>
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      ) : (
        <div className="text-slate-400">—</div>
      )}
    </div>
  );
}
