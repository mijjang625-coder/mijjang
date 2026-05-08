import { useState } from 'react';

/**
 * Section — 사이드바 접이식 섹션 카드
 * @param {string} title 섹션 제목
 * @param {string} emoji 좌측 이모지
 * @param {ReactNode} children 본문
 * @param {boolean} collapsible 접기 가능 여부
 * @param {boolean} defaultCollapsed 초기 접힘 상태
 * @param {string|null} badge 우측 상단 작은 뱃지 (예: '5장')
 * @param {boolean} flat 그룹 내부에서 사용 시 개별 테두리/배경 제거 (그룹이 통합 카드 역할)
 */
export default function Section({
  title,
  emoji,
  children,
  collapsible = false,
  defaultCollapsed = false,
  badge = null,
  flat = false,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const isCollapsible = collapsible;
  return (
    <div
      className={flat ? '' : 'bg-white rounded-lg border'}
      style={{ borderColor: '#e2ddd4', padding: '12px 10px' }}
    >
      <div
        className={`flex items-center gap-1.5 ${collapsed ? '' : 'pb-1.5 mb-2 border-b'}`}
        style={{ borderColor: '#f0ebe4', cursor: isCollapsible ? 'pointer' : 'default' }}
        onClick={isCollapsible ? () => setCollapsed((v) => !v) : undefined}
      >
        <span style={{ fontSize: '15px', lineHeight: 1 }}>{emoji}</span>
        <h3
          className="font-bold flex-1"
          style={{ color: '#2F2A26', fontSize: '15px', lineHeight: 1.25, margin: 0 }}
        >
          {title}
        </h3>
        {badge && (
          <span
            className="rounded font-bold"
            style={{
              backgroundColor: '#fef3c7',
              color: '#92400e',
              fontSize: '11px',
              lineHeight: 1,
              padding: '2px 5px',
            }}
          >
            {badge}
          </span>
        )}
        {isCollapsible && (
          <span
            className="rounded transition-transform"
            style={{
              backgroundColor: '#F7F3EE',
              color: '#6b635c',
              fontSize: '11px',
              lineHeight: 1,
              padding: '2px 5px',
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
