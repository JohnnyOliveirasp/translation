// DEPOIMENTOS — Johnny troca por reais. Enquanto `sample: true`, o card mostra a etiqueta "Sample".
// Formato: citação + nome + cargo + igreja/cidade (+ foto opcional em public/assets/people/, + badge opcional).
export type Testimonial = {
  quote: string;
  name: string;
  role: string;      // ex.: "Lead Pastor", "Media Director"
  org: string;       // ex.: "Grace Church · Tampa, FL"
  photo?: string;    // ex.: "/assets/people/maria.jpg"
  badge?: string;    // ex.: "3 languages every Sunday"
  sample?: boolean;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    quote: 'She sat through the whole sermon in Spanish and came up afterwards to say she had understood every word for the first time.',
    name: 'Pastor Daniel R.',
    role: 'Lead Pastor',
    org: 'Grace Fellowship · Orlando, FL',
    badge: 'Spanish + Portuguese',
    sample: true,
  },
  {
    quote: 'Our volunteer used to sit at the desk hitting mute for every song. Now he worships with everyone else and the translation just handles it.',
    name: 'Marcus T.',
    role: 'Media Director',
    org: 'Living Hope Church · Tampa, FL',
    badge: 'Worship Sense on',
    sample: true,
  },
  {
    quote: 'We ran a three-day conference in four languages with one laptop and a QR code on every seat. Nobody asked where the headsets were.',
    name: 'Ana Lucía M.',
    role: 'Event Director',
    org: 'Casa de Paz · Miami, FL',
    badge: '4 languages · 1 laptop',
    sample: true,
  },
  {
    quote: 'Setup took ten minutes before the service. The first Sunday, three families who had been quietly sitting in the back stayed for coffee.',
    name: 'Rev. Samuel K.',
    role: 'Senior Pastor',
    org: 'Cornerstone Chapel · Atlanta, GA',
    badge: 'Live in 10 minutes',
    sample: true,
  },
  {
    quote: 'Minha mãe não fala inglês e nunca tinha acompanhado um culto inteiro aqui. Agora ela ouve a pregação em português no celular dela.',
    name: 'Juliana S.',
    role: 'Member',
    org: 'Igreja Vida Nova · Boston, MA',
    badge: 'Português',
    sample: true,
  },
];
