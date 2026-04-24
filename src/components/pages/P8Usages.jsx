import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img } from './Shared.jsx';
import EditableText from '../EditableText.jsx';

// P8: 다양한 활용법 — 4개 모듈
export default function P8Usages({
  copy = {},
  images = [],
  editMode = false,
  overrides = {},
  onOverrideChange = () => {},
}) {
  const { headline = '이렇게도 쓸 수 있어요', usages = [] } = copy;
  const editPropsFor = (id) => ({
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  return (
    <PageFrame height={1200} bg={BRAND.colors.sub}>
      <div style={{ padding: '50px 40px 20px', textAlign: 'center' }}>
        <EditableText
          {...editPropsFor('P8.headline')}
          as="h2"
          defaultStyle={{
            fontSize: 38,
            fontWeight: 800,
            color: BRAND.colors.text,
            margin: 0,
            textAlign: 'center',
            letterSpacing: '-0.03em',
            lineHeight: 1.3,
          }}
        >
          {headline}
        </EditableText>
      </div>

      <div
        style={{
          padding: '10px 30px 50px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 18,
        }}
      >
        {usages.slice(0, 4).map((u, i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ position: 'relative' }}>
              <Img src={images[i]} aspect="4 / 3" radius={0} />
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: BRAND.colors.main,
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
            </div>
            <div style={{ padding: '18px 18px 22px' }}>
              <EditableText
                {...editPropsFor(`P8.usages.${i}.title`)}
                as="div"
                defaultStyle={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: BRAND.colors.main,
                  marginBottom: 8,
                }}
              >
                {u.title}
              </EditableText>
              <EditableText
                {...editPropsFor(`P8.usages.${i}.desc1`)}
                as="p"
                defaultStyle={{
                  fontSize: 22,
                  fontWeight: 500,
                  color: BRAND.colors.text,
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {u.desc1}
              </EditableText>
              {(u.desc2 || editMode) && (
                <div style={{ marginTop: 4 }}>
                  <EditableText
                    {...editPropsFor(`P8.usages.${i}.desc2`)}
                    as="p"
                    defaultStyle={{
                      fontSize: 22,
                      fontWeight: 500,
                      color: BRAND.colors.text,
                      margin: 0,
                      lineHeight: 1.6,
                    }}
                    placeholder={editMode ? '(추가 설명)' : ''}
                  >
                    {u.desc2}
                  </EditableText>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </PageFrame>
  );
}
