import defineTPTP from '../prism-tptp';

export default function prismIncludeLanguages(Prism) {
  // Prism here is the same instance Docusaurus uses
  defineTPTP(Prism);
}
