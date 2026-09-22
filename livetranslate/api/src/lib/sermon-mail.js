// Sermão por e-mail no fim de cada culto (22/09/2026).
//
// Fluxo: "End broadcast" → PDFs gerados (sermon-pdf.js) → a LISTA é lida NA HORA com o token
// de quem encerrou (RPC sermon_mailing_list: vale para o operador, não só o admin) → envio
// AGENDADO para daqui a SERMON_MAIL_DELAY_MINUTES (padrão 10). Se o operador voltar ao ar
// antes disso (encerrou sem querer), o envio é cancelado; o próximo "End broadcast" regera
// os PDFs com o culto inteiro e reagenda.
//
// Quem recebe (decisão do Johnny, 22/09): TODO inscrito, TODO culto, no idioma que escolheu,
// com o PDF daquele idioma e link de descadastro. A igreja (Settings → sermon_recipients)
// recebe um e-mail com TODOS os PDFs do dia.
//
// Regras:
//  - PDF marcado 'nativo-degradado' (letras viraram '?') NUNCA sai por e-mail.
//  - Um e-mail por pessoa: ninguém vê o endereço de ninguém, e um endereço ruim não
//    derruba o lote (um 422 no Resend reprova a chamada inteira).
//  - Registro por culto em sermons/{slug}/{AAAAMMDD}-envio.json, com HASH do e-mail (nunca o
//    endereço): um segundo "End broadcast" no mesmo dia não repete para quem já recebeu.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { enviarEmail, emailConfigurado, logEmail, mascarar } from './email.js';
import { churchPublic } from './tenant.js';

const SUPA_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SITE = (process.env.PUBLIC_URL || 'https://livetranslate.church').replace(/\/$/, '');

