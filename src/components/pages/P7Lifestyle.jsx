import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';

// P7: 감성 라이프스타일 (세로 3모듈)
export default function P7Lifestyle({
  copy = {},
  images = [],
  editMode = false,
  overrides = {},
  onOverrideChange = () => {},
}) {
  const { title = '일상에 자연스럽게', subTitle = '', modules = [] } = copy;
  const editPropsFor = (id) => ({
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  return (
    <PageFrame height={2000} bg={BRAND.colors.white}>
      <div style={{ padding: '60px 40px 20px', textAlign: 'center' }}>
        <EditableText
          {...editPropsFor('P7.title')}
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
          {title}
        </EditableText>
        {(subTitle || editMode) && (
          <div style={{ marginTop: 14 }}>
            <EditableText
              {...editPropsFor('P7.subTitle')}
              as="p"
              defaultStyle={{
                fontSize: 24,
                fontWeight: 500,
                color: BRAND.colors.text,
                margin: 0,
                textAlign: 'center',
                lineHeight: 1.6,
              }}
              placeholder={editMode ? '(서브 카피)' : ''}
            >
              {subTitle}
            </EditableText>
          </div>
        )}
      </div>

      <div style={{ padding: '20px 30px 60px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        {modules.slice(0, 3).map((m, i) => (
          <div key={i}>
            <EditableImage
              id={`P7.images.${i}`}
              src={images[i]}
              aspect="4 / 3"
              radius={16}
              editMode={editMode}
              override={overrides[`P7.images.${i}`] || {}}
              onChange={(partial) => onOverrideChange(`P7.images.${i}`, partial)}
            />
            <EditableText
              {...editPropsFor(`P7.modules.${i}.caption`)}
              as="div"
              defaultStyle={{
                marginTop: 18,
                textAlign: 'center',
                fontSize: 26,
                fontWeight: 700,
                color: BRAND.colors.text,
                letterSpacing: '-0.02em',
              }}
            >
              {m.caption}
            </EditableText>
          </div>
        ))}
      </div>
    </PageFrame>
  );
}
