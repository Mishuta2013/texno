// Vercel serverless function: receive a lead (form/quiz) → send to Telegram.
//
// Env vars (Vercel → Project → Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN   from @BotFather
//   TELEGRAM_CHAT_ID     your chat/channel id (@userinfobot, or getUpdates)
//   TURNSTILE_SECRET     optional; when set, every lead must carry a valid
//                        Cloudflare Turnstile token. Until it is set the site
//                        keeps working with the checks below and nothing else.
//
// Why any of this exists: the endpoint used to accept anything with a phone
// field in it, so a one-line curl loop could fill the owner's Telegram with
// hundreds of fake orders — which is what happened to the previous site. The
// checks are layered because none of them is enough alone: a filter that stops
// a lazy script does not stop a bot written for this form, and a filter that
// stops that one costs a real customer nothing only if it is invisible.
const SITE = 'https://texnoplaza.sumy.ua';

const esc = s => String(s ?? '').replace(/[<&>]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c])).slice(0, 600);

/* The price the visitor was looking at when they asked. It arrives from the
   page, so it is checked rather than trusted. */
const price = v => {
  const n = Number(String(v ?? '').replace(/\s/g, ''));
  return Number.isFinite(n) && n > 0 && n < 1e6
    ? n.toLocaleString('uk-UA').replace(/ /g, ' ') : null;
};
/* A message arriving in the owner's Telegram with a tappable link has to point
   at this shop and nowhere else, whatever the request body says. */
const link = v => {
  const s = String(v ?? '');
  return s.startsWith(SITE + '/') && !/[\s<>"']/.test(s) && s.length < 300 ? s : null;
};

/* Ukrainian numbers only, and a real one: ten digits from a leading zero, or
   twelve from 380. The old rule was "at least seven digits anywhere", which
   "1111111" satisfies. Deliberately not checking the operator code — a wrong
   guess there turns away a customer, and that costs more than a bot getting
   through to the next check. */
function normalPhone(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  let local = null;
  if (/^0\d{9}$/.test(d)) local = d;
  else if (/^380\d{9}$/.test(d)) local = d.slice(2);
  else if (/^80\d{9}$/.test(d)) local = d.slice(1);
  if (!local) return null;
  // No Ukrainian code has a zero in second place, which rules out 0000000000
  // and every other all-same-digit number in one line. Nothing beyond that is
  // checked: guessing at operator codes turns away a customer with an unusual
  // one, and that costs more than a bot reaching the next filter.
  if (local[1] === '0') return null;
  return '+38' + local;
}

/* Same origin only. A browser always sends Origin on a POST, so a request
   without one did not come from a form on this site. This is the cheap filter
   that stops the curl loop; it stops nothing that bothers to send a header. */
function fromSite(req) {
  const o = String(req.headers.origin || '');
  if (o === SITE) return true;
  // Vercel preview deployments, so a test build can still submit
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o);
}

/* One instance's memory. Vercel runs several and recycles them, so this is a
   speed bump rather than a wall: it flattens the common case — one script,
   one address, thousands of requests — and does nothing about a flood spread
   over a botnet. Turnstile is the answer to that one. */
const HITS = new Map();          // ip -> number[] of timestamps
const SENT = new Map();          // phone|product -> timestamp
const WINDOW_MS = 10 * 60 * 1000;
const PER_IP = 5;                // leads per address per window
const PER_INSTANCE = 60;         // and a ceiling for everyone together
let instanceHits = [];

function tooMany(ip) {
  const now = Date.now();
  const keep = t => now - t < WINDOW_MS;
  instanceHits = instanceHits.filter(keep);
  if (instanceHits.length >= PER_INSTANCE) return true;
  const mine = (HITS.get(ip) || []).filter(keep);
  if (mine.length >= PER_IP) { HITS.set(ip, mine); return true; }
  mine.push(now);
  HITS.set(ip, mine);
  instanceHits.push(now);
  if (HITS.size > 5000) {        // never grow without bound
    for (const [k, v] of HITS) if (!v.some(keep)) HITS.delete(k);
  }
  return false;
}

