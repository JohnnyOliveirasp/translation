// POC2 — Pipeline de cascata: Soniox (ASR streaming + diarização) →
// Gemini Flash (tradução com prompt teológico + glossário) → legendas.
// Validado no gate da Fase 1 (11/08/2026). Zero dependências.

const LANG_INFO = {
  'pt-BR': { nome: 'português brasileiro', biblia: 'NVI (Nova Versão Internacional)' },
  es: { nome: 'espanhol (América Latina)', biblia: 'Reina-Valera 1960' },
};

function systemPrompt(lang, glossario) {
  const info = LANG_INFO[lang];
  const gloss = glossario[lang] || {};
  const linhas = Object.entries(gloss).map(([en, tr]) => `${en} -> ${tr}`).join('\n');
  return [
    `Você é um intérprete simultâneo de um culto cristão evangélico.`,
    `Traduza do inglês para ${info.nome}.`,
    `Use a terminologia bíblica consagrada da ${info.biblia}.`,
    `Reconheça livros e personagens bíblicos e use as grafias oficiais.`,
    `Ao ouvir uma citação ou referência de versículo, use a forma consagrada da referência (ex.: "John 3:16" -> "João 3:16") e o texto EXATO da ${info.biblia} para AS PALAVRAS QUE O ORADOR DISSE.`,
    `NUNCA complete ou estenda uma citação além do que foi dito; traduza apenas o trecho falado.`,
    `O texto vem de reconhecimento de fala e pode ter pequenos erros; corrija pelo contexto sem comentar.`,
    `Traduza SOMENTE; nunca responda, comente, explique ou adicione nada.`,
    `Mantenha o registro reverente e oral da pregação.`,
    ``,
    `GLOSSÁRIO OBRIGATÓRIO (inglês -> tradução):`,
    linhas,
  ].join('\n');
}

export class Cascata {
  /**
   * @param {object} opts
   *  sonioxKey, geminiKey, sonioxModel, geminiModel
   *  langs: ['pt-BR','es']
   *  glossario: objeto do glossario.json
   *  onCaption(evt): { seg, lang, speaker, text }  — já EM ORDEM por idioma
   *  onSource(evt):  { seg, speaker, text }        — transcrição EN (painel do operador)
   *  onLog(obj):     linha p/ log de custo (nunca na tela)
   *  onState(s):     'conectado' | 'reconectando' | 'parado'
   */
  constructor(opts) {
    this.o = opts;
    this.ws = null;
    this.vivo = false;
    this.bufferTokens = [];
    this.contexto = [];
    this.segN = 0;
    this.filaAudio = [];       // chunks recebidos enquanto o WS não está aberto
    this.speakersVistos = new Set();
    // ordenação por idioma: emite legendas na ordem dos segmentos
    this.pend = Object.fromEntries(opts.langs.map(l => [l, new Map()]));
    this.prox = Object.fromEntries(opts.langs.map(l => [l, 1]));
    // fila separada p/ áudio TTS (chega depois da legenda, também em ordem)
    this.pendAud = Object.fromEntries(opts.langs.map(l => [l, new Map()]));
    this.proxAud = Object.fromEntries(opts.langs.map(l => [l, 1]));
    // 1 chamada de TTS por vez POR IDIOMA (evita rajada → 429 no modelo preview)
    this.ttsFila = Object.fromEntries(opts.langs.map(l => [l, Promise.resolve()]));
    this.sysPrompts = Object.fromEntries(opts.langs.map(l => [l, systemPrompt(l, opts.glossario)]));
  }

  start() {
    this.vivo = true;
    this._conectar();
    // destrava a fila de ordenação se alguma tradução falhar/atrasar demais
    this._timerOrdem = setInterval(() => this._destravar(), 2000);
  }

