import { createContext, useContext } from 'react';

export const LOCALES = ['en', 'fr', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

// All on-screen copy. The product name stays "WaFine" in every locale.
// AR copy is Modern Standard Arabic: native check by Youssef pending.
const en = {
  step: (n: number) => `Step ${n} of 6`,
  brand: {
    tagline: 'Turn your WhatsApp number into an AI teammate.',
    badge: 'Invite-only · Built in Morocco',
    caption: 'A six-step tour of WaFine, from invite to Claude.',
  },
  invite: {
    title: 'Request an invite',
    body: 'WaFine is invite-only. Approved numbers go on the allowlist.',
    caption: 'Join the waitlist with your email and, optionally, the number you plan to use.',
    cardTitle: 'Join the waitlist',
    cardSub: 'We review every request by hand.',
    email: 'Email',
    phone: 'WhatsApp number (optional)',
    button: 'Request an invite',
    done: 'You are on the list. We will email you.',
  },
  qr: {
    title: 'Link your number with a QR',
    body: 'Sign up with your invited number, then link it from WaFine like any linked device.',
    caption: 'Scan the QR in WaFine with WhatsApp › Linked devices',
    panel: 'Link WhatsApp',
    hint: 'On your phone: WhatsApp › Linked devices › Link a device.',
    linked: 'Linked',
    waiting: 'Waiting for scan…',
    connected: 'Connected. It stays linked.',
    phoneTitle: 'Linked devices',
    phoneSub: 'Scan the QR code',
  },
  key: {
    title: 'Create an API key',
    body: 'The same page lists your session ID, REST base URL and MCP endpoint.',
    caption: 'The key is shown once. Store it in a password manager.',
    cardTitle: 'API keys',
    cardSub: 'Keys reach your session through REST and MCP.',
    create: 'Create key',
    once: 'Shown once. Copy it now.',
    copy: 'Copy',
    copied: 'Copied',
    session: 'Session ID',
    rest: 'REST base URL',
    mcp: 'MCP endpoint',
  },
  curl: {
    title: 'Send your first message',
    caption: 'One POST with your key. Start by messaging yourself.',
    message: 'Hello from WaFine',
  },
  replies: {
    title: 'Paced auto-replies',
    body: 'Workflows answer for you, with a configurable gap and a per-day cap.',
    caption: 'Replies wait their turn, so your number never sounds like a bot.',
    badge: 'auto-reply · paced',
    paced: 'paced',
    thread: [
      'Hi! Do you have a free slot tomorrow morning?',
      'Yes, 10:00 and 11:30 are open. Which suits you?',
      '10:00 is perfect, thanks!',
      'Booked for tomorrow at 10:00. See you then.',
    ],
  },
  mcp: {
    title: 'Connect Claude via MCP',
    body: 'Paste one URL. Leave the OAuth fields empty and sign in when asked.',
    caption: 'In Claude: Settings → Connectors → Add custom connector.',
    crumb: 'Settings → Connectors',
    cardTitle: 'Add custom connector',
    name: 'Name',
    url: 'Remote MCP server URL',
    add: 'Add',
    connected: 'Connected',
    prompt: '“Summarise today’s chats and draft replies.”',
  },
  outro: {
    line: 'WaFine · invite-only · docs',
    join: 'Join the waitlist',
    docs: 'Read the docs',
  },
};

export type Strings = typeof en;

const fr: Strings = {
  step: (n) => `Étape ${n} sur 6`,
  brand: {
    tagline: 'Faites de votre numéro WhatsApp un coéquipier IA.',
    badge: 'Sur invitation · Conçu au Maroc',
    caption: 'WaFine en six étapes, de l’invitation à Claude.',
  },
  invite: {
    title: 'Demandez une invitation',
    body: 'WaFine fonctionne sur invitation. Les numéros validés rejoignent la liste autorisée.',
    caption: 'Inscrivez-vous avec votre e-mail et, si vous voulez, le numéro que vous comptez utiliser.',
    cardTitle: 'Rejoindre la liste',
    cardSub: 'Chaque demande est relue à la main.',
    email: 'E-mail',
    phone: 'Numéro WhatsApp (facultatif)',
    button: 'Demander une invitation',
    done: 'C’est noté. Nous vous écrirons.',
  },
  qr: {
    title: 'Liez votre numéro avec un QR',
    body: 'Inscrivez-vous avec le numéro invité, puis liez-le depuis WaFine comme un appareil.',
    caption: 'Scannez le QR affiché dans WaFine avec WhatsApp › Appareils connectés',
    panel: 'Lier WhatsApp',
    hint: 'Sur votre téléphone : WhatsApp › Appareils connectés › Connecter un appareil.',
    linked: 'Lié',
    waiting: 'En attente du scan…',
    connected: 'Connecté. Le lien reste actif.',
    phoneTitle: 'Appareils connectés',
    phoneSub: 'Scannez le code QR',
  },
  key: {
    title: 'Créez une clé API',
    body: 'La même page affiche l’ID de session, l’URL REST et l’adresse MCP.',
    caption: 'La clé ne s’affiche qu’une fois. Gardez-la dans un gestionnaire de mots de passe.',
    cardTitle: 'Clés API',
    cardSub: 'Les clés donnent accès à votre session via REST et MCP.',
    create: 'Créer une clé',
    once: 'Affichée une seule fois. Copiez-la.',
    copy: 'Copier',
    copied: 'Copié',
    session: 'ID de session',
    rest: 'URL REST',
    mcp: 'Adresse MCP',
  },
  curl: {
    title: 'Envoyez un premier message',
    caption: 'Un seul POST avec votre clé. Commencez par vous écrire.',
    message: 'Bonjour de WaFine',
  },
  replies: {
    title: 'Réponses automatiques posées',
    body: 'Les workflows répondent pour vous, avec un délai réglable et un plafond par jour.',
    caption: 'Chaque réponse attend son tour : votre numéro ne sonne jamais robot.',
    badge: 'réponse auto · posée',
    paced: 'posé',
    thread: [
      'Bonjour ! Vous avez un créneau demain matin ?',
      'Oui, 10 h et 11 h 30 sont libres. Lequel vous va ?',
      '10 h, parfait, merci !',
      'C’est réservé pour demain à 10 h. À demain.',
    ],
  },
  mcp: {
    title: 'Connectez Claude via MCP',
    body: 'Collez une URL. Laissez les champs OAuth vides, puis connectez-vous.',
    caption: 'Dans Claude : Paramètres → Connecteurs → Ajouter un connecteur.',
    crumb: 'Paramètres → Connecteurs',
    cardTitle: 'Ajouter un connecteur',
    name: 'Nom',
    url: 'URL du serveur MCP distant',
    add: 'Ajouter',
    connected: 'Connecté',
    prompt: '« Résume les discussions du jour et prépare les réponses. »',
  },
  outro: {
    line: 'WaFine · sur invitation · docs',
    join: 'Rejoindre la liste',
    docs: 'Lire la doc',
  },
};

const ar: Strings = {
  step: (n) => `الخطوة ${n} من 6`,
  brand: {
    tagline: 'حوِّل رقم واتساب إلى زميل ذكي يعمل معك.',
    badge: 'بالدعوة فقط · صُنع في المغرب',
    caption: 'جولة في WaFine من ست خطوات، من الدعوة إلى Claude.',
  },
  invite: {
    title: 'اطلب دعوة',
    body: 'التسجيل في WaFine بالدعوة فقط، وتُضاف الأرقام المقبولة إلى القائمة المسموح بها.',
    caption: 'سجِّل في قائمة الانتظار ببريدك الإلكتروني، ويمكنك إضافة الرقم الذي ستستخدمه.',
    cardTitle: 'قائمة الانتظار',
    cardSub: 'نراجع كل طلب يدويًا.',
    email: 'البريد الإلكتروني',
    phone: 'رقم واتساب (اختياري)',
    button: 'اطلب دعوة',
    done: 'أنت في القائمة، وسنراسلك قريبًا.',
  },
  qr: {
    title: 'اربط رقمك برمز QR',
    body: 'سجِّل بالرقم المدعو، ثم اربطه من WaFine كأي جهاز مرتبط.',
    caption: 'امسح رمز QR الظاهر في WaFine من واتساب › الأجهزة المرتبطة',
    panel: 'ربط واتساب',
    hint: 'على هاتفك: واتساب › الأجهزة المرتبطة › ربط جهاز.',
    linked: 'تم الربط',
    waiting: 'في انتظار المسح…',
    connected: 'متصل، ويبقى الربط قائمًا.',
    phoneTitle: 'الأجهزة المرتبطة',
    phoneSub: 'امسح رمز QR',
  },
  key: {
    title: 'أنشئ مفتاح API',
    body: 'تعرض الصفحة نفسها معرّف الجلسة وعنوان REST ونقطة MCP.',
    caption: 'يظهر المفتاح مرة واحدة فقط، فاحفظه في مدير كلمات المرور.',
    cardTitle: 'مفاتيح API',
    cardSub: 'تصل المفاتيح إلى جلستك عبر REST وMCP.',
    create: 'إنشاء مفتاح',
    once: 'يظهر مرة واحدة. انسخه الآن.',
    copy: 'نسخ',
    copied: 'تم النسخ',
    session: 'معرّف الجلسة',
    rest: 'عنوان REST',
    mcp: 'نقطة MCP',
  },
  curl: {
    title: 'أرسل رسالتك الأولى',
    caption: 'طلب POST واحد بمفتاحك. ابدأ بمراسلة نفسك.',
    message: 'مرحبًا من WaFine',
  },
  replies: {
    title: 'ردود تلقائية متمهّلة',
    body: 'تردّ سير العمل نيابةً عنك، بفاصل زمني قابل للضبط وحدّ يومي.',
    caption: 'ينتظر كل ردّ دوره، فلا يبدو رقمك آليًا أبدًا.',
    badge: 'ردّ تلقائي · متمهّل',
    paced: 'متمهّل',
    thread: [
      'مرحبًا! هل لديكم موعد متاح صباح الغد؟',
      'نعم، الساعة 10:00 و11:30 متاحتان. أيهما يناسبك؟',
      'الساعة 10:00 مناسبة، شكرًا!',
      'تم الحجز غدًا الساعة 10:00. إلى اللقاء.',
    ],
  },
  mcp: {
    title: 'اربط Claude عبر MCP',
    body: 'الصق رابطًا واحدًا، واترك حقول OAuth فارغة، ثم سجّل الدخول عند الطلب.',
    caption: 'في Claude: الإعدادات › الموصلات › إضافة موصل مخصص.',
    crumb: 'الإعدادات › الموصلات',
    cardTitle: 'إضافة موصل مخصص',
    name: 'الاسم',
    url: 'رابط خادم MCP البعيد',
    add: 'إضافة',
    connected: 'متصل',
    prompt: '«لخّص محادثات اليوم واكتب مسودات الردود.»',
  },
  outro: {
    line: 'WaFine · بالدعوة فقط · التوثيق',
    join: 'انضم إلى قائمة الانتظار',
    docs: 'اقرأ التوثيق',
  },
};

export const STRINGS: Record<Locale, Strings> = { en, fr, ar };

export const LocaleContext = createContext<Locale>('en');

export function useLocale() {
  const locale = useContext(LocaleContext);
  return { locale, t: STRINGS[locale], rtl: locale === 'ar' };
}
