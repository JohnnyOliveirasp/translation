// Allowlist de idiomas vinda do .env.local
// TARGET_LANGUAGES=en,pt-BR  |  LANGUAGE_LABELS=en:English,pt-BR:Português

const FLAGS = { 'pt-BR': '🇧🇷', es: '🇪🇸', en: '🇺🇸', fr: '🇫🇷', 'zh-Hans': '🇨🇳', hi: '🇮🇳', ar: '🇸🇦' };

// Catálogo completo que o operador pode oferecer (validados no modelo — spec §5)
export const CATALOGO = [
  { code: 'pt-BR', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'zh-Hans', label: '中文' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ar', label: 'العربية' },
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
