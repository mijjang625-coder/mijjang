import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img, SectionTitle, SubTitle, Body } from './Shared.jsx';

// P2: 베네핏 심화 설명 (세로 3섹션, 사진 중심)
export default function P2Benefits({ copy = {}, images = [] }) {
  const { sections = [] } = copy;

  return (
    <PageFrame height={1700} bg={BRAND.colors.white}>
      <div style={{ padding: '50px 40px' }}>
        {sections.slice(0, 3).map((s, i) => (
          <div
            key={i}
            style={{
              marginBottom: i === sections.length - 1 ? 0 : 60,
              paddingBottom: i === sections.length - 1 ? 0 : 40,
              borderBottom:
                i === sections.length - 1 ? 'none' : `1px solid ${BRAND.colors.neutral}`,
            }}
          >
            <div style={{ marginBottom: 22 }}>
              <div
                style={{
                  display: 'inline-block',
                  backgroundColor: BRAND.colors.main,
                  color: '#fff',
                  fontSize: 22,
                  fontWeight: 800,
                  padding: '6px 16px',
                  borderRadius: 999,
                  marginBottom: 14,
                }}
              >
                POINT {String(i + 1).padStart(2, '0')}
              </div>
              <SubTitle size={32}>{s.title}</SubTitle>
              <div style={{ marginTop: 10 }}>
                <Body size={24}>{s.desc}</Body>
              </div>
            </div>
            <Img src={images[i]} aspect="4 / 3" radius={16} />
          </div>
        ))}
      </div>
    </PageFrame>
  );
}
