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
    mailTitle: 'Get each sermon by email?', mailHint: 'After every service we send the sermon in your language. No account needed — unsubscribe anytime.',
    mailPlaceholder: 'your@email.com', mailCta: 'Send it', mailDone: 'Done — the sermon arrives after each service.',
    lyricsLive: 'Lyrics heard live — may not be exact',
  },
  'es': {
    label: 'Traducción en vivo', headphones: 'Usa auriculares, por favor', connecting: 'Conectando…', reconnecting: 'Reconectando…',
    listening: 'Escuchando', pause: 'Pausar', resume: 'Reproducir', change: 'Cambiar idioma', tapSound: 'TOCA PARA VOLVER EL SONIDO',
    mailTitle: '¿Quieres recibir cada sermón por correo?', mailHint: 'Después de cada culto enviamos el sermón en tu idioma. Sin crear cuenta — puedes darte de baja cuando quieras.',
    mailPlaceholder: 'tu@correo.com', mailCta: 'Enviar', mailDone: 'Listo — el sermón llega después de cada culto.',
    lyricsLive: 'Letra captada en vivo — puede no ser exacta',
  },
  'pt-BR': {
    label: 'Tradução ao vivo', headphones: 'Use fones de ouvido', connecting: 'Conectando…', reconnecting: 'Reconectando…',
    listening: 'Ouvindo', pause: 'Pausar', resume: 'Tocar', change: 'Trocar idioma', tapSound: 'TOQUE PARA VOLTAR O SOM',
    mailTitle: 'Quer receber cada pregação por e-mail?', mailHint: 'Depois de cada culto enviamos a pregação no seu idioma. Sem criar conta — dá para cancelar quando quiser.',
    mailPlaceholder: 'seu@email.com', mailCta: 'Enviar', mailDone: 'Pronto — a pregação chega depois de cada culto.',
    lyricsLive: 'Letra captada ao vivo — pode não ser exata',
  },
  'fr': {
    label: 'Traduction en direct', headphones: 'Utilisez des écouteurs', connecting: 'Connexion…', reconnecting: 'Reconnexion…',
    listening: 'À l’écoute', pause: 'Pause', resume: 'Lecture', change: 'Changer de langue', tapSound: 'TOUCHEZ POUR RÉACTIVER LE SON',
    mailTitle: 'Recevoir chaque prédication par e-mail ?', mailHint: 'Après chaque culte, nous envoyons la prédication dans votre langue. Sans compte — désinscription à tout moment.',
    mailPlaceholder: 'votre@email.com', mailCta: 'Envoyer', mailDone: 'C’est fait — la prédication arrive après chaque culte.',
    lyricsLive: 'Paroles captées en direct — peuvent être inexactes',
  },
  'de': {
    label: 'Live-Übersetzung', headphones: 'Bitte Kopfhörer verwenden', connecting: 'Verbinden…', reconnecting: 'Neu verbinden…',
    listening: 'Hört zu', pause: 'Pause', resume: 'Abspielen', change: 'Sprache wechseln', tapSound: 'TIPPEN, UM DEN TON WIEDER EINZUSCHALTEN',
    mailTitle: 'Jede Predigt per E-Mail erhalten?', mailHint: 'Nach jedem Gottesdienst senden wir die Predigt in Ihrer Sprache. Ohne Konto — jederzeit abbestellbar.',
    mailPlaceholder: 'ihre@email.com', mailCta: 'Senden', mailDone: 'Erledigt — die Predigt kommt nach jedem Gottesdienst.',
    lyricsLive: 'Live mitgehörter Liedtext — kann ungenau sein',
  },
  'it': {
    label: 'Traduzione dal vivo', headphones: 'Usa le cuffie', connecting: 'Connessione…', reconnecting: 'Riconnessione…',
    listening: 'In ascolto', pause: 'Pausa', resume: 'Riprendi', change: 'Cambia lingua', tapSound: 'TOCCA PER RIATTIVARE L’AUDIO',
    mailTitle: 'Vuoi ricevere ogni predicazione via email?', mailHint: 'Dopo ogni culto inviamo la predicazione nella tua lingua. Senza registrazione — puoi annullare quando vuoi.',
    mailPlaceholder: 'tua@email.com', mailCta: 'Invia', mailDone: 'Fatto — la predicazione arriva dopo ogni culto.',
    lyricsLive: 'Testo colto dal vivo — può non essere esatto',
  },
  'zh-Hans': {
    label: '实时翻译', headphones: '请使用耳机', connecting: '连接中…', reconnecting: '重新连接…',
    listening: '正在收听', pause: '暂停', resume: '播放', change: '更换语言', tapSound: '点击恢复声音',
    mailTitle: '想通过邮件收到每次的讲道吗？', mailHint: '每次聚会结束后，我们会用您的语言发送讲道。无需注册，可随时取消订阅。',
    mailPlaceholder: 'your@email.com', mailCta: '发送', mailDone: '已登记 — 每次聚会后都会寄出。',
    lyricsLive: '现场听写的歌词 — 可能不准确',
  },
  'ko': {
    label: '실시간 통역', headphones: '이어폰을 사용해 주세요', connecting: '연결 중…', reconnecting: '다시 연결 중…',
    listening: '듣는 중', pause: '일시정지', resume: '재생', change: '언어 변경', tapSound: '소리를 다시 켜려면 누르세요',
    mailTitle: '매주 설교를 이메일로 받으시겠어요?', mailHint: '예배가 끝날 때마다 설교를 여러분의 언어로 보내드립니다. 가입은 필요 없고, 언제든 수신을 거부할 수 있습니다.',
    mailPlaceholder: 'your@email.com', mailCta: '보내기', mailDone: '완료 — 매 예배 후에 도착합니다.',
    lyricsLive: '실시간으로 받아쓴 가사 — 정확하지 않을 수 있습니다',
  },
  'ja': {
    label: 'ライブ翻訳', headphones: 'イヤホンをご使用ください', connecting: '接続中…', reconnecting: '再接続中…',
    listening: '受信中', pause: '一時停止', resume: '再生', change: '言語を変更', tapSound: 'タップして音声を戻す',
    mailTitle: '毎回の説教をメールで受け取りますか？', mailHint: '礼拝のたびに、あなたの言語で説教をお送りします。登録不要、いつでも配信停止できます。',
    mailPlaceholder: 'your@email.com', mailCta: '送信', mailDone: '完了 — 毎回の礼拝の後に届きます。',
    lyricsLive: 'その場で聞き取った歌詞 — 正確でない場合があります',
  },
  // Kreyòl: traducao pronta, mas o Gemini Live Translate NAO suporta `ht`.
  // Fica guardada aqui para o dia em que houver um caminho que suporte.
  'ht': {
    label: 'Tradiksyon an dirèk', headphones: 'Tanpri sèvi ak ekoutè', connecting: 'K ap konekte…', reconnecting: 'K ap rekonekte…',
    listening: 'N ap koute', pause: 'Kanpe', resume: 'Jwe', change: 'Chanje lang', tapSound: 'TOUCHE POU SON AN TOUNEN',
    mailTitle: 'Ou vle resevwa chak predikasyon nan imel?', mailHint: 'Apre chak sèvis n ap voye predikasyon an nan lang ou. Ou pa bezwen kont — ou ka dezabòne nenpòt ki lè.',
    mailPlaceholder: 'imel@ou.com', mailCta: 'Voye', mailDone: 'Fini — predikasyon an ap rive apre chak sèvis.',
    lyricsLive: 'Pawòl chante a pran an dirèk — li ka pa egzak',
  },
  'ru': {
    label: 'Живой перевод', headphones: 'Пожалуйста, наденьте наушники', connecting: 'Подключение…', reconnecting: 'Переподключение…',
    listening: 'Слушаем', pause: 'Пауза', resume: 'Воспроизвести', change: 'Сменить язык', tapSound: 'НАЖМИТЕ, ЧТОБЫ ВЕРНУТЬ ЗВУК',
    mailTitle: 'Присылать каждую проповедь на почту?', mailHint: 'После каждого служения отправляем проповедь на вашем языке. Без регистрации — отписаться можно в любой момент.',
    mailPlaceholder: 'ваш@email.com', mailCta: 'Отправить', mailDone: 'Готово — проповедь придёт после каждого служения.',
    lyricsLive: 'Текст записан на слух — возможны неточности',
  },
  'uk': {
    label: 'Живий переклад', headphones: 'Будь ласка, скористайтеся навушниками', connecting: 'З’єднання…', reconnecting: 'Перепідключення…',
    listening: 'Слухаємо', pause: 'Пауза', resume: 'Відтворити', change: 'Змінити мову', tapSound: 'НАТИСНІТЬ, ЩОБ ПОВЕРНУТИ ЗВУК',
    mailTitle: 'Надсилати кожну проповідь на пошту?', mailHint: 'Після кожного служіння надсилаємо проповідь вашою мовою. Без реєстрації — відписатися можна будь-коли.',
    mailPlaceholder: 'ваш@email.com', mailCta: 'Надіслати', mailDone: 'Готово — проповідь надійде після кожного служіння.',
    lyricsLive: 'Текст записано на слух — можливі неточності',
  },
  'ar': {
    label: 'ترجمة مباشرة', headphones: 'يرجى استخدام سماعات الأذن', connecting: 'جارٍ الاتصال…', reconnecting: 'إعادة الاتصال…',
    listening: 'يتم الاستماع', pause: 'إيقاف مؤقت', resume: 'تشغيل', change: 'تغيير اللغة', tapSound: 'اضغط لإعادة الصوت',
    mailTitle: 'هل تريد أن تصلك كل عظة على بريدك؟', mailHint: 'بعد كل خدمة نرسل العظة بلغتك. لا حاجة إلى حساب، ويمكنك إلغاء الاشتراك في أي وقت.',
    mailPlaceholder: 'بريدك@example.com', mailCta: 'إرسال', mailDone: 'تم — ستصلك العظة بعد كل خدمة.',
    lyricsLive: 'كلمات مسموعة مباشرة — قد لا تكون دقيقة',
  },
  'hi': {
    label: 'लाइव अनुवाद', headphones: 'कृपया ईयरफ़ोन का उपयोग करें', connecting: 'कनेक्ट हो रहा है…', reconnecting: 'फिर से कनेक्ट हो रहा है…',
    listening: 'सुन रहे हैं', pause: 'रोकें', resume: 'चलाएँ', change: 'भाषा बदलें', tapSound: 'आवाज़ वापस लाने के लिए टैप करें',
    mailTitle: 'क्या आप हर प्रवचन ईमेल पर पाना चाहते हैं?', mailHint: 'हर आराधना के बाद हम प्रवचन आपकी भाषा में भेजते हैं। खाता बनाने की ज़रूरत नहीं — कभी भी सदस्यता रद्द कर सकते हैं।',
    mailPlaceholder: 'आपका@ईमेल.com', mailCta: 'भेजें', mailDone: 'हो गया — हर आराधना के बाद पहुँचेगा।',
    lyricsLive: 'लाइव सुने गए बोल — पूरी तरह सही न हों',
  },
  'vi': {
    label: 'Dịch trực tiếp', headphones: 'Vui lòng dùng tai nghe', connecting: 'Đang kết nối…', reconnecting: 'Đang kết nối lại…',
    listening: 'Đang nghe', pause: 'Tạm dừng', resume: 'Phát', change: 'Đổi ngôn ngữ', tapSound: 'CHẠM ĐỂ BẬT LẠI ÂM THANH',
    mailTitle: 'Nhận mỗi bài giảng qua email?', mailHint: 'Sau mỗi buổi lễ, chúng tôi gửi bài giảng bằng ngôn ngữ của bạn. Không cần tài khoản — có thể hủy bất cứ lúc nào.',
    mailPlaceholder: 'email@cuaban.com', mailCta: 'Gửi', mailDone: 'Xong — bài giảng sẽ đến sau mỗi buổi lễ.',
    lyricsLive: 'Lời hát nghe trực tiếp — có thể không chính xác',
  },
  'nl': {
    label: 'Live vertaling', headphones: 'Gebruik een koptelefoon', connecting: 'Verbinden…', reconnecting: 'Opnieuw verbinden…',
    listening: 'Luisteren', pause: 'Pauzeren', resume: 'Afspelen', change: 'Taal wijzigen', tapSound: 'TIK OM HET GELUID TERUG TE ZETTEN',
    mailTitle: 'Wilt u elke preek per e-mail ontvangen?', mailHint: 'Na elke dienst sturen we de preek in uw taal. Geen account nodig — u kunt zich altijd afmelden.',
    mailPlaceholder: 'uw@email.com', mailCta: 'Versturen', mailDone: 'Klaar — de preek komt na elke dienst.',
    lyricsLive: 'Songtekst live meegeluisterd — kan onnauwkeurig zijn',
  },
  'fil': {
    label: 'Live na pagsasalin', headphones: 'Gumamit po ng headphones', connecting: 'Kumokonekta…', reconnecting: 'Muling kumokonekta…',
    listening: 'Nakikinig', pause: 'I-pause', resume: 'I-play', change: 'Palitan ang wika', tapSound: 'I-TAP PARA IBALIK ANG TUNOG',
    mailTitle: 'Gusto mo bang matanggap ang bawat pangaral sa email?', mailHint: 'Pagkatapos ng bawat serbisyo, ipapadala namin ang pangaral sa iyong wika. Walang account na kailangan — puwedeng mag-unsubscribe anumang oras.',
    mailPlaceholder: 'iyong@email.com', mailCta: 'Ipadala', mailDone: 'Tapos na — darating ang pangaral pagkatapos ng bawat serbisyo.',
    lyricsLive: 'Liriko na narinig nang live — maaaring hindi eksakto',
  },
};

/** Textos no idioma que a pessoa escolheu; cai para inglês se não houver. */
export function listenerStrings(code: string | null | undefined): ListenerStrings {
  if (!code) return L['en'];
  return L[code] ?? L[code.split('-')[0]] ?? L['en'];
}