// ── Textos, um por idioma do catálogo ─────────────────────────────────────────────────
// {igreja} e {data} são trocados na hora; {data} vem por extenso no próprio idioma (Intl).
export const TXT = {
  'en': { titulo: 'Sermon of {data}', abre: 'Here is the message from the service of {data}.', anexo: 'The full sermon is in the attached PDF.', motivo: 'You are receiving this email because you asked for the sermon on the live translation page of {igreja}.', sair: 'Unsubscribe', saiu: 'Done — you will no longer receive sermons from {igreja}.', invalido: 'This unsubscribe link is not valid.' },
  'pt-BR': { titulo: 'Pregação de {data}', abre: 'Aqui está a mensagem do culto de {data}.', anexo: 'A pregação completa está no PDF em anexo.', motivo: 'Você recebe este e-mail porque pediu a pregação na página de tradução ao vivo de {igreja}.', sair: 'Cancelar inscrição', saiu: 'Pronto — você não vai mais receber as pregações de {igreja}.', invalido: 'Este link de cancelamento não é válido.' },
  'es': { titulo: 'Sermón del {data}', abre: 'Aquí está el mensaje del culto del {data}.', anexo: 'El sermón completo está en el PDF adjunto.', motivo: 'Recibes este correo porque pediste el sermón en la página de traducción en vivo de {igreja}.', sair: 'Darse de baja', saiu: 'Listo — ya no recibirás los sermones de {igreja}.', invalido: 'Este enlace para darse de baja no es válido.' },
  'fr': { titulo: 'Prédication du {data}', abre: 'Voici le message du culte du {data}.', anexo: 'La prédication complète se trouve dans le PDF joint.', motivo: 'Vous recevez cet e-mail parce que vous avez demandé la prédication sur la page de traduction en direct de {igreja}.', sair: 'Se désinscrire', saiu: 'C’est fait — vous ne recevrez plus les prédications de {igreja}.', invalido: 'Ce lien de désinscription n’est pas valide.' },
  'de': { titulo: 'Predigt vom {data}', abre: 'Hier ist die Botschaft aus dem Gottesdienst vom {data}.', anexo: 'Die vollständige Predigt finden Sie im angehängten PDF.', motivo: 'Sie erhalten diese E-Mail, weil Sie die Predigt auf der Live-Übersetzungsseite von {igreja} angefordert haben.', sair: 'Abmelden', saiu: 'Erledigt — Sie erhalten keine Predigten von {igreja} mehr.', invalido: 'Dieser Abmeldelink ist nicht gültig.' },
  'it': { titulo: 'Predicazione del {data}', abre: 'Ecco il messaggio del culto del {data}.', anexo: 'La predicazione completa è nel PDF allegato.', motivo: 'Ricevi questa email perché hai richiesto la predicazione nella pagina di traduzione dal vivo di {igreja}.', sair: 'Annulla iscrizione', saiu: 'Fatto — non riceverai più le predicazioni di {igreja}.', invalido: 'Questo link di disiscrizione non è valido.' },
  'nl': { titulo: 'Preek van {data}', abre: 'Hier is de boodschap uit de dienst van {data}.', anexo: 'De volledige preek staat in de bijgevoegde pdf.', motivo: 'U ontvangt deze e-mail omdat u de preek hebt aangevraagd op de live-vertaalpagina van {igreja}.', sair: 'Afmelden', saiu: 'Klaar — u ontvangt geen preken meer van {igreja}.', invalido: 'Deze afmeldlink is niet geldig.' },
  'fil': { titulo: 'Pangaral noong {data}', abre: 'Narito ang mensahe mula sa serbisyo noong {data}.', anexo: 'Nasa kalakip na PDF ang buong pangaral.', motivo: 'Natanggap mo ang email na ito dahil hiniling mo ang pangaral sa live translation page ng {igreja}.', sair: 'Mag-unsubscribe', saiu: 'Tapos na — hindi ka na makakatanggap ng mga pangaral mula sa {igreja}.', invalido: 'Hindi wasto ang link na ito.' },
  'vi': { titulo: 'Bài giảng ngày {data}', abre: 'Đây là sứ điệp từ buổi lễ ngày {data}.', anexo: 'Toàn bộ bài giảng nằm trong tệp PDF đính kèm.', motivo: 'Bạn nhận được email này vì đã yêu cầu bài giảng trên trang dịch trực tiếp của {igreja}.', sair: 'Hủy đăng ký', saiu: 'Xong — bạn sẽ không nhận bài giảng từ {igreja} nữa.', invalido: 'Liên kết hủy đăng ký này không hợp lệ.' },
  'zh-Hans': { titulo: '{data} 讲道', abre: '这是 {data} 聚会的信息。', anexo: '完整讲道内容见附件 PDF。', motivo: '您收到这封邮件，是因为您在 {igreja} 的现场翻译页面上登记了接收讲道。', sair: '取消订阅', saiu: '已完成——您将不再收到 {igreja} 的讲道。', invalido: '此取消订阅链接无效。' },
  'ko': { titulo: '{data} 설교', abre: '{data} 예배의 말씀입니다.', anexo: '설교 전문은 첨부된 PDF에 있습니다.', motivo: '{igreja}의 실시간 통역 페이지에서 설교를 요청하셨기 때문에 이 이메일을 받으셨습니다.', sair: '수신 거부', saiu: '완료되었습니다 — 더 이상 {igreja}의 설교를 받지 않습니다.', invalido: '이 수신 거부 링크는 유효하지 않습니다.' },
  'ja': { titulo: '{data} の説教', abre: '{data} の礼拝のメッセージです。', anexo: '説教の全文は添付の PDF にあります。', motivo: '{igreja} のライブ通訳ページで説教の送付を希望されたため、このメールをお送りしています。', sair: '配信停止', saiu: '完了しました — {igreja} からの説教は今後届きません。', invalido: 'この配信停止リンクは無効です。' },
  'ru': { titulo: 'Проповедь от {data}', abre: 'Вот послание с богослужения {data}.', anexo: 'Полный текст проповеди — во вложенном PDF.', motivo: 'Вы получили это письмо, потому что запросили проповедь на странице синхронного перевода {igreja}.', sair: 'Отписаться', saiu: 'Готово — вы больше не будете получать проповеди {igreja}.', invalido: 'Эта ссылка для отписки недействительна.' },
  'uk': { titulo: 'Проповідь від {data}', abre: 'Ось послання з богослужіння {data}.', anexo: 'Повний текст проповіді — у вкладеному PDF.', motivo: 'Ви отримали цей лист, бо запросили проповідь на сторінці синхронного перекладу {igreja}.', sair: 'Відписатися', saiu: 'Готово — ви більше не отримуватимете проповідей {igreja}.', invalido: 'Це посилання для відписки недійсне.' },
  'ar': { titulo: 'عظة {data}', abre: 'إليك رسالة خدمة {data}.', anexo: 'العظة الكاملة في ملف PDF المرفق.', motivo: 'تصلك هذه الرسالة لأنك طلبت العظة من صفحة الترجمة المباشرة لكنيسة {igreja}.', sair: 'إلغاء الاشتراك', saiu: 'تم — لن تصلك عظات {igreja} بعد الآن.', invalido: 'رابط إلغاء الاشتراك هذا غير صالح.' },
  'hi': { titulo: '{data} का प्रवचन', abre: 'यह {data} की आराधना का संदेश है।', anexo: 'पूरा प्रवचन संलग्न PDF में है।', motivo: 'आपको यह ईमेल इसलिए मिला है क्योंकि आपने {igreja} के लाइव अनुवाद पेज पर प्रवचन मँगवाया था।', sair: 'सदस्यता रद्द करें', saiu: 'हो गया — अब आपको {igreja} के प्रवचन नहीं मिलेंगे।', invalido: 'यह सदस्यता रद्द करने का लिंक मान्य नहीं है।' },
};