/* The same phone asking about the same thing twice in ten minutes is one
   person pressing the button twice, not two leads. */
function duplicate(key) {
  const now = Date.now();
  for (const [k, t] of SENT) if (now - t > WINDOW_MS) SENT.delete(k);
  if (SENT.has(key)) return true;
  SENT.set(key, now);
  return false;
}

/* Cloudflare's own dashboard calls it "Secret key" and Vercel's UI invites you
   to type the name yourself, so both spellings exist in the wild. Read either:
   the failure mode otherwise is the bad kind — the widget appears on the form,
   the owner believes the site is protected, and the server never checks. */
const turnstileSecret = () =>
  process.env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET || '';

async function turnstileOk(token, ip) {
  const secret = turnstileSecret();
  if (!secret) return true;                       // not configured yet
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const j = await r.json();
    return j.success === true;
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method' }); return; }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  /* Everything below that a bot trips answers 200 and sends nothing. A refusal
     that says "refused" teaches whoever is probing which field to fix; silence
     teaches them nothing, and the visitor who is a person never sees it. */
  const drop = () => res.status(200).json({ ok: true });

  if (b.company) return drop();                                  // honeypot
  if (!fromSite(req)) return drop();
  if (JSON.stringify(b).length > 4000) return drop();            // no essays

  /* Time on the form. The page stamps it when the form opens; a script that
     posts straight to the endpoint has nothing to stamp. Two hours is the
     upper bound so a tab left open overnight is not punished. */
  const ts = Number(b.ts);
  if (Number.isFinite(ts) && ts > 0) {
    const spent = Date.now() - ts;
    if (spent < 2500 || spent > 2 * 60 * 60 * 1000) return drop();
  }

  const phone = normalPhone(b.phone);
  if (!phone) { res.status(400).json({ ok: false, error: 'phone' }); return; }

  if (tooMany(ip)) return drop();
  if (!(await turnstileOk(b.token, ip))) return drop();
  if (duplicate(phone + '|' + String(b.product || ''))) return drop();

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN, CHAT = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT) { res.status(500).json({ ok: false, error: 'not_configured' }); return; }

  const typeMap = { callback: '📞 Зворотний дзвінок', consultation: '💬 Консультація', quiz: '🧩 Підбір (квіз)', order: '🛒 Замовлення', question: '❓ Питання про товар', cheaper: '💰 Знайшли дешевше', '': '📩 Заявка' };
  const lines = [
    `<b>${typeMap[b.type] || typeMap['']}</b> — TexnoPlaza`,
    b.name && `👤 ${esc(b.name)}`,
    `📱 <b>${esc(phone)}</b>`,
    b.product && `📦 Модель: ${esc(b.product)}`,
    b.product && price(b.price) && `💰 Ціна: <b>${price(b.price)} грн</b>`,
    b.product && link(b.url) && `🔗 ${esc(link(b.url))}`,
    b.interest && `Цікавить: ${esc(b.interest)}`,
    b.comment && `📝 ${esc(b.comment)}`,
    b.note && `📝 ${esc(b.note)}`,
    `🕒 ${new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}`,
    /* The page sent a Turnstile answer, so the widget is live in front of
       visitors — but this side has no key to check it against, which means the
       protection is off while looking on. Silence here would be the worst
       outcome, so it says so in the one place the owner definitely reads. */
    b.token && !turnstileSecret()
      && '⚠️ Turnstile не перевіряється: у Vercel немає TURNSTILE_SECRET_KEY'
  ].filter(Boolean);

  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true })
    });
    if (!r.ok) { const e = await r.text(); res.status(502).json({ ok: false, error: 'telegram', detail: e.slice(0, 200) }); return; }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'network' });
  }
}