  _conectar() {
    if (!this.vivo) return;
    const ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket');
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.addEventListener('open', () => {
      const termos = Object.keys(this.o.glossario['pt-BR'] ?? {}).filter(t => /^[A-Z]/.test(t));
      ws.send(JSON.stringify({
        api_key: this.o.sonioxKey,
        model: this.o.sonioxModel,
        audio_format: 'pcm_s16le',
        sample_rate: 16000,
        num_channels: 1,
        language_hints: ['en'],
        enable_speaker_diarization: true,
        enable_endpoint_detection: true,
        endpoint_latency_adjustment_level: 2,
        endpoint_sensitivity: 0.3,
        max_endpoint_delay_ms: 1500,
        context: { terms: termos },
      }));
      // descarrega o que chegou durante a (re)conexão
      for (const b of this.filaAudio.splice(0)) ws.send(b);
      this.o.onState?.('conectado');
    });

    ws.addEventListener('message', ev => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      if (msg.error_code) {
        this.o.onLog?.({ tipo: 'soniox-erro', code: msg.error_code, msg: msg.error_message });
        return; // o close cuida da reconexão
      }
      for (const t of msg.tokens ?? []) {
        if (!t.is_final) continue;
        if (t.text.startsWith('<')) {
          if (t.text === '<end>') this._flush('endpoint');
          continue;
        }
        const prev = this.bufferTokens[this.bufferTokens.length - 1];
        if (prev && t.speaker != null && prev.speaker != null && t.speaker !== prev.speaker) {
          this._flush('troca-de-falante');
        }
        this.bufferTokens.push(t);
        if (/[.!?]$/.test(t.text.trim())) this._flush('pontuação');
      }
      if (msg.finished) this.o.onLog?.({ tipo: 'soniox', audio_ms: msg.total_audio_proc_ms ?? null });
    });

