// DEPOIMENTOS — Johnny troca por reais. Enquanto `sample: true`, o card mostra a etiqueta "Sample".
// Formato: citação + nome + cargo + igreja/cidade (+ foto opcional em public/assets/people/, + badge opcional).
//
// 22/09: o site é trilíngue — citação, cargo e badge aceitam UM texto por idioma
// ({ en, es, pt }). Um depoimento real pode ficar só no idioma em que foi dito (string
// simples): aí ele aparece igual nos três idiomas, o que é aceitável para uma citação.
import type { Lang } from '../i18n/dictionary';

export type Txt = string | Record<Lang, string>;
export const txt = (x: Txt, lang: Lang) => (typeof x === 'string' ? x : x[lang] ?? x.en);

export type Testimonial = {
  quote: Txt;
  name: string;
  role: Txt;         // ex.: "Lead Pastor", "Media Director"
  org: string;       // ex.: "Grace Church · Tampa, FL"
  photo?: string;    // ex.: "/assets/people/maria.jpg"
  badge?: Txt;       // ex.: "3 languages every Sunday"
  sample?: boolean;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    quote: {
      en: 'She sat through the whole sermon in Spanish and came up afterwards to say she had understood every word for the first time.',
      es: 'Escuchó todo el sermón en español y después vino a decirnos que, por primera vez, había entendido cada palabra.',
      pt: 'Ela acompanhou a pregação inteira em espanhol e depois veio dizer que, pela primeira vez, tinha entendido cada palavra.',
    },
    name: 'Pastor Daniel R.',
    photo: '/assets/people/daniel.jpg',
    role: { en: 'Lead Pastor', es: 'Pastor principal', pt: 'Pastor titular' },
    org: 'Grace Fellowship · Orlando, FL',
    badge: { en: 'Spanish + Portuguese', es: 'Español + portugués', pt: 'Espanhol + português' },
    sample: true,
  },
  {
    quote: {
      en: 'Our volunteer used to sit at the desk hitting mute for every song. Now he worships with everyone else and the translation just handles it.',
      es: 'Nuestro voluntario pasaba el culto en la mesa silenciando cada canción. Ahora adora con todos los demás y la traducción se encarga sola.',
      pt: 'Nosso voluntário passava o culto na mesa apertando o mudo a cada música. Agora ele louva junto com todo mundo e a tradução resolve sozinha.',
    },
    name: 'Marcus T.',
    photo: '/assets/people/marcus.jpg',
    role: { en: 'Media Director', es: 'Director de medios', pt: 'Diretor de mídia' },
    org: 'Living Hope Church · Tampa, FL',
    badge: { en: 'Worship Sense on', es: 'Worship Sense activo', pt: 'Worship Sense ligado' },
    sample: true,
  },
  {
    quote: {
      en: 'We ran a three-day conference in four languages with one laptop and a QR code on every seat. Nobody asked where the headsets were.',
      es: 'Hicimos una conferencia de tres días en cuatro idiomas con una sola laptop y un código QR en cada asiento. Nadie preguntó por los audífonos.',
      pt: 'Fizemos uma conferência de três dias em quatro idiomas com um só notebook e um QR code em cada cadeira. Ninguém perguntou pelos fones.',
    },
    name: 'Ana Lucía M.',
    photo: '/assets/people/ana-lucia.jpg',
    role: { en: 'Event Director', es: 'Directora de eventos', pt: 'Diretora de eventos' },
    org: 'Casa de Paz · Miami, FL',
    badge: { en: '4 languages · 1 laptop', es: '4 idiomas · 1 laptop', pt: '4 idiomas · 1 notebook' },
    sample: true,
  },
  {
    quote: {
      en: 'Setup took ten minutes before the service. The first Sunday, three families who had been quietly sitting in the back stayed for coffee.',
      es: 'La configuración tomó diez minutos antes del culto. El primer domingo, tres familias que siempre se sentaban calladas al fondo se quedaron al café.',
      pt: 'A configuração levou dez minutos antes do culto. No primeiro domingo, três famílias que sempre sentavam quietas lá atrás ficaram para o café.',
    },
    name: 'Rev. Samuel K.',
    photo: '/assets/people/samuel.jpg',
    role: { en: 'Senior Pastor', es: 'Pastor principal', pt: 'Pastor sênior' },
    org: 'Cornerstone Chapel · Atlanta, GA',
    badge: { en: 'Live in 10 minutes', es: 'En vivo en 10 minutos', pt: 'No ar em 10 minutos' },
    sample: true,
  },
  {
    quote: {
      en: 'My mother doesn’t speak English and had never followed a whole service here. Now she hears the sermon in Portuguese on her own phone.',
      es: 'Mi mamá no habla inglés y nunca había podido seguir un culto entero aquí. Ahora escucha la prédica en portugués en su propio celular.',
      pt: 'Minha mãe não fala inglês e nunca tinha acompanhado um culto inteiro aqui. Agora ela ouve a pregação em português no celular dela.',
    },
    name: 'Juliana S.',
    photo: '/assets/people/juliana.jpg',
    role: { en: 'Member', es: 'Miembro', pt: 'Membro' },
    org: 'Igreja Vida Nova · Boston, MA',
    badge: { en: 'Portuguese', es: 'Portugués', pt: 'Português' },
    sample: true,
  },
];