// Cópia da igreja (no idioma do orador; fora destes, inglês).
const COPIA = {
  'en': { intro: 'Copy for the church: the sermon of {data} in every language translated today is attached.', motivo: 'This address receives a copy of each sermon (Settings → sermon copies on livetranslate.church).' },
  'pt-BR': { intro: 'Cópia para a igreja: a pregação de {data} em todos os idiomas traduzidos hoje segue em anexo.', motivo: 'Este endereço recebe cópia de cada pregação (Configurações → cópia dos sermões em livetranslate.church).' },
  'es': { intro: 'Copia para la iglesia: el sermón del {data} en todos los idiomas traducidos hoy va adjunto.', motivo: 'Esta dirección recibe copia de cada sermón (Configuración → copia de los sermones en livetranslate.church).' },
};

const troca = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hash = email => createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 24);
const pausa = ms => new Promise(r => setTimeout(r, ms));

function dataBonita(dia, lang) {
  try {
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${dia}T12:00:00Z`));
  } catch { return dia; }
}

/** Cartão de e-mail: tabelas + estilo inline (é o que Gmail/Outlook respeitam). */
function montarHtml({ lang, igreja, logoUrl, logoClaro, titulo, paragrafos, motivo, linkSair, rotuloSair }) {
  const rtl = lang === 'ar';
  const topo = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(igreja)}" style="display:block;max-width:240px;max-height:56px;border:0">`
    : `<span style="font-family:Georgia,serif;font-size:22px;color:${logoClaro === false ? '#0f172a' : '#ffffff'}">${esc(igreja)}</span>`;
  const fundoTopo = logoUrl && logoClaro === false ? '#ffffff' : '#0f172a';
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td align="center" style="background:${fundoTopo};padding:24px 20px">${topo}</td></tr>
<tr><td style="padding:28px 28px 12px;text-align:${rtl ? 'right' : 'left'}">
<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-weight:normal;font-size:24px;line-height:30px;color:#111827">${esc(titulo)}</h1>
${paragrafos.map(p => `<p style="margin:0 0 12px;font-size:16px;line-height:24px">${esc(p)}</p>`).join('\n')}
</td></tr>
<tr><td style="padding:4px 28px 24px;text-align:${rtl ? 'right' : 'left'}"><div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;line-height:18px;color:#6b7280">
<p style="margin:0 0 6px">${esc(motivo)}</p>
${linkSair ? `<p style="margin:0"><a href="${esc(linkSair)}" style="color:#6b7280;text-decoration:underline">${esc(rotuloSair)}</a> · LiveTranslate</p>` : '<p style="margin:0">LiveTranslate</p>'}
</div></td></tr>
</table></td></tr></table></body></html>`;
}

// ── Lista de envio: lida com o token de quem encerrou ─────────────────────────────────
async function listaDeEnvio(slug, token) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/sermon_mailing_list`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: slug }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return r.json();
}

// ── Agendamento ───────────────────────────────────────────────────────────────────────
const agendados = new Map();   // slug → timeout

/** Operador voltou ao ar (set-source): o culto não tinha acabado — não manda nada ainda. */
export function cancelarEnvio(slug, motivo) {
  const t = agendados.get(slug);
  if (!t) return;
  clearTimeout(t);
  agendados.delete(slug);
  logEmail(`CANCELADO ${slug}: ${motivo}`);
}

