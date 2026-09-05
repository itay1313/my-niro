import type { Assumptions, Listing } from "./types";

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