    ws.addEventListener('close', () => {
      if (!this.vivo) return;
      this.o.onState?.('reconectando');
      setTimeout(() => this._conectar(), 1000);
    });
    ws.addEventListener('error', () => { /* o close reconecta */ });
  }

  /** chunk PCM s16le 16kHz mono vindo do navegador do operador */
  write(buf) {
    if (!this.vivo) return;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(buf);
    else {
      this.filaAudio.push(buf);
      if (this.filaAudio.length > 400) this.filaAudio.shift(); // ~100s máx
    }
  }

  _flush(motivo) {
    if (!this.bufferTokens.length) return;
    const tokens = this.bufferTokens;
    this.bufferTokens = [];
    const texto = tokens.map(t => t.text).join('').trim();
    if (!texto || !/[a-zA-Z0-9]/.test(texto)) return;
    const seg = ++this.segN;
    const speaker = tokens.find(t => t.speaker != null)?.speaker ?? null;
    if (speaker != null) this.speakersVistos.add(speaker);
    const multi = this.speakersVistos.size > 1;

    this.o.onSource?.({ seg, speaker: multi ? speaker : null, text: texto });

    const textoLLM = multi && speaker != null ? `[Falante ${speaker}] ${texto}` : texto;
    const ctx = this.contexto.slice(-3);
    this.contexto.push(texto);
    if (this.contexto.length > 20) this.contexto.shift();

    for (const lang of this.o.langs) {
      this._traduzir(lang, textoLLM, ctx)
        .then(out => {
          this._entregar(lang, seg, speaker, multi, out);
          this._tts(lang, seg, out); // voz sai depois da legenda, em ordem
        })
        .catch(e => {
          this.o.onLog?.({ tipo: 'gemini-erro', lang, seg, msg: String(e).slice(0, 200) });
          this._entregar(lang, seg, speaker, multi, null); // não trava a fila
          this._entregarAudio(lang, seg, null);
        });
    }
  }

  // ---------- TTS (voz fixa) ----------
  _tts(lang, seg, texto) {
    if (!texto || this.o.ttsProvider === 'none') {
      return this._entregarAudio(lang, seg, null);
    }
    // serializa por idioma: mantém a ordem e evita rajada de chamadas (429)
    const chamada = this.o.ttsProvider === 'elevenlabs'
      ? () => this._ttsElevenLabs(lang, seg, texto)
      : () => this._ttsCall(lang, seg, texto);
    this.ttsFila[lang] = this.ttsFila[lang].then(chamada);
  }

  // ElevenLabs Flash: PCM 24k direto, ~0,5s, sem limite de chamadas/min
  async _ttsElevenLabs(lang, seg, texto, tentativa = 0) {
    try {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.o.elevenVoiceId}?output_format=pcm_24000`;
      const t0 = Date.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'xi-api-key': this.o.elevenKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: texto,
          model_id: this.o.elevenModel || 'eleven_flash_v2_5',
        }),
      });
      if (!res.ok) {
        if (tentativa < 1) { await new Promise(r => setTimeout(r, 600)); return this._ttsElevenLabs(lang, seg, texto, tentativa + 1); }
        throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 120)}`);
      }
      const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
      this.o.onLog?.({ tipo: 'tts', provider: 'elevenlabs', lang, ms: Date.now() - t0, chars: texto.length });
      this._entregarAudio(lang, seg, b64);
    } catch (e) {
      this.o.onLog?.({ tipo: 'tts-erro', lang, seg, msg: String(e).slice(0, 200) });
      this._entregarAudio(lang, seg, null);
    }
  }

  async _ttsCall(lang, seg, texto) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.o.ttsModel}:generateContent?key=${this.o.geminiKey}`;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const t0 = Date.now();
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: texto }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.o.voiceName } } },
            },
          }),
        });
        if (res.status === 429) {
          this.o.onLog?.({ tipo: 'tts-429', lang, seg, tentativa });
          await new Promise(r => setTimeout(r, 1500 * tentativa)); // espera e tenta de novo
          continue;
        }
        if (!res.ok) throw new Error(`TTS ${res.status}`);
        const data = await res.json();
        this.o.onLog?.({ tipo: 'tts', lang, ms: Date.now() - t0, usage: data.usageMetadata ?? null });
        const b64 = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data ?? null;
        return this._entregarAudio(lang, seg, b64);
      } catch (e) {
        if (tentativa === 3) break;
        await new Promise(r => setTimeout(r, 800));
      }
    }
    this.o.onLog?.({ tipo: 'tts-erro', lang, seg, msg: 'esgotou tentativas' });
    this._entregarAudio(lang, seg, null); // não trava a fila de áudio
  }

  _entregarAudio(lang, seg, b64) {
    this.pendAud[lang].set(seg, { seg, lang, data: b64, ts: Date.now() });
    while (this.pendAud[lang].has(this.proxAud[lang])) {
      const evt = this.pendAud[lang].get(this.proxAud[lang]);
      this.pendAud[lang].delete(this.proxAud[lang]);
      this.proxAud[lang]++;
      if (evt.data) this.o.onAudio?.(evt);
    }
  }

  async _traduzir(lang, texto, contexto, tentativa = 0) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.o.geminiModel}:generateContent?key=${this.o.geminiKey}`;
    const userText = contexto.length
      ? `Contexto anterior (já traduzido, NÃO retraduzir):\n${contexto.join('\n')}\n\nTraduza APENAS a fala a seguir:\n${texto}`
      : `Traduza APENAS a fala a seguir:\n${texto}`;
    const t0 = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: this.sysPrompts[lang] }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.2, thinkingConfig: { thinkingLevel: 'LOW' } },
      }),
    });
    if (!res.ok) {
      if (tentativa < 1) return this._traduzir(lang, texto, contexto, tentativa + 1);
      throw new Error(`Gemini ${res.status}`);
    }
    const data = await res.json();
    this.o.onLog?.({ tipo: 'gemini', lang, ms: Date.now() - t0, usage: data.usageMetadata ?? null });
    const out = (data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '').trim();
    // remove a marcação de falante que o modelo devolve, em qualquer idioma
    // ([Falante 2], [Hablante 2], [Speaker 2]…) — o cliente é quem formata
    return out.replace(/^\["?\s*\p{L}+\s+\d+\s*\]\s*/u, '');
  }

  _entregar(lang, seg, speaker, multi, texto) {
    this.pend[lang].set(seg, { seg, lang, speaker: multi ? speaker : null, text: texto, ts: Date.now() });
    this._emitirOrdenado(lang);
  }

  _emitirOrdenado(lang) {
    while (this.pend[lang].has(this.prox[lang])) {
      const evt = this.pend[lang].get(this.prox[lang]);
      this.pend[lang].delete(this.prox[lang]);
      this.prox[lang]++;
      if (evt.text) this.o.onCaption?.(evt);
    }
  }

  // se um segmento sumir (erro no LLM/TTS), pula depois de um tempo p/ não travar os seguintes
  _destravar() {
    for (const lang of this.o.langs) {
      for (const [fila, prox, limite] of [[this.pend[lang], 'prox', 6000], [this.pendAud[lang], 'proxAud', 10000]]) {
        if (!fila.size) continue;
        const menor = Math.min(...fila.keys());
        if (menor > this[prox][lang]) {
          const maisVelho = fila.get(menor);
          if (Date.now() - maisVelho.ts > limite) {
            this[prox][lang] = menor;
            if (prox === 'prox') this._emitirOrdenado(lang);
            else this._entregarAudio(lang, menor, fila.get(menor)?.data ?? null);
          }
        }
      }
    }
  }

  stop() {
    this.vivo = false;
    clearInterval(this._timerOrdem);
    this._flush('parada');
    try { this.ws?.send(''); } catch {}
    try { this.ws?.close(); } catch {}
    this.o.onState?.('parado');
  }
}
