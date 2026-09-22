// Países oferecidos no cadastro (0009: o país decide a moeda — BR paga em BRL, o resto em USD).
// Nomes vêm do próprio navegador (Intl.DisplayNames) no idioma do site: nada de dicionário.
export const COUNTRY_CODES = [
  'US', 'BR', 'CA', 'MX', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'DO', 'PR', 'CU',
  'CO', 'VE', 'EC', 'PE', 'BO', 'CL', 'AR', 'PY', 'UY',
  'PT', 'ES', 'GB', 'IE', 'FR', 'DE', 'IT', 'NL', 'BE', 'CH',
  'AO', 'MZ', 'CV', 'ZA', 'NG', 'GH', 'KE',
  'AU', 'NZ', 'JP', 'KR', 'PH', 'IN', 'AE', 'IL',
] as const;

export function countryName(code: string, loc: string): string {
  try { return new Intl.DisplayNames([loc], { type: 'region' }).of(code) ?? code; } catch { return code; }
}

/** Lista ordenada pelo nome no idioma do site. */
export function countryOptions(loc: string): { code: string; name: string }[] {
  return COUNTRY_CODES.map(code => ({ code, name: countryName(code, loc) }))
    .sort((a, b) => a.name.localeCompare(b.name, loc));
}

/** Palpite inicial pelo idioma do site: português → Brasil, espanhol → México, inglês → EUA. */
export const defaultCountry = (lang: string) => lang === 'pt' ? 'BR' : lang === 'es' ? 'MX' : 'US';
