/**
 * Worship Sense — detector de louvor × pregação (portado da POC3, regra calibrada em 23/08).
 * Roda no navegador do operador com YAMNet via MediaPipe Tasks Audio (WASM, custo zero de servidor).
 *
 * Regra RELATIVA (a absoluta não servia: com mic de lapela a música chega abafada, score 0,15–0,4):
 *   - média móvel de 5 janelas (~1 janela/s) para não reagir a pico isolado;
 *   - MUSIC: smM >= limMus (0,15) E smM > smF × margem (2,0), por janMus (4) janelas → muta;
 *   - SPEECH: smF >= limFala (0,30) E smF > smM, por janFala (8) janelas → desmuta.
 * A assimetria (8 vs 4) é de propósito: oração ou fala do líder entre versos não pode
 * soltar a tradução no meio do louvor.
 */
export type Cfg = { limFala: number; janFala: number; limMus: number; margem: number; janMus: number };
// janFala era 8 (≈8s). Medido no 1º culto real (30/08): o detector segurava a
// tradução por 6,8s em média — 8s no pior caso — DEPOIS que a fala clara começava,
// e o operador teve de forçar na mão. Nenhum falso-unmute foi observado no louvor
// (a exigência de smF > smM protege), então 5 janelas dá a folga sem perder proteção.
export const CFG_PADRAO: Cfg = { limFala: 0.30, janFala: 5, limMus: 0.15, margem: 2.0, janMus: 4 };

export type Estado = 'UNKNOWN' | 'SPEECH' | 'MUSIC';
export type Janela = {
  fala: number; musica: number; top1: string;   // scores CRUS (log/recalibragem)
  smF: number; smM: number;                     // suavizados (decisão/UI)
  estado: Estado;
};

const CATS_MUSICA = ['Music', 'Singing', 'Choir', 'Musical instrument'];

export class WorshipSense {
  private histF: number[] = [];
  private histM: number[] = [];
  private contFala = 0;
  private contMusica = 0;
  estado: Estado = 'UNKNOWN';

  constructor(private cfg: Cfg = { ...CFG_PADRAO }) {}

  setCfg(cfg: Cfg) { this.cfg = cfg; }

  /** Recebe as categorias de uma janela do YAMNet e devolve a leitura + estado. */
  push(cats: { categoryName: string; score: number }[]): Janela {
    let fala = 0, musica = 0, top1 = '', topScore = -1;
    for (const c of cats) {
      if (c.score > topScore) { topScore = c.score; top1 = c.categoryName; }
      if (c.categoryName === 'Speech') fala = Math.max(fala, c.score);
      if (CATS_MUSICA.includes(c.categoryName)) musica = Math.max(musica, c.score);
    }

    this.histF.push(fala); if (this.histF.length > 5) this.histF.shift();
    this.histM.push(musica); if (this.histM.length > 5) this.histM.shift();
    const media = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const smF = media(this.histF), smM = media(this.histM);

    const { limFala, janFala, limMus, margem, janMus } = this.cfg;
    if (smF >= limFala && smF > smM) this.contFala++; else this.contFala = 0;
    if (smM >= limMus && smM > smF * margem) this.contMusica++; else this.contMusica = 0;

    if (this.contFala >= janFala) this.estado = 'SPEECH';
    else if (this.contMusica >= janMus) this.estado = 'MUSIC';

    return { fala, musica, top1, smF, smM, estado: this.estado };
  }
}
