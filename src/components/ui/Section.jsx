import { useState } from 'react';

/**
 * Section — 사이드바 접이식 섹션 카드
 * @param {string} title 섹션 제목
 * @param {string} emoji 좌측 이모지
 * @param {ReactNode} children 본문
 * @param {boolean} collapsible 접기 가능 여부
 * @param {boolean} defaultCollapsed 초기 접힘 상태
 * @param {string|null} badge 우측 상단 작은 뱃지 (예: '5장')
 */
export default function Section({
  title,
  emoji,
  children,
  collapsible = false,
  defaultCollapsed = false,
  badge = null,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const isCollapsible = collapsible;
  return (
    <div className="bg-white rounded-xl p-4 border" style={{ borderColor: '#e2ddd4' }}>
      <div
        className={`flex items-center gap-2 pb-2 ${collapsed ? '' : 'mb-3 border-b'}`}
        style={{ borderColor: '#f0ebe4', cursor: isCollapsible ? 'pointer' : 'default' }}
        onClick={isCollapsible ? () => setCollapsed((v) => !v) : undefined}
      >
        <span>{emoji}</span>
        <h3 className="text-sm font-bold flex-1" style={{ color: '#2F2A26' }}>{title}</h3>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
            {badge}
          </span>
        )}
        {isCollapsible && (
          <span
            className="text-xs px-1.5 py-0.5 rounded transition-transform"
            style={{
              backgroundColor: '#F7F3EE',
              color: '#6b635c',
              transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            }}
          >
            ▼
          </span>
        )}
      </div>
      {!collapsed && <div className="space-y-2.5">{children}</div>}
    </div>
  );
}
