// Catálogo de idiomas oferecidos aos ouvintes (código BCP-47 aceito pelo Gemini Live translate).
export const LANGUAGE_CATALOG: { code: string; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'zh-Hans', label: '中文', flag: '🇨🇳' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ht', label: 'Kreyòl ayisyen', flag: '🇭🇹' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'tl', label: 'Filipino', flag: '🇵🇭' },
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
  'zh-Hans': '用您的语言收听本次聚会',
  'ko': '이 예배를 여러분의 언어로 들으세요',
  'ja': 'この礼拝をあなたの言語でお聴きください',
  'ht': 'Koute sèvis sa a nan lang ou',
  'ru': 'Слушайте это богослужение на своём языке',
  'uk': 'Слухайте це богослужіння своєю мовою',
  'ar': 'استمع إلى هذه الخدمة بلغتك',
  'hi': 'इस सेवा को अपनी भाषा में सुनें',
  'vi': 'Nghe buổi lễ này bằng ngôn ngữ của bạn',
  'tl': 'Pakinggan ang serbisyong ito sa iyong wika',
};
export const posterHeadline = (code: string) => POSTER_HEADLINE[code] ?? POSTER_HEADLINE['en'];
