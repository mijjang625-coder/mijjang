import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img, SectionTitle, Body } from './Shared.jsx';

// P7: 감성 라이프스타일 (세로 3모듈)
export default function P7Lifestyle({ copy = {}, images = [] }) {
  const { title = '일상에 자연스럽게', subTitle = '', modules = [] } = copy;

  return (
    <PageFrame height={2000} bg={BRAND.colors.white}>
      <div style={{ padding: '60px 40px 20px', textAlign: 'center' }}>
        <SectionTitle size={38}>{title}</SectionTitle>
        {subTitle && (
          <div style={{ marginTop: 14 }}>
            <Body size={24} align="center">
              {subTitle}
            </Body>
          </div>
        )}
      </div>

      <div style={{ padding: '20px 30px 60px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        {modules.slice(0, 3).map((m, i) => (
          <div key={i}>
            <Img src={images[i]} aspect="4 / 3" radius={16} />
            <div
              style={{
                marginTop: 18,
                textAlign: 'center',
                fontSize: 26,
                fontWeight: 700,
                color: BRAND.colors.text,
                letterSpacing: '-0.02em',
              }}
            >
              {m.caption}
            </div>
          </div>
        ))}
      </div>
    </PageFrame>
  );
}
