import { useRef } from 'react';
import { motion, useInView, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { segments } from '../i18n';

const EASE = [0.16, 1, 0.3, 1] as const;

/** Cada palavra sobe (y:20 → 0) com atraso escalonado de 0,08s, disparado por useInView (once). */
export function WordsPullUp({ text, className = '', showAsterisk = false, as: Tag = 'h2' }:
  { text: string; className?: string; showAsterisk?: boolean; as?: 'h1' | 'h2' | 'p' }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const words = text.split(' ');
  const Comp = motion[Tag] as typeof motion.h2;
  return (
    <Comp ref={ref as never} className={`inline-flex flex-wrap ${className}`}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="relative mr-[0.25em] inline-block"
          initial={{ y: 20, opacity: 0 }}
          animate={inView ? { y: 0, opacity: 1 } : {}}
          transition={{ delay: i * 0.08, duration: 0.6, ease: EASE }}
        >
          {w}
          {showAsterisk && i === words.length - 1 && (
            <span className="absolute -right-[0.3em] top-[0.65em] text-[0.31em]">*</span>
          )}
        </motion.span>
      ))}
    </Comp>
  );
}

/**
 * Versão multi-estilo: recebe texto com *trechos* que viram itálico (Instrument Serif, cinza),
 * preservando o pull-up palavra a palavra.
 */
export function WordsPullUpMultiStyle({ text, className = '', emClassName = 'font-serif italic text-muted', center = true }:
  { text: string; className?: string; emClassName?: string; center?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const words = segments(text).flatMap(seg =>
    seg.text.split(' ').filter(Boolean).map(w => ({ w, em: seg.em })),
  );
  return (
    <div ref={ref} className={`inline-flex flex-wrap ${center ? 'justify-center' : ''} ${className}`}>
      {words.map((it, i) => (
        <motion.span
          key={i}
          className={`mr-[0.25em] inline-block ${it.em ? emClassName : ''}`}
          initial={{ y: 20, opacity: 0 }}
          animate={inView ? { y: 0, opacity: 1 } : {}}
          transition={{ delay: i * 0.08, duration: 0.6, ease: EASE }}
        >
          {it.w}
        </motion.span>
      ))}
    </div>
  );
}

/** Uma letra cuja opacidade acompanha o scroll (0,2 → 1) — revelação progressiva do parágrafo. */
function AnimatedLetter({ ch, index, total, progress }: { ch: string; index: number; total: number; progress: MotionValue<number> }) {
  const p = index / total;
  const opacity = useTransform(progress, [p - 0.1, p + 0.05], [0.2, 1]);
  return <motion.span style={{ opacity }}>{ch}</motion.span>;
}

export function ScrollRevealParagraph({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.8', 'end 0.2'] });
  const chars = Array.from(text);
  return (
    <p ref={ref} className={className} aria-label={text}>
      {chars.map((ch, i) => (
        <AnimatedLetter key={i} ch={ch} index={i} total={chars.length} progress={scrollYProgress} />
      ))}
    </p>
  );
}

/** Entrada suave para blocos (fade + rise) quando entram na viewport. */
export function Rise({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ y: 20, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ delay, duration: 0.8, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
