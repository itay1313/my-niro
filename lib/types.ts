export type Powertrain = "phev" | "ev";
export type SellerType = "dealer" | "private";
export type Highlight = "top" | "watch" | "caution" | "none";
export type ListingStatus = "active" | "sold";

export interface Listing {
  id: string;
  model: string;
  trim: string;
  powertrain: Powertrain;
  year: number;
  km: number;
  hand: number;
  price: number | null;
  negotiatedPrice?: number;
  sellerType: SellerType;
  sellerName: string;
  contact: string;
  phones: string[];
  area: string;
  postedAt: string;
  status: ListingStatus;
  highlight: Highlight;
  flags: string[];
  claudeNote: string;
}

export interface Assumptions {
  kmPerYear: number;
  petrolPricePerLiter: number;
  electricityPerKwh: number;
  phevCostPer100Km: number;
  evCostPer100Km: number;
  corollaCostPer100Km: number;
  phevBatteryCapKm: number;
  evBatteryCapKm: number;
  batteryReplacementCost: number;
  batteryExtensionPerYear: number;
}

export interface Dataset {
  updatedAt: string;
  source: string;
  assumptions: Assumptions;
  listings: Listing[];
}

/** What the user writes on the site. Kept separate from the scraped data. */
export interface UserNote {
  id: string;
  note: string;
  /** free-form status the user sets: e.g. "התקשרתי", "נפסל", "לבדיקה" */
  status: string;
  updatedAt: string;
}

export type NotesMap = Record<string, UserNote>;

export type NotesStorage = "postgres" | "local";
