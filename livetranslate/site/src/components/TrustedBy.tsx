import { Church, Cross, Flame, Sun, Anchor, Mountain, Sprout, Heart, Waves, Star, type LucideIcon } from 'lucide-react';
import { useLang } from '../i18n';

/** Faixa de logos (marquee) logo abaixo do hero — estilo "trusted by".
 *  Redeem é cliente real. Os demais são AMOSTRAS (sample: true) para preencher a faixa
 *  até entrarem igrejas reais — trocar pelo logo em public/assets/churches/ e apagar a amostra. */
type Item = { name: string; logo?: string; icon?: LucideIcon; sample?: boolean };
const CHURCHES: Item[] = [
  { name: 'Redeem Community Church', logo: '/assets/churches/redeem-community-church.png' },
  { name: 'Grace Fellowship', icon: Cross, sample: true },
  { name: 'Living Hope Church', icon: Sun, sample: true },
  { name: 'New Life Assembly', icon: Sprout, sample: true },
  { name: 'Cornerstone Chapel', icon: Church, sample: true },
  { name: 'Igreja Vida Nova', icon: Flame, sample: true },
  { name: 'Iglesia Casa de Paz', icon: Heart, sample: true },
  { name: 'Harbor City Church', icon: Anchor, sample: true },
  { name: 'Summit Bible Church', icon: Mountain, sample: true },
  { name: 'Riverside Community', icon: Waves, sample: true },
  { name: 'Bright Star Ministries', icon: Star, sample: true },
];

function Logo({ it }: { it: Item }) {
  if (it.logo) return <img src={it.logo} alt={it.name} className="h-9 w-auto md:h-10" />;
  const Icon = it.icon!;
  return (
    <span className="flex items-center gap-2 whitespace-nowrap font-serif text-xl tracking-tight text-ink/70 md:text-2xl">
      <Icon className="h-5 w-5 text-ink/50 md:h-6 md:w-6" strokeWidth={1.75} />
      {it.name}
    </span>
  );
}

export default function TrustedBy() {
  const { t } = useLang();
  const row = [...CHURCHES, ...CHURCHES]; // duplicado = loop contínuo sem emenda
  return (
    <section id="trusted" className="relative z-10 border-y border-black/[0.06] bg-white/60 py-10 backdrop-blur-sm md:py-12">
      <p className="mb-8 text-center text-xs text-muted sm:text-sm">{t('trusted.label')}</p>
      <div className="marquee-mask overflow-hidden">
        <div className="marquee flex w-max items-center gap-14 pr-14 md:gap-20 md:pr-20">
          {row.map((it, i) => (
            <div key={i} className="flex shrink-0 items-center opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0" aria-hidden={i >= CHURCHES.length}>
              <Logo it={it} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
