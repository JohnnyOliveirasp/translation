# Análise do CSV — culto 23/08/2026 (POC3 auto-broadcast)

CSV: `poc3-broadcast-2026-08-23T15-12-37-564Z.csv` (14:17:55→15:12:37 UTC, 6410 amostras ~1/s).
Contexto: **mic na LAPELA do pastor** → música ambiente chega abafada (score music
médio 0,18–0,27 no louvor, raro ≥0,5). Ponte pt: 67,3 min contínuos (custo.log).

## O que aconteceu

- 10:20:29 detector entrou em SPEECH e **ficou lá o culto inteiro** — nunca mutou.
- Sermão contínuo 10:20→~10:58 (fala med 0,3–0,4, música med 0,02) — correto não mutar.
- ~10:59 entrou música (music med 0,2–0,3, MAX 0,53) — regra antiga exigia music ≥ 0,5
  sustentado → **nunca disparou** ("aos 83 minutos entrou música e ele não acatou").
- 11:02:27–30 Johnny alternou FORCE_ON/OFF/AUTO (briga com o detector);
  11:06:32 FORCE_OFF (mute manual); 11:07:37 FORCE_ON até o fim.
- Trocas de voz (~40 min e ~53 min, "voz afeminada"): lado Gemini (renovações de
  sessão). SEM FORENSE — o deploy do sessao.log não tinha sido ativado e o cron das
  04:00 apagou os logs do PM2 de novo.

## Regra nova (simulada contra o culto inteiro → deployada 24/08)

Sobre MÉDIA MÓVEL de 5 janelas (~5s), scores crus continuam no CSV:

- **MUTAR**: smMusic ≥ 0,15 E smMusic > smFala × 2 — por 4 janelas (~4s)
- **DESMUTAR**: smFala ≥ 0,30 E smFala > smMusic — por 8 janelas (~8s)

Resultado na simulação (regra "E"): **3 eventos, zero falso-mute nos 38 min de
sermão, zero oscilação**: UNMUTE 10:20:36 · MUTE 10:59:54 (54s após a música
entrar) · UNMUTE 11:09:20. Regras sem suavização ou com desmute rápido oscilavam
6–15× no trecho 11:02–11:04 (fala entre versos do louvor: oração/líder, smFala
picos 0,39–0,42).

Variante testada e descartada: "via rápida" de desmute (smFala ≥ 0,45 por 3
janelas) ganhava 99s no desmute final mas devolvia 1 oscilação. Perda de palavras
no religar (~8s) é o preço até a Fase 3 (buffer no bridge).

## Pendências que continuam

1. **Ativar o deploy do sessao.log + proteção dos logs** (comando pronto, ver
   conversa de 19/08) — sem isso, as trocas de voz de domingo 30/08 ficarão sem
   diagnóstico DE NOVO.
2. Voz "afeminada" nas renovações: o blip persiste mesmo com NO_RESUME=1 (sessões
   novas limpas do make-before-break também abrem com voz errada às vezes).
   Diagnóstico exige o sessao.log do item 1.
3. Ensaiar a regra nova antes do culto (tocar louvor + falar perto do mic da lapela).
