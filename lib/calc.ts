import type { Assumptions, Listing, OwnerType } from "./types";

/** ק"מ שנותרו עד תקרת אחריות הסוללה, ומספר השנים שזה שווה בנסועה של המשתמש. */
export function batteryRunway(listing: Listing, a: Assumptions) {
  const cap =
    listing.powertrain === "ev" ? a.evBatteryCapKm : a.phevBatteryCapKm;
  const kmLeft = Math.max(0, cap - listing.km);
  const kmYears = kmLeft / a.kmPerYear;

  // תקרת השנים: 10 שנים מהמסירה בפלאג-אין, 7 שנים בחשמלי
  const yearCap = listing.powertrain === "ev" ? 7 : 10;
  const nowYear = new Date().getFullYear();
  const timeYears = Math.max(0, listing.year + yearCap - nowYear);

  const years = Math.min(kmYears, timeYears);
  const bindingLimit: "km" | "time" = kmYears <= timeYears ? "km" : "time";

  return { cap, kmLeft, years, bindingLimit };
}

/** עלות אנרגיה שנתית משוערת. */
export function annualEnergyCost(listing: Listing, a: Assumptions) {
  const per100 =
    listing.powertrain === "ev" ? a.evCostPer100Km : a.phevCostPer100Km;
  return (a.kmPerYear / 100) * per100;
}

/** המחיר שרלוונטי בפועל: מחיר שסוכם במו"מ אם קיים, אחרת מחיר המודעה. */
export function effectivePrice(listing: Listing): number | null {
  return listing.negotiatedPrice ?? listing.price;
}

/**
 * עלות משוערת ל-5 שנים: מחיר הרכישה בניכוי שווי משוער בסוף,
 * ועוד אנרגיה ותחזוקה. מספר גס שנועד להשוואה בין שורות, לא לתקצוב.
 */
export function fiveYearCost(listing: Listing, a: Assumptions) {
  const price = effectivePrice(listing);
  if (price == null) return null;

  const kmAtExit = listing.km + a.kmPerYear * 5;
  const ageAtExit = new Date().getFullYear() + 5 - listing.year;

  // הערכת שווי גסה: ירידה של כ-8% לשנת גיל וכ-6% לכל 50 אלף ק"מ, ברצפה של 18% מהמחיר
  const ageFactor = Math.max(0, 1 - ageAtExit * 0.08);
  const kmFactor = Math.max(0, 1 - (kmAtExit / 50000) * 0.06);
  const resale = Math.max(price * 0.18, price * ageFactor * kmFactor);

  const depreciation = price - resale;
  const energy = annualEnergyCost(listing, a) * 5;
  const maintenance = (listing.powertrain === "ev" ? 1300 : 2800) * 5;

  return {
    resale: Math.round(resale),
    depreciation: Math.round(depreciation),
    energy: Math.round(energy),
    maintenance,
    total: Math.round(depreciation + energy + maintenance),
    kmAtExit,
    ageAtExit,
  };
}

/** כמה שקלים עולה כל ק"מ שנחסך, מול רכב ייחוס זול יותר עם יותר ק"מ. */
export function shekelPerKmSaved(listing: Listing, baseline: Listing) {
  const p = effectivePrice(listing);
  const b = effectivePrice(baseline);
  if (p == null || b == null) return null;
  const kmSaved = baseline.km - listing.km;
  if (kmSaved <= 0) return null;
  return (p - b) / kmSaved;
}

export function formatIls(n: number | null | undefined) {
  if (n == null) return "לא צוין";
  return n.toLocaleString("he-IL") + " ₪";
}

export function formatKm(n: number) {
  return n.toLocaleString("he-IL");
}

export function daysOnMarket(postedAt: string) {
  const posted = new Date(postedAt).getTime();
  if (Number.isNaN(posted)) return null;
  return Math.round((Date.now() - posted) / 86400000);
}

export function yad2Url(id: string) {
  return `https://www.yad2.co.il/vehicles/item/${id}`;
}

/* ---------------- ציון התאמה ---------------- */

/**
 * כמה הרכב עונה על מה שחיפשנו: שנתון 2022 ומעלה, ק״מ נמוך, ורכב שלא חי
 * חיי צי. אין ביד2 שדה "תאונות", ולכן הפרוקסי הכי טוב שיש הוא הבעלות
 * הקודמת ומספר היד. השכרה וליסינג עוברים נהגים רבים ובלאי גבוה,
 * ורכב פרטי יד ראשונה הוא ההימור הבטוח יותר.
 */
const OWNER_SCORE: Record<OwnerType, number> = {
  private: 1,
  company: 0.6,
  lease: 0.35,
  rental: 0.1,
  other: 0.5,
};

export const OWNER_LABEL: Record<OwnerType, string> = {
  private: "בעלות פרטית",
  company: "בעלות חברה",
  lease: "ליסינג",
  rental: "השכרה",
  other: "בעלות לא ידועה",
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function matchScore(listing: Listing) {
  const price = effectivePrice(listing);

  const km = clamp01(1 - listing.km / 100000);
  const cost = price == null ? 0.5 : clamp01((125000 - price) / 40000);
  const owner = OWNER_SCORE[listing.owner] ?? 0.5;
  const hand = listing.hand <= 1 ? 1 : listing.hand === 2 ? 0.6 : 0.3;
  const year = clamp01((listing.year - 2022) / 2);

  const parts = {
    km: km * 40,
    owner: owner * 25,
    price: cost * 20,
    hand: hand * 10,
    year: year * 5,
  };

  return {
    ...parts,
    total: Math.round(parts.km + parts.owner + parts.price + parts.hand + parts.year),
  };
}

/** האם הרכב עומד ברף שהגדרנו: 2022 ומעלה, עד 80 אלף ק״מ, לא רכב צי. */
export function meetsBar(listing: Listing) {
  return (
    listing.year >= 2022 &&
    listing.km <= 80000 &&
    listing.owner !== "rental" &&
    listing.owner !== "lease"
  );
}
