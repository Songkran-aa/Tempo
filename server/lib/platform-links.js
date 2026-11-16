// Creator platform links: which field a link belongs in, and what a profile link looks like.
// Used by the spreadsheet import and by migration 017 (older rows kept X / Facebook / Lemon8 / some IG links
// in "other links", so their platform logo had nothing to open).

export const PLATFORM_LINKS = [
  { field: "link_tiktok", base: "https://www.tiktok.com/@", domain: /(^|\.)tiktok\.com$/i, notProfile: /\/video\/|^\/(t|v)\/|\/photo\//i, shortHost: /^(vt|vm)\.tiktok\.com$/i },
  { field: "link_ig", base: "https://www.instagram.com/", domain: /(^|\.)(instagram\.com|instagr\.am)$/i, notProfile: /^\/(p|reel|reels|tv|stories|explore|s)\//i },
  { field: "link_fb", base: "https://www.facebook.com/", domain: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i, notProfile: /\/(posts|videos|photos|reel|watch|share\/[pv])\//i },
  { field: "link_youtube", base: "https://www.youtube.com/@", domain: /(^|\.)youtube\.com$/i, notProfile: /^\/(watch|shorts|playlist|embed)\b/i },
  { field: "link_x", base: "https://x.com/", domain: /(^|\.)(x\.com|twitter\.com)$/i, notProfile: /\/status\/|^\/(i|intent|hashtag|search)\//i },
  { field: "link_lemon8", base: "https://www.lemon8-app.com/@", domain: /(^|\.)lemon8-app\.com$/i, notProfile: /^\/@[^/]+\/\d+/i }
];
const HANDLE = /^@?[\w.\-]{2,60}$/;

/** "tiktok.com/@a" → "https://tiktok.com/@a"; anything that is not a web address → null. */
export function withScheme(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^(www\.)?[\w-]+(\.[\w-]+)+\/\S*$/i.test(s)) return "https://" + s;
  return null;
}

/** The platform a URL belongs to and whether it points at a profile (not a post or a video). */
export function classify(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const pl = PLATFORM_LINKS.find(p => p.domain.test(u.hostname));
  if (!pl) return null;
  const profile = !(pl.shortHost && pl.shortHost.test(u.hostname)) && !pl.notProfile.test(u.pathname) && u.pathname.replace(/\/+$/, "") !== "";
  return { pl, profile };
}

/** A value from a platform column: a link stays a link (scheme added), a bare @handle becomes the profile link. */
export function platformValue(field, v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const url = withScheme(s);
  if (url) return url;
  const pl = PLATFORM_LINKS.find(p => p.field === field);
  return pl && HANDLE.test(s) ? pl.base + s.replace(/^@/, "") : null;
}

/** The account handle in a profile link ("https://www.tiktok.com/@abc?lang=th" → "abc"), lower-case; null if none. */
export function handleOf(url) {
  const c = url && classify(withScheme(url) || "");
  if (!c || !c.profile) return null;
  const seg = new URL(withScheme(url)).pathname.split("/").filter(Boolean)[0] || "";
  const h = decodeURIComponent(seg).replace(/^@/, "").toLowerCase();
  return /^[\w.\-]{2,}$/.test(h) ? h : null;
}

/**
 * Normalise one creator record in place: platform fields get a scheme (or a handle becomes a link), and profile links
 * found in link_other move into their platform field when that field is empty. Posts, videos and other sites stay in
 * link_other. Returns true when anything changed.
 */
export function sortPlatformLinks(rec) {
  let changed = false;
  for (const pl of PLATFORM_LINKS) {
    const cur = rec[pl.field];
    if (cur == null || cur === "") continue;
    const v = platformValue(pl.field, cur);
    if (v && v !== cur) { rec[pl.field] = v; changed = true; }
    if (!v) { // not a link and not a handle: keep the text, but in "other links"
      rec.link_other = [rec.link_other, String(cur).trim()].filter(Boolean).join("\n");
      rec[pl.field] = null; changed = true;
    }
  }
  if (rec.link_other) {
    let moved = false;
    const lines = String(rec.link_other).split(/\r?\n/).map(line => {
      const tokens = line.trim().split(/[\s,]+/).filter(Boolean);
      // only lines made of links are touched; a line with words (a note) stays exactly as typed
      if (!tokens.length || !tokens.every(tk => withScheme(tk))) return line;
      const keep = tokens.filter(tk => {
        const url = withScheme(tk), c = classify(url);
        if (c && c.profile && !rec[c.pl.field]) { rec[c.pl.field] = url; moved = true; return false; }
        return true;
      });
      return keep.join(" ");
    });
    if (moved) { rec.link_other = lines.filter(l => l.trim()).join("\n") || null; changed = true; }
  }
  return changed;
}
