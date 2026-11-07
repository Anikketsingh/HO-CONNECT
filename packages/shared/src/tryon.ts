/*
 * Partner links to the AI try-on app (aitryon.hairoriginals.com).
 *
 * The try-on app saves the UTM tags of the link a visitor arrives on (a first-touch cookie) and sends them
 * to the DigiCuro CRM with the lead (utm_source / utm_medium / utm_campaign, plus everything in
 * metadata.marketing). So a customer who scans a salon's try-on QR shows up in the CRM tagged with
 * that salon's partner code.
 *
 * The format is a contract. The try-on app treats utm_source=ho_connect as a partner referral (it
 * beats an older ad or organic visit), CRM reports filter on it, and printed posters can't be
 * changed. Don't change it lightly.
 */

export const DEFAULT_TRYON_URL = 'https://aitryon.hairoriginals.com';

/** utm_source on every partner try-on link: "this came through HO Connect". */
export const TRYON_UTM_SOURCE = 'ho_connect';

export type ShareChannel = 'qr' | 'link';

/** "Glamour Salon & Spa, Andheri" → "glamour-salon-spa-andheri". Empty when nothing Latin is left (e.g. a Hindi-only name). */
export function slugify(text: string, max = 40): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

/**
 * Adds UTM tags to a URL. Any utm_* already on it are replaced; other query params and a #hash are kept.
 * No URL class: this package also runs in React Native, whose URL can't edit query strings.
 */
export function withUtm(baseUrl: string, tags: ReadonlyArray<readonly [string, string | null | undefined]>): string {
  const hashAt = baseUrl.indexOf('#');
  const hash = hashAt === -1 ? '' : baseUrl.slice(hashAt);
  const noHash = hashAt === -1 ? baseUrl : baseUrl.slice(0, hashAt);
  const queryAt = noHash.indexOf('?');
  let path = queryAt === -1 ? noHash : noHash.slice(0, queryAt);
  if (/^https?:\/\/[^/]+$/i.test(path)) path += '/';
  const kept = (queryAt === -1 ? '' : noHash.slice(queryAt + 1)).split('&').filter((p) => p && !/^utm_/i.test(p));
  const added = tags.filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`);
  const query = [...kept, ...added].join('&');
  return `${path}${query ? `?${query}` : ''}${hash}`;
}

/**
 * The try-on link for one partner:
 *   utm_source=ho_connect · utm_medium=partner_qr | partner_link · utm_campaign=<partner code> · utm_content=<business name slug>
 * utm_campaign (the code) is the identifier; utm_content is only there so people reading the CRM recognise the salon.
 */
export function tryOnLink(baseUrl: string, partner: { code: string; businessName: string | null }, channel: ShareChannel): string {
  return withUtm(baseUrl, [
    ['utm_source', TRYON_UTM_SOURCE],
    ['utm_medium', `partner_${channel}`],
    ['utm_campaign', partner.code.toUpperCase()],
    ['utm_content', partner.businessName ? slugify(partner.businessName) : null],
  ]);
}
