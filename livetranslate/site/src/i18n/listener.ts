/**
 * Textos da tela do OUVINTE nos idiomas do catálogo.
 * Assim que a pessoa toca no idioma dela, a tela inteira passa a falar esse idioma —
 * quem escolheu "Español" não pode continuar lendo "Want today's message by email?".
 * (O dicionário geral do site só tem EN/ES/PT, que é o público do painel; aqui o
 * público é a congregação inteira.)
 */
export type ListenerStrings = {
  label: string; headphones: string; connecting: string; reconnecting: string; listening: string;
  pause: string; resume: string; change: string; tapSound: string;
  mailTitle: string; mailHint: string; mailPlaceholder: string; mailCta: string; mailDone: string;
  lyricsLive: string;
};

export const RTL_LANGS = ['ar'];

const L: Record<string, ListenerStrings> = {
  'en': {
    label: 'Live translation', headphones: 'Please use headphones', connecting: 'Connecting…', reconnecting: 'Reconnecting…',
    listening: 'Listening', pause: 'Pause', resume: 'Play', change: 'Change language', tapSound: 'TAP TO TURN THE SOUND BACK ON',
    mailTitle: 'Want today’s message by email?', mailHint: 'We send the sermon in your language after the service. No account needed.',
    mailPlaceholder: 'your@email.com', mailCta: 'Send it', mailDone: 'Done — it arrives after the service.',
    lyricsLive: 'Lyrics heard live — may not be exact',
  },
  'es': {
    label: 'Traducción en vivo', headphones: 'Usa auriculares, por favor', connecting: 'Conectando…', reconnecting: 'Reconectando…',
    listening: 'Escuchando', pause: 'Pausar', resume: 'Reproducir', change: 'Cambiar idioma', tapSound: 'TOCA PARA VOLVER EL SONIDO',
    mailTitle: '¿Quieres el mensaje de hoy por correo?', mailHint: 'Enviamos el sermón en tu idioma después del culto. Sin crear cuenta.',
    mailPlaceholder: 'tu@correo.com', mailCta: 'Enviar', mailDone: 'Listo — llega después del culto.',
    lyricsLive: 'Letra captada en vivo — puede no ser exacta',
  },
  'pt-BR': {
    label: 'Tradução ao vivo', headphones: 'Use fones de ouvido', connecting: 'Conectando…', reconnecting: 'Reconectando…',
    listening: 'Ouvindo', pause: 'Pausar', resume: 'Tocar', change: 'Trocar idioma', tapSound: 'TOQUE PARA VOLTAR O SOM',
    mailTitle: 'Quer a mensagem de hoje por e-mail?', mailHint: 'Enviamos a pregação no seu idioma depois do culto. Sem criar conta.',
    mailPlaceholder: 'seu@email.com', mailCta: 'Enviar', mailDone: 'Pronto — chega depois do culto.',
    lyricsLive: 'Letra captada ao vivo — pode não ser exata',
  },
  'fr': {
    label: 'Traduction en direct', headphones: 'Utilisez des écouteurs', connecting: 'Connexion…', reconnecting: 'Reconnexion…',
    listening: 'À l’écoute', pause: 'Pause', resume: 'Lecture', change: 'Changer de langue', tapSound: 'TOUCHEZ POUR RÉACTIVER LE SON',
    mailTitle: 'Recevoir le message d’aujourd’hui par e-mail ?', mailHint: 'Nous envoyons la prédication dans votre langue après le culte. Sans compte.',
    mailPlaceholder: 'votre@email.com', mailCta: 'Envoyer', mailDone: 'C’est fait — vous le recevrez après le culte.',
    lyricsLive: 'Paroles captées en direct — peuvent être inexactes',
  },
  'de': {
    label: 'Live-Übersetzung', headphones: 'Bitte Kopfhörer verwenden', connecting: 'Verbinden…', reconnecting: 'Neu verbinden…',
    listening: 'Hört zu', pause: 'Pause', resume: 'Abspielen', change: 'Sprache wechseln', tapSound: 'TIPPEN, UM DEN TON WIEDER EINZUSCHALTEN',
    mailTitle: 'Die Predigt von heute per E-Mail?', mailHint: 'Wir senden die Predigt nach dem Gottesdienst in Ihrer Sprache. Ohne Konto.',
    mailPlaceholder: 'ihre@email.com', mailCta: 'Senden', mailDone: 'Erledigt — sie kommt nach dem Gottesdienst.',
    lyricsLive: 'Live mitgehörter Liedtext — kann ungenau sein',
  },
  'it': {
    label: 'Traduzione dal vivo', headphones: 'Usa le cuffie', connecting: 'Connessione…', reconnecting: 'Riconnessione…',
    listening: 'In ascolto', pause: 'Pausa', resume: 'Riprendi', change: 'Cambia lingua', tapSound: 'TOCCA PER RIATTIVARE L’AUDIO',
    mailTitle: 'Vuoi il messaggio di oggi via email?', mailHint: 'Inviamo la predicazione nella tua lingua dopo il culto. Senza registrazione.',
    mailPlaceholder: 'tua@email.com', mailCta: 'Invia', mailDone: 'Fatto — arriva dopo il culto.',
    lyricsLive: 'Testo colto dal vivo — può non essere esatto',
  },
  'zh-Hans': {
    label: '实时翻译', headphones: '请使用耳机', connecting: '连接中…', reconnecting: '重新连接…',
    listening: '正在收听', pause: '暂停', resume: '播放', change: '更换语言', tapSound: '点击恢复声音',
    mailTitle: '需要今天的讲道发到邮箱吗？', mailHint: '聚会结束后，我们会用您的语言发送讲道。无需注册。',
    mailPlaceholder: 'your@email.com', mailCta: '发送', mailDone: '已登记 — 聚会后就会寄出。',
    lyricsLive: '现场听写的歌词 — 可能不准确',
  },
  'ko': {
    label: '실시간 통역', headphones: '이어폰을 사용해 주세요', connecting: '연결 중…', reconnecting: '다시 연결 중…',
    listening: '듣는 중', pause: '일시정지', resume: '재생', change: '언어 변경', tapSound: '소리를 다시 켜려면 누르세요',
    mailTitle: '오늘 말씀을 이메일로 받으시겠어요?', mailHint: '예배 후 설교를 여러분의 언어로 보내드립니다. 가입은 필요 없습니다.',
    mailPlaceholder: 'your@email.com', mailCta: '보내기', mailDone: '완료 — 예배 후에 도착합니다.',
    lyricsLive: '실시간으로 받아쓴 가사 — 정확하지 않을 수 있습니다',
  },
  'ja': {
    label: 'ライブ翻訳', headphones: 'イヤホンをご使用ください', connecting: '接続中…', reconnecting: '再接続中…',
    listening: '受信中', pause: '一時停止', resume: '再生', change: '言語を変更', tapSound: 'タップして音声を戻す',
    mailTitle: '今日のメッセージをメールで受け取りますか？', mailHint: '礼拝の後、あなたの言語で説教をお送りします。登録は不要です。',
    mailPlaceholder: 'your@email.com', mailCta: '送信', mailDone: '完了 — 礼拝の後に届きます。',
    lyricsLive: 'その場で聞き取った歌詞 — 正確でない場合があります',
  },
  'ht': {
    label: 'Tradiksyon an dirèk', headphones: 'Tanpri sèvi ak ekoutè', connecting: 'K ap konekte…', reconnecting: 'K ap rekonekte…',
    listening: 'N ap koute', pause: 'Kanpe', resume: 'Jwe', change: 'Chanje lang', tapSound: 'TOUCHE POU SON AN TOUNEN',
    mailTitle: 'Ou vle mesaj jodi a nan imel?', mailHint: 'N ap voye predikasyon an nan lang ou apre sèvis la. Ou pa bezwen kont.',
    mailPlaceholder: 'imel@ou.com', mailCta: 'Voye', mailDone: 'Fini — l ap rive apre sèvis la.',
    lyricsLive: 'Pawòl chante a pran an dirèk — li ka pa egzak',
  },
  'ru': {
    label: 'Живой перевод', headphones: 'Пожалуйста, наденьте наушники', connecting: 'Подключение…', reconnecting: 'Переподключение…',
    listening: 'Слушаем', pause: 'Пауза', resume: 'Воспроизвести', change: 'Сменить язык', tapSound: 'НАЖМИТЕ, ЧТОБЫ ВЕРНУТЬ ЗВУК',
    mailTitle: 'Прислать сегодняшнюю проповедь на почту?', mailHint: 'После служения отправим проповедь на вашем языке. Регистрация не нужна.',
    mailPlaceholder: 'ваш@email.com', mailCta: 'Отправить', mailDone: 'Готово — придёт после служения.',
    lyricsLive: 'Текст записан на слух — возможны неточности',
  },
  'uk': {
    label: 'Живий переклад', headphones: 'Будь ласка, скористайтеся навушниками', connecting: 'З’єднання…', reconnecting: 'Перепідключення…',
    listening: 'Слухаємо', pause: 'Пауза', resume: 'Відтворити', change: 'Змінити мову', tapSound: 'НАТИСНІТЬ, ЩОБ ПОВЕРНУТИ ЗВУК',
    mailTitle: 'Надіслати сьогоднішню проповідь на пошту?', mailHint: 'Після служіння надішлемо проповідь вашою мовою. Без реєстрації.',
    mailPlaceholder: 'ваш@email.com', mailCta: 'Надіслати', mailDone: 'Готово — надійде після служіння.',
    lyricsLive: 'Текст записано на слух — можливі неточності',
  },
  'ar': {
    label: 'ترجمة مباشرة', headphones: 'يرجى استخدام سماعات الأذن', connecting: 'جارٍ الاتصال…', reconnecting: 'إعادة الاتصال…',
    listening: 'يتم الاستماع', pause: 'إيقاف مؤقت', resume: 'تشغيل', change: 'تغيير اللغة', tapSound: 'اضغط لإعادة الصوت',
    mailTitle: 'هل تريد عظة اليوم على بريدك؟', mailHint: 'نرسل العظة بلغتك بعد الخدمة. لا حاجة إلى حساب.',
    mailPlaceholder: 'بريدك@example.com', mailCta: 'إرسال', mailDone: 'تم — ستصلك بعد الخدمة.',
    lyricsLive: 'كلمات مسموعة مباشرة — قد لا تكون دقيقة',
  },
  'hi': {
    label: 'लाइव अनुवाद', headphones: 'कृपया ईयरफ़ोन का उपयोग करें', connecting: 'कनेक्ट हो रहा है…', reconnecting: 'फिर से कनेक्ट हो रहा है…',
    listening: 'सुन रहे हैं', pause: 'रोकें', resume: 'चलाएँ', change: 'भाषा बदलें', tapSound: 'आवाज़ वापस लाने के लिए टैप करें',
    mailTitle: 'आज का संदेश ईमेल पर चाहिए?', mailHint: 'सेवा के बाद हम प्रवचन आपकी भाषा में भेजते हैं। खाता बनाने की ज़रूरत नहीं।',
    mailPlaceholder: 'आपका@ईमेल.com', mailCta: 'भेजें', mailDone: 'हो गया — सेवा के बाद पहुँचेगा।',
    lyricsLive: 'लाइव सुने गए बोल — पूरी तरह सही न हों',
  },
  'vi': {
    label: 'Dịch trực tiếp', headphones: 'Vui lòng dùng tai nghe', connecting: 'Đang kết nối…', reconnecting: 'Đang kết nối lại…',
    listening: 'Đang nghe', pause: 'Tạm dừng', resume: 'Phát', change: 'Đổi ngôn ngữ', tapSound: 'CHẠM ĐỂ BẬT LẠI ÂM THANH',
    mailTitle: 'Nhận bài giảng hôm nay qua email?', mailHint: 'Sau buổi lễ, chúng tôi gửi bài giảng bằng ngôn ngữ của bạn. Không cần tài khoản.',
    mailPlaceholder: 'email@cuaban.com', mailCta: 'Gửi', mailDone: 'Xong — sẽ đến sau buổi lễ.',
    lyricsLive: 'Lời hát nghe trực tiếp — có thể không chính xác',
  },
  'tl': {
    label: 'Live na pagsasalin', headphones: 'Gumamit po ng headphones', connecting: 'Kumokonekta…', reconnecting: 'Muling kumokonekta…',
    listening: 'Nakikinig', pause: 'I-pause', resume: 'I-play', change: 'Palitan ang wika', tapSound: 'I-TAP PARA IBALIK ANG TUNOG',
    mailTitle: 'Gusto mo bang matanggap ang mensahe ngayon sa email?', mailHint: 'Ipapadala namin ang pangaral sa iyong wika pagkatapos ng serbisyo. Walang account na kailangan.',
    mailPlaceholder: 'iyong@email.com', mailCta: 'Ipadala', mailDone: 'Tapos na — darating pagkatapos ng serbisyo.',
    lyricsLive: 'Liriko na narinig nang live — maaaring hindi eksakto',
  },
};

/** Textos no idioma que a pessoa escolheu; cai para inglês se não houver. */
export function listenerStrings(code: string | null | undefined): ListenerStrings {
  if (!code) return L['en'];
  return L[code] ?? L[code.split('-')[0]] ?? L['en'];
}
