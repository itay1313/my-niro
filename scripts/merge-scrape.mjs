/**
 * ממזג סריקה גולמית של יד2 לתוך data/listings.json.
 *
 * הסריקה עצמה רצה בדפדפן (יד2 חוסם בקשות משרת), ההוראות ב-README.
 * הסקריפט הזה לוקח את קובץ ה-JSON שיוצא משם ובונה ממנו את מקור האמת
 * של האתר, בלי לדרוס שום דבר שנכתב ביד: הערות, דגלים, ומחיר שסוכם
 * במו״מ נשמרים לפי מזהה המודעה.
 *
 *   node scripts/merge-scrape.mjs <scrape.json>
 */
import { readFile, writeFile } from "node:fs/promises";

const OWNER_MAP = {
  "פרטית": "private",
  "חברה": "company",
  "החכר (ליסינג)": "lease",
  "השכרה": "rental",
};

const MONTHS = [
  "", "01", "02", "03", "04", "05", "06",
  "07", "08", "09", "10", "11", "12",
];

/**
 * מודעות כונס נכסים והוצאה לפועל נכנסות ללוח עם מחיר פתיחה למכרז,
 * לא עם מחיר מכירה. רכב 2022 על 95 אלף ק״מ שמופיע ב-5,000 ₪ מעוות
 * את חציון המחירים ואת הדירוג, ולכן הן יורדות מהרשימה.
 */
const LIQUIDATOR = /כונס|כינוס|הוצאה לפועל|מכרז/;

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/merge-scrape.mjs <scrape.json>");
  process.exit(1);
}

const scraped = JSON.parse(await readFile(src, "utf8"));
const dataset = JSON.parse(await readFile("data/listings.json", "utf8"));
const prev = new Map(dataset.listings.map((l) => [l.id, l]));

/** דגלים שנגזרים מהנתונים עצמם, לא מטקסט חופשי של המוכר. */
function buildFlags(row, owner) {
  const flags = [];
  if (row.test) flags.push(`טסט עד ${row.test.slice(5)}/${row.test.slice(0, 4)}`);
  if (row.month) flags.push(`עלה לכביש ${MONTHS[row.month]}/${row.year}`);
  if (owner === "private" && row.hand === 1) flags.push("פרטי יד ראשונה");
  if (owner === "rental") flags.push("היה רכב השכרה");
  if (owner === "lease") flags.push("היה בליסינג");
  if (row.noAcc) flags.push("המוכר מצהיר: ללא תאונות");
  if (row.warranty) flags.push("המוכר מציין אחריות");
  return flags;
}

const skipped = [];
const listings = scraped
  .filter((row) => {
    if (LIQUIDATOR.test(row.agency || "")) {
      skipped.push(row.id);
      return false;
    }
    return true;
  })
  .map((row) => {
  const owner = OWNER_MAP[row.owner] ?? "other";
  const old = prev.get(row.id);
  const dealer = row.adType === "commercial";

  return {
    id: row.id,
    model: "נירו פלוס",
    trim: (row.sub || "").split(" ")[0] || "",
    powertrain: "phev",
    year: row.year,
    km: row.km ?? 0,
    hand: row.hand ?? 0,
    price: row.price || null,
    ...(old?.negotiatedPrice != null
      ? { negotiatedPrice: old.negotiatedPrice }
      : {}),
    owner,
    ownerText: row.owner || "",
    month: row.month || null,
    testUntil: row.test || "",
    color: row.color || "",
    claimsNoAccidents: Boolean(row.noAcc),
    sellerType: dealer ? "dealer" : "private",
    sellerName: row.agency || old?.sellerName || (dealer ? "סוחר" : "מוכר פרטי"),
    contact: old?.contact ?? "",
    phones: old?.phones ?? [],
    area: row.city || row.feedArea || row.area || "",
    postedAt: row.created || "",
    status: "active",
    highlight: old?.highlight ?? "none",
    flags: old?.flags?.length ? old.flags : buildFlags(row, owner),
    claudeNote: old?.claudeNote ?? "",
  };
  });

// מודעות שהיו בקובץ ואינן בסריקה ירדו מהלוח. שומרים אותן מסומנות כנמכרו,
// כדי שההערות שנכתבו עליהן לא ייעלמו.
const seen = new Set(listings.map((l) => l.id));
for (const old of dataset.listings) {
  if (!seen.has(old.id)) listings.push({ ...old, status: "sold" });
}

dataset.listings = listings;
dataset.updatedAt = new Date().toISOString().slice(0, 10);
dataset.source = "yad2.co.il · קיה נירו פלוס פלאג-אין, שנתון 2022 ומעלה";

await writeFile("data/listings.json", JSON.stringify(dataset, null, 2) + "\n");
console.log(
  `${listings.length} מודעות · ${listings.filter((l) => l.status === "active").length} פעילות · ` +
    `${listings.filter((l) => l.km <= 80000).length} עד 80 אלף ק״מ` +
    (skipped.length ? ` · ${skipped.length} מודעות כונס סוננו` : "")
);
