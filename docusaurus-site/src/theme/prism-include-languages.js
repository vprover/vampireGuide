import defineTPTP from '../prism-tptp';

export default function prismIncludeLanguages(Prism) {
  // Prism here is the same instance Docusaurus uses
  defineTPTP(Prism);

  // ALSO register for the global Prism used by Prism-Live
  if (typeof window !== 'undefined' && window.Prism && window.Prism !== Prism) {
    try { defineTPTP(window.Prism); } catch {}
  }

  // If global Prism arrives a bit later (deferred scripts), try again soon:
  if (typeof window !== 'undefined' && !window.__tptpBridge) {
    window.__tptpBridge = true;
    const tryRegister = () => {
      if (window.Prism) { try { defineTPTP(window.Prism); } catch {} }
    };
    document.addEventListener('DOMContentLoaded', tryRegister);
    window.addEventListener('load', tryRegister);
  }

}
