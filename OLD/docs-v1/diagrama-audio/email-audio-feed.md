# Email — Audio feed request (para a equipe de som da igreja)

**Anexar:** `audio-feed-diagram.png`

---

**Subject:** Audio feed from the Qu-6D for the live translation system — 2 simple options

Hi Brat,

As you know, we've been running the live translation system during the services — people scan the QR code and hear the sermon in their own language on their phones. It went really well on Sunday!

Right now the system listens through a lapel microphone, which means it also picks up room echo and background noise. To make the translation faster and more accurate, the best solution is to feed the audio **directly from the sound board** into the laptop that runs the system. I checked your board (the Allen & Heath Qu-6D) and this is very easy to do — I've attached a small diagram showing the two possible ways:

**Option A — one USB-C cable (preferred).**
The Qu-6D has a built-in USB-C audio interface on the rear panel (I marked it on the photo). All it takes is:
1. Connect a USB-C cable from the board to the laptop;
2. On the board: SETUP → Audio → Sync&USB → set USB Mode to **Stereo**;
3. Send the Main L/R mix to USB outputs 1-2.
The board then shows up on the laptop as a normal audio device — no drivers, no extra hardware.

**Option B — spare line output (fallback).**
If the USB-C port is already in use (recording, etc.), we can take any spare stereo output (ALT OUT or a Mix out) into a small USB audio interface, which then connects to the laptop. I can bring the interface.

**Important:** both options are completely **listen-only**. Nothing is sent back to the board, no settings on your mix are touched, and the house sound is not affected in any way.

Could we get 10–15 minutes with you before the next service to plug in and test the levels? Option A is literally one cable and one menu setting — I expect it to be quick.

Thank you so much for your help!

Blessings,
Johnny

---

## Notas técnicas (para o Johnny, não vão no email)

- Qu-6D USB-C: interface de áudio class-compliant USB 2.0, 32×32 canais @48/96kHz.
  Em modo **Stereo** usa só os canais 1-2 e aparece como dispositivo estéreo comum —
  perfeito para nós, sem driver no Windows. (Se um dia precisarmos multitrack no
  Windows: driver ASIO/WDM oficial da Allen & Heath.)
- O nome do dispositivo no Windows deve conter "Qu-6" ou "Allen" → a pré-seleção
  automática do broadcast (v1 e POC3) já reconhece (regex qu-6|allen desde o v1).
- No dia do teste: conferir ganho (medidor verde da página broadcast, sem estourar)
  e rodar 2 min de louvor + 2 min de fala olhando os scores do detector POC3.
- Fontes: https://support.allen-heath.com/hc/en-gb/articles/48350897327889 (Qu-5/6/7
  Qu-Drive and USB audio) e datasheet Qu-6/Qu-6D.
