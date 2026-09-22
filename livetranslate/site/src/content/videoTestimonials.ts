// DEPOIMENTOS EM VÍDEO — página /testimonials (22/09/2026, pedido do Johnny):
// SÓ vídeos reais de quem usa o produto. Nada de amostra aqui.
//
// Os arquivos de vídeo NÃO ficam no git (pesam): sobem direto para o servidor em
//   /mnt/volume/livetranslate/site/assets/testimonials/<id>.mp4  (+ <id>.jpg como capa)
// O deploy do site (tar por cima) não apaga o que já está lá. Alternativa: `youtube: 'ID'`.
//
// Para adicionar um vídeo: um objeto abaixo + scp do .mp4 e .jpg + push (a Action publica).
import type { Txt } from './testimonials';

export type VideoTestimonial = {
  id: string;                 // slug: vira o nome do arquivo (assets/testimonials/<id>.mp4 / .jpg)
  name: string;               // quem fala
  role: Txt;                  // cargo, por idioma do site
  org: string;                // igreja · cidade
  spoken: 'en' | 'es' | 'pt'; // idioma falado no vídeo (mostra a bandeirinha/etiqueta)
  langs?: string[];           // idiomas que a igreja traduz (rótulos livres)
  quote?: Txt;                // uma frase do vídeo, opcional
  youtube?: string;           // se hospedado no YouTube, o ID (ex.: 'dQw4w9WgXcQ'); senão usa o .mp4 local
  portrait?: boolean;         // vídeo em pé (celular): o card fica 9:16 em vez de 16:9
  date?: string;              // 'AAAA-MM-DD'
};

export const GOOGLE_REVIEW_URL = '';   // link "Escreva uma avaliação" do Perfil da Empresa no Google — o botão aparece quando preenchido

export const VIDEO_TESTIMONIALS: VideoTestimonial[] = [
  // 1º depoimento real (gravado 22/09/2026, 1min28, vertical). O Johnny vai subir no YouTube:
  // trocar youtube: '' pelo ID do vídeo e tirar o comentário.
  // {
  //   id: 'marcus-livoni', name: 'Pastor Marcus Livoni',
  //   role: { en: 'Pastor', es: 'Pastor', pt: 'Pastor' },
  //   org: 'Ministério Celebrando a Recuperação (Celebrate Recovery) · Orlando, FL', spoken: 'pt', langs: ['Português'], portrait: true, date: '2026-09-22',
  //   quote: {
  //     en: 'Two taps and you are already hearing the service in Portuguese — and reading it too. For us it was a fundamental tool.',
  //     es: 'Dos toques y ya estás escuchando el culto en portugués, y leyéndolo también. Para nosotros fue una herramienta fundamental.',
  //     pt: 'Dois cliques e você já começa a ouvir o culto em português, e ler também. Para a gente foi uma ferramenta fundamental.',
  //   },
  //   youtube: '',
  // },
];
