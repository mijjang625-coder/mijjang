import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';

// P2: 베네핏 심화 설명 (세로 3섹션, 사진 중심)
export default function P2Benefits({
  copy = {},
  images = [],
  editMode = false,
  overrides = {},
  onOverrideChange = () => {},
}) {
  const { sections = [] } = copy;
  const editPropsFor = (id) => ({
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

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
              <EditableText
                {...editPropsFor(`P2.sections.${i}.title`)}
                as="h3"
                defaultStyle={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: BRAND.colors.text,
                  margin: 0,
                  lineHeight: 1.3,
                  letterSpacing: '-0.03em',
                }}
              >
                {s.title}
              </EditableText>
              <div style={{ marginTop: 10 }}>
                <EditableText
                  {...editPropsFor(`P2.sections.${i}.desc`)}
                  as="p"
                  defaultStyle={{
                    fontSize: 24,
                    fontWeight: 500,
                    color: BRAND.colors.text,
                    margin: 0,
                    lineHeight: 1.6,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {s.desc}
                </EditableText>
              </div>
            </div>
            <EditableImage
              id={`P2.images.${i}`}
              src={images[i]}
              aspect="4 / 3"
              radius={16}
              editMode={editMode}
              override={overrides[`P2.images.${i}`] || {}}
              onChange={(partial) => onOverrideChange(`P2.images.${i}`, partial)}
            />
          </div>
        ))}
      </div>
    </PageFrame>
  );
}
