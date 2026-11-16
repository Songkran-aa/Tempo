// One-time data fix: old creator records keep LINE / phone / email inside the free-text contact box.
// Move them into the separate fields added in 013 (only for rows where those fields are still empty).
import { splitLegacyContacts } from "../lib/contact-split.js";

export default async function (tx) {
  await splitLegacyContacts(tx);
}