/** Chamado no "End broadcast". Nunca lança; tudo o que acontece vai para logs/email.log. */
export async function agendarEnvioSermao({ slug, feitos, token, dia = new Date().toISOString().slice(0, 10) }) {
  try {
    if (!feitos?.length) { logEmail(`NADA A ENVIAR ${slug}: nenhum PDF gerado`); return; }
    if (!emailConfigurado()) { logEmail(`NÃO AGENDADO ${slug}: e-mail não configurado (RESEND_API_KEY / RESEND_FROM_EMAIL)`); return; }
    const lista = await listaDeEnvio(slug, token);
    const pub = await churchPublic(slug).catch(() => null);
    cancelarEnvio(slug, 'reagendado por novo End broadcast');
    const minutos = Math.max(0, Number(process.env.SERMON_MAIL_DELAY_MINUTES ?? 10));
    const t = setTimeout(() => {
      agendados.delete(slug);
      enviarSermao({ slug, dia, feitos, lista, pub }).catch(e => logEmail(`ENVIO FALHOU ${slug}: ${e?.message ?? e}`));
    }, minutos * 60_000);
    agendados.set(slug, t);
    logEmail(`AGENDADO ${slug} ${dia} em ${minutos} min — ouvintes=${lista.listeners?.length ?? 0} igreja=${lista.recipients?.length ?? 0} pdfs=${feitos.map(f => `${f.lang}:${f.motor}`).join(',')}`);
  } catch (e) {
    logEmail(`AGENDAMENTO FALHOU ${slug}: ${e?.message ?? e}`);
  }
}

