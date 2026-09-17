// Vercel serverless function: the shop's own Google reviews, live from Google.
//
// Env var (Vercel → Project → Settings → Environment Variables):
//   GOOGLE_PLACES_KEY    Google Cloud API key with only "Places API (New)"
//                        enabled. Until it is set this answers 503 and the page
//                        keeps the reviews it was built with.
//
// Why an API and not a copy: review texts belong to the people who wrote them,
// and Google's terms allow showing them on another site only through its own
// Places API, with the author and Google credited — not pasted into our HTML.
// For the same reason nothing is cached here: Places content may not be stored.
// Each page view that scrolls to the reviews costs one request, so the owner
// caps the daily quota in Google Cloud; past the cap Google answers 429 and the
// page quietly keeps its built-in reviews.

// Same place as data/site.json "placeId" — build.mjs refuses to build if they differ.
const PLACE_ID = 'ChIJL7q2Yr4BKUERH6aa01VlFQo';
const LANGS = { uk: 'uk', ru: 'ru', en: 'en' };

/* Only what the cards show, so nothing else of Google's reaches the page.
   An author link is kept only if it points at Google: it is printed into an
   href, and a response is data, not something to trust with a URL. */
const googleUrl = v => {
  const s = String(v ?? '');
  return /^https:\/\/(www\.)?google\.[a-z.]+\/|^https:\/\/maps\.google\.[a-z.]+\//.test(s) ? s : '';
};
const photoUrl = v => {
  const s = String(v ?? '');
  return /^https:\/\/lh\d\.googleusercontent\.com\//.test(s) ? s : '';
};

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ ok: false }); return; }
  const KEY = process.env.GOOGLE_PLACES_KEY;
  if (!KEY) { res.status(503).json({ ok: false, error: 'not_configured' }); return; }
  const lang = LANGS[String(req.query?.lang || 'uk')] || 'uk';

  let data;
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}?languageCode=${lang}`, {
      headers: {
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,reviews',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) { res.status(r.status === 429 ? 429 : 502).json({ ok: false, error: 'google_' + r.status }); return; }
    data = await r.json();
  } catch {
    res.status(502).json({ ok: false, error: 'google_unreachable' });
    return;
  }

  const reviews = (Array.isArray(data.reviews) ? data.reviews : [])
    .filter(v => v && v.text && String(v.text.text || '').trim())
    .map(v => ({
      author: String(v.authorAttribution?.displayName || '').slice(0, 80),
      authorUrl: googleUrl(v.authorAttribution?.uri),
      photo: photoUrl(v.authorAttribution?.photoUri),
      rating: Math.max(1, Math.min(5, Math.round(Number(v.rating) || 5))),
      when: String(v.relativePublishTimeDescription || '').slice(0, 40),
      text: String(v.text.text).slice(0, 2000),
      translated: !!(v.originalText && v.text.languageCode && v.originalText.languageCode
        && v.originalText.languageCode !== v.text.languageCode),
    }));

  // not stored anywhere on the way: see the note at the top
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    rating: Number(data.rating) || null,
    count: Number(data.userRatingCount) || null,
    url: googleUrl(data.googleMapsUri),
    reviews,
  });
}
