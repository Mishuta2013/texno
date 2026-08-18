// Vercel serverless function: receive a lead (form/quiz) → send to Telegram.
// Env vars (set in Vercel → Project → Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN  (from @BotFather)
//   TELEGRAM_CHAT_ID    (your chat/channel id; get from @userinfobot or getUpdates)
const esc = s => String(s ?? '').replace(/[<&>]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c])).slice(0, 600);

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method' }); return; }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  if (b.company) { res.status(200).json({ ok: true }); return; }          // honeypot → silently accept
  const phone = String(b.phone || '').trim();
  if (!phone || phone.replace(/\D/g, '').length < 7) { res.status(400).json({ ok: false, error: 'phone' }); return; }

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN, CHAT = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT) { res.status(500).json({ ok: false, error: 'not_configured' }); return; }

  const typeMap = { callback: '📞 Зворотний дзвінок', consultation: '💬 Консультація', quiz: '🧩 Підбір (квіз)', order: '🛒 Замовлення', question: '❓ Питання про товар', cheaper: '💰 Знайшли дешевше', '': '📩 Заявка' };
  const lines = [
    `<b>${typeMap[b.type] || typeMap['']}</b> — TexnoPlaza`,
    b.name && `👤 ${esc(b.name)}`,
    `📱 <b>${esc(phone)}</b>`,
    b.product && `📦 Модель: ${esc(b.product)}`,
    b.interest && `Цікавить: ${esc(b.interest)}`,
    b.comment && `📝 ${esc(b.comment)}`,
    b.note && `📝 ${esc(b.note)}`,
    `🕒 ${new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}`
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
