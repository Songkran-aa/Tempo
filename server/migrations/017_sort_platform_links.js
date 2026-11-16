// One-time data fix: profile links kept in "other links" (X, Facebook, Lemon8, some Instagram / TikTok) move into
// their platform field so the platform logo opens the creator's page; links typed without https:// get it.
// Posts, videos, short links and anything that is not a known platform stay in "other links". Filled fields are
// never overwritten.
import { PLATFORM_LINKS, sortPlatformLinks } from "../lib/platform-links.js";

const FIELDS = PLATFORM_LINKS.map(p => p.field);

export default async function (tx) {
  const { rows } = await tx.query(`select id, link_other, ${FIELDS.join(", ")} from influencers
    where link_other is not null or ${FIELDS.map(f => `(${f} is not null and ${f} !~* '^https?://')`).join(" or ")}`);
  for (const r of rows) {
    const rec = { ...r };
    if (!sortPlatformLinks(rec)) continue;
    const cols = ["link_other", ...FIELDS];
    await tx.query(`update influencers set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1`, [r.id, ...cols.map(c => rec[c] ?? null)]);
  }
}