// ── Envio ─────────────────────────────────────────────────────────────────────────────
// `rodada` (ex.: 'v2') = REENVIO do mesmo culto: registro e Idempotency-Key próprios — sem isso
// o registro do 1º envio e o Resend (24h) barram tudo, que é justamente o trabalho deles.
// `aviso` = { lang: 'texto' } — parágrafo no topo do e-mail explicando o reenvio.
export async function enviarSermao({ slug, dia, feitos, lista, pub, rodada = '', aviso = {} }) {
  const chaveDia = dia.replace(/-/g, '') + (rodada ? `-${rodada}` : '');
  const pasta = `sermons/${slug}`;
  const registroArq = `${pasta}/${chaveDia}-envio.json`;
  mkdirSync(pasta, { recursive: true });
  let registro = {};
  try { if (existsSync(registroArq)) registro = JSON.parse(readFileSync(registroArq, 'utf8')); } catch { registro = {}; }
  const salvar = () => { try { writeFileSync(registroArq, JSON.stringify(registro, null, 1)); } catch { /* segue */ } };

  const igreja = lista.name || pub?.name || slug;
  const orador = lista.speaker_lang || 'en';
  const logoUrl = lista.logo_path ? `${SUPA_URL}/storage/v1/object/public/logos/${lista.logo_path}` : null;
  const logoClaro = pub?.logoIsLight;

  // PDFs que podem sair: existem no disco e NÃO estão degradados
  const bons = feitos.filter(f => f.motor !== 'nativo-degradado' && existsSync(f.arquivo));
  const degradados = feitos.filter(f => f.motor === 'nativo-degradado').map(f => f.lang);
  if (degradados.length) logEmail(`SEM PDF BOM em ${degradados.join(',')} (${slug} ${dia}) — Chromium falhou; esses idiomas não recebem hoje`);
  const pdfDoIdioma = lang => lang === orador
    ? bons.find(f => f.lang === 'original')
    : bons.find(f => f.lang !== 'original' && f.codigo === lang);
  const anexo = f => ({ nome: `${slug}-${dia}-${f.lang}.pdf`, buf: readFileSync(f.arquivo) });

  // 1) cada ouvinte, no idioma dele
  let ok = 0, pulados = 0, falhas = 0;
  for (const o of lista.listeners ?? []) {
    const id = hash(o.email);
    if (registro[id]?.ok) { pulados++; continue; }   // já recebeu este culto
    const pdf = pdfDoIdioma(o.lang);
    if (!pdf) {
      // ninguém ouviu nesse idioma hoje → não há tradução para mandar
      registro[id] = { ok: false, lang: o.lang, motivo: `sem PDF em ${o.lang} hoje` };
      pulados++;
      logEmail(`PULADO para=${mascarar(o.email)}: sem PDF em ${o.lang} hoje`);
      continue;
    }
    const t = TXT[o.lang] ?? TXT.en;
    const v = { igreja, data: dataBonita(dia, o.lang) };
    const titulo = troca(t.titulo, v);
    const linkSair = `${SITE}/api/unsubscribe?t=${o.token}`;
    const paragrafos = [...(aviso[o.lang] ? [aviso[o.lang]] : []), troca(t.abre, v), troca(t.anexo, v)];
    const r = await enviarEmail({
      para: o.email,
      assunto: `${igreja} — ${titulo}`,
      nomeRemetente: igreja,
      html: montarHtml({ lang: o.lang, igreja, logoUrl, logoClaro, titulo, paragrafos, motivo: troca(t.motivo, v), linkSair, rotuloSair: t.sair }),
      texto: `${titulo}\n\n${paragrafos.join('\n\n')}\n\n—\n${troca(t.motivo, v)}\n${t.sair}: ${linkSair}\n`,
      anexos: [anexo(pdf)],
      // descadastro em um clique no Gmail/Yahoo (RFC 8058) — aponta para a mesma rota
      cabecalhos: { 'List-Unsubscribe': `<${linkSair}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      chave: `sermon-${slug}-${chaveDia}-${id}`,
    });
    registro[id] = { ok: r.ok, lang: o.lang, em: new Date().toISOString(), ...(r.ok ? { id: r.id } : { motivo: r.motivo }) };
    salvar();
    if (r.ok) ok++; else falhas++;
    await pausa(600);   // o Resend limita requisições por segundo
  }

  // 2) cópia da igreja, com todos os PDFs bons
  let okIgreja = 0, falhasIgreja = 0;
  if (bons.length) {
    const c = COPIA[orador] ?? COPIA.en;
    const t = TXT[orador] ?? TXT.en;
    const v = { igreja, data: dataBonita(dia, orador) };
    const titulo = troca(t.titulo, v);
    for (const dest of lista.recipients ?? []) {
      const id = `igreja:${hash(dest)}`;
      if (registro[id]?.ok) continue;
      const r = await enviarEmail({
        para: dest,
        assunto: `${igreja} — ${titulo}`,
        nomeRemetente: 'LiveTranslate',
        html: montarHtml({ lang: orador, igreja, logoUrl, logoClaro, titulo, paragrafos: [troca(c.intro, v)], motivo: c.motivo, linkSair: null }),
        texto: `${titulo}\n\n${troca(c.intro, v)}\n\n—\n${c.motivo}\n`,
        anexos: bons.map(anexo),
        chave: `sermon-${slug}-${chaveDia}-${id}`,
      });
      registro[id] = { ok: r.ok, em: new Date().toISOString(), anexos: bons.length, ...(r.ok ? { id: r.id } : { motivo: r.motivo }) };
      salvar();
      if (r.ok) okIgreja++; else falhasIgreja++;
      await pausa(600);
    }
  }

  logEmail(`FIM ${slug} ${dia}: ouvintes ok=${ok} pulados=${pulados} falhas=${falhas} · igreja ok=${okIgreja} falhas=${falhasIgreja}`);
  return { ok, pulados, falhas, okIgreja, falhasIgreja };
}

// ── Página de descadastro (rota /api/unsubscribe) ─────────────────────────────────────
export async function descadastrar(token) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(token || ''))) return null;
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/unsubscribe_listener`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const linhas = await r.json();
  return linhas?.[0] ?? null;   // { church_name, lang_code } ou null se o token não existe
}

export function paginaDescadastro(res) {
  const lang = res?.lang_code && TXT[res.lang_code] ? res.lang_code : 'en';
  const t = TXT[lang];
  const msg = res ? troca(t.saiu, { igreja: res.church_name }) : t.invalido;
  return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>LiveTranslate</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111827}
main{max-width:440px;margin:16px;background:#fff;border-radius:14px;padding:32px 28px;text-align:center}
p{font-size:17px;line-height:26px;margin:0}small{display:block;margin-top:18px;color:#6b7280}</style></head>
<body><main><p>${esc(msg)}</p><small>LiveTranslate</small></main></body></html>`;
}
