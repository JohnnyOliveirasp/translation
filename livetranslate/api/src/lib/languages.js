// Allowlist de idiomas que a API aceita. O session-manager valida contra o CATALOGO
// daqui (`invalid language` / `language not available`), então um idioma que esteja
// no catálogo do SITE mas falte aqui aparece para o ouvinte e morre ao ser escolhido.
// REGRA: este arquivo e `site/src/lib/languages.ts` têm que andar juntos.

const FLAGS = {
  en: '🇺🇸', es: '🇪🇸', 'pt-BR': '🇧🇷', fr: '🇫🇷', de: '🇩🇪', it: '🇮🇹',
  nl: '🇳🇱', 'zh-Hans': '🇨🇳', ko: '🇰🇷', ja: '🇯🇵', ru: '🇷🇺', uk: '🇺🇦',
  ar: '🇸🇦', hi: '🇮🇳', vi: '🇻🇳', fil: '🇵🇭',
};

// Catálogo completo que o operador pode oferecer.
// Todos conferidos contra a tabela oficial do Gemini Live Translate em 20/09/2026
// (ai.google.dev/gemini-api/docs/live-api/live-translate — 77 idiomas).
// ATENÇÃO: Kreyòl ayisyen (ht) NÃO está na tabela do modelo — não incluir.
// ATENÇÃO: Filipino é `fil` no Gemini, NÃO `tl`.
export const CATALOGO = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt-BR', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'zh-Hans', label: '中文' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'fil', label: 'Filipino' },
].map(l => ({ ...l, flag: FLAGS[l.code] || '🌐' }));

export function getLanguages() {
  const codes = (process.env.TARGET_LANGUAGES || 'en').split(',').map(s => s.trim()).filter(Boolean);
  const labels = Object.fromEntries(
    (process.env.LANGUAGE_LABELS || '').split(',').filter(Boolean).map(pair => {
      const [code, label] = pair.split(':');
      return [code.trim(), (label || code).trim()];
    })
  );
  return codes.map(code => ({ code, label: labels[code] || code, flag: FLAGS[code] || '🌐' }));
}
