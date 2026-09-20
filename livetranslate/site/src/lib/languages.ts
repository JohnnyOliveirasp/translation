// Catálogo de idiomas oferecidos aos ouvintes (código BCP-47 aceito pelo Gemini Live translate).
//
// ⚠️ ESTE ARQUIVO E `api/src/lib/languages.js` TÊM QUE ANDAR JUNTOS.
// A API valida o idioma contra o CATALOGO dela (session-manager: `invalid language`).
// Um idioma que esteja só aqui aparece para o ouvinte e MORRE quando ele escolhe.
//
// Conferido contra a tabela oficial do modelo em 20/09/2026 (77 idiomas):
// ai.google.dev/gemini-api/docs/live-api/live-translate
//  - Kreyòl ayisyen (ht) NÃO está na tabela — removido daqui em 20/09.
//  - Filipino é `fil` no Gemini, NÃO `tl` — corrigido em 20/09.
export const LANGUAGE_CATALOG: { code: string; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { code: 'zh-Hans', label: '中文', flag: '🇨🇳' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'fil', label: 'Filipino', flag: '🇵🇭' },
];
export const PLAN_LIMITS: Record<string, number> = { starter: 2, growth: 5, congregation: 99 };
export const langLabel = (code: string) => LANGUAGE_CATALOG.find(l => l.code === code)?.label ?? code;

/** Frase do cartaz na língua do ouvinte — vai abaixo do QR, para quem não lê inglês. */
export const POSTER_HEADLINE: Record<string, string> = {
  'en': 'Hear this service in your language',
  'es': 'Escuche este culto en su idioma',
  'pt-BR': 'Ouça este culto no seu idioma',
  'fr': 'Écoutez ce culte dans votre langue',
  'de': 'Hören Sie diesen Gottesdienst in Ihrer Sprache',
  'it': 'Ascolta questo culto nella tua lingua',
  'nl': 'Beluister deze dienst in uw eigen taal',
  'zh-Hans': '用您的语言收听本次聚会',
  'ko': '이 예배를 여러분의 언어로 들으세요',
  'ja': 'この礼拝をあなたの言語でお聴きください',
  'ru': 'Слушайте это богослужение на своём языке',
  'uk': 'Слухайте це богослужіння своєю мовою',
  'ar': 'استمع إلى هذه الخدمة بلغتك',
  'hi': 'इस सेवा को अपनी भाषा में सुनें',
  'vi': 'Nghe buổi lễ này bằng ngôn ngữ của bạn',
  'fil': 'Pakinggan ang serbisyong ito sa iyong wika',
};
export const posterHeadline = (code: string) => POSTER_HEADLINE[code] ?? POSTER_HEADLINE['en'];
