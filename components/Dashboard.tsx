"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Assumptions,
  ChosenVideo,
  Listing,
  NotesMap,
  NotesStorage,
  UserNote,
} from "@/lib/types";
import {
  OWNER_LABEL,
  annualEnergyCost,
  batteryRunway,
  daysOnMarket,
  effectivePrice,
  fiveYearCost,
  formatIls,
  formatKm,
  matchScore,
  meetsBar,
  yad2Url,
} from "@/lib/calc";

const LOCAL_KEY = "my-niro-notes-v1";

type SortKey = "match" | "km" | "price" | "year" | "value" | "posted";
type OwnerFilter = "all" | "clean" | "private";

const PLACES = ["מקום ראשון", "מקום שני", "מקום שלישי"];
const placeLabel = (rank: number) => PLACES[rank - 1] ?? `מקום ${rank}`;

const SORT_LABELS: Record<SortKey, string> = {
  match: "התאמה לקריטריונים",
  value: "עלות משוערת ל-5 שנים",
  km: "ק״מ",
  price: "מחיר",
  year: "שנתון",
  posted: "תאריך פרסום",
};

interface Props {
  listings: Listing[];
  assumptions: Assumptions;
  updatedAt: string;
  chosenId?: string;
  purchasedAt?: string;
  chosenVideo?: ChosenVideo;
}

export default function Dashboard({
  listings,
  assumptions,
  updatedAt,
  chosenId,
  purchasedAt,
  chosenVideo,
}: Props) {
  const [notes, setNotes] = useState<NotesMap>({});
  const [storage, setStorage] = useState<NotesStorage>("local");
  const [loaded, setLoaded] = useState(false);

  const [seller, setSeller] = useState<"all" | "dealer" | "private">("all");
  const [ownerF, setOwnerF] = useState<OwnerFilter>("all");
  const [year, setYear] = useState<"all" | "2022" | "2023" | "2024">("all");
  const [maxPrice, setMaxPrice] = useState(150000);
  const [maxKm, setMaxKm] = useState(80000);
  const [showSold, setShowSold] = useState(false);
  const [sort, setSort] = useState<SortKey>("match");
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  /* ---------- notes: load ---------- */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let local: NotesMap = {};
      try {
        const raw = window.localStorage.getItem(LOCAL_KEY);
        if (raw) local = JSON.parse(raw) as NotesMap;
      } catch {
        /* localStorage can throw in private mode */
      }

      try {
        const res = await fetch("/api/notes", { cache: "no-store" });
        const json = (await res.json()) as {
          storage: NotesStorage;
          notes: NotesMap;
        };
        if (cancelled) return;
        setStorage(json.storage);
        setNotes(json.storage === "postgres" ? json.notes : local);
      } catch {
        if (cancelled) return;
        setStorage("local");
        setNotes(local);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- theme ---------- */

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  /* ---------- notes: save ---------- */

  async function saveNote(id: string, note: string, status: string) {
    const entry: UserNote = {
      id,
      note,
      status,
      updatedAt: new Date().toISOString(),
    };
    const next = { ...notes, [id]: entry };
    setNotes(next);

    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }

    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, note, status }),
      });
      const json = (await res.json()) as { storage: NotesStorage };
      setStorage(json.storage);
    } catch {
      setStorage("local");
    }
  }

  /* ---------- derived ---------- */

  const visible = useMemo(() => {
    const rows = listings.filter((l) => {
      if (!showSold && l.status === "sold") return false;
      if (seller !== "all" && l.sellerType !== seller) return false;
      if (ownerF === "private" && l.owner !== "private") return false;
      if (ownerF === "clean" && (l.owner === "rental" || l.owner === "lease"))
        return false;
      if (year !== "all" && String(l.year) !== year) return false;
      if (l.km > maxKm) return false;
      const p = effectivePrice(l);
      if (p != null && p > maxPrice) return false;
      return true;
    });

    const cost = (l: Listing) => fiveYearCost(l, assumptions)?.total ?? Infinity;

    rows.sort((a, b) => {
      switch (sort) {
        case "match":
          return (
            matchScore(b).total - matchScore(a).total || a.km - b.km
          );
        case "km":
          return a.km - b.km;
        case "price":
          return (
            (effectivePrice(a) ?? Infinity) - (effectivePrice(b) ?? Infinity)
          );
        case "year":
          return b.year - a.year || a.km - b.km;
        case "posted":
          return (
            new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
          );
        case "value":
          return cost(a) - cost(b);
        default:
          return cost(a) - cost(b);
      }
    });

    return rows;
  }, [
    listings,
    showSold,
    seller,
    ownerF,
    year,
    maxKm,
    maxPrice,
    sort,
    assumptions,
  ]);

  const active = listings.filter((l) => l.status === "active");
  const priced = active
    .map((l) => effectivePrice(l))
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b);
  const cheapest = priced[0];
  const median = priced.length
    ? priced[Math.floor(priced.length / 2)]
    : undefined;
  const lowestKm = active.length
    ? active.reduce((m, l) => (l.km < m.km ? l : m))
    : undefined;
  const noteCount = Object.values(notes).filter(
    (n) => n.note.trim() || n.status
  ).length;
  const passing = active.filter(meetsBar).length;
  // הרכב שנבחר מוצג תמיד, גם כשהסינונים היו מסתירים אותו.
  const chosen = chosenId ? listings.find((l) => l.id === chosenId) : undefined;

  function reset() {
    setSeller("all");
    setOwnerF("all");
    setYear("all");
    setMaxPrice(150000);
    setMaxKm(80000);
    setShowSold(false);
    setSort("match");
  }

  return (
    <>
      <header className="mast">
        <div className="mast-top">
          <span className="eyebrow">
            עודכן {updatedAt} · מקור: יד2 · נירו פלוס פלאג-אין, 2022 ומעלה
          </span>
          <button
            className="theme-btn"
            type="button"
            onClick={() =>
              setTheme((t) =>
                t === "system" ? "light" : t === "light" ? "dark" : "system"
              )
            }
          >
            תצוגה: {theme === "system" ? "אוטומטית" : theme === "light" ? "בהירה" : "כהה"}
          </button>
        </div>
        <h1>תיק רכישה נירו</h1>
        <p className="lede">
          כל מודעות קיה נירו פלוס פלאג-אין בשוק, מדורגות ממקום ראשון ומטה לפי
          העלות האמיתית לחמש שנים. חשמלי מלא לא נכנס לרשימה. אפשר לסנן, למיין,
          ולכתוב הערה על כל רכב.
        </p>
      </header>

      {loaded && storage === "local" && (
        <div className="banner">
          ההערות נשמרות כרגע <strong>בדפדפן הזה בלבד</strong>. כדי לסנכרן בין
          מכשירים, צור מסד Postgres ב-Vercel והוסף משתנה סביבה בשם{" "}
          <code>POSTGRES_URL</code>. ההערות הקיימות יעברו אוטומטית בפעם הבאה
          שתשמור.
        </div>
      )}

      {chosen && (
        <section className="pinned">
          <div className="pinned-top">
            <h2 className="pinned-head">
              {purchasedAt ? "נרכשה" : "הרכב שנבחר"}
            </h2>
            {purchasedAt && (
              <span className="pinned-when">
                {formatDate(purchasedAt)} · החיפוש הסתיים
              </span>
            )}
          </div>
          <ListingCard
            listing={chosen}
            rank={null}
            purchased={Boolean(purchasedAt)}
            assumptions={assumptions}
            note={notes[chosen.id]}
            isOpen={openNote === chosen.id}
            onToggle={() =>
              setOpenNote(openNote === chosen.id ? null : chosen.id)
            }
            onSave={saveNote}
          />
          {chosenVideo && <VideoEmbed video={chosenVideo} />}
        </section>
      )}

      <div className="stats">
        <div className="stat">
          <span className="fig">{active.length}</span>
          <span className="cap">מודעות נירו פלוס פלאג-אין בשוק</span>
        </div>
        <div className="stat">
          <span className="fig hi">{formatIls(cheapest)}</span>
          <span className="cap">המחיר הנמוך ביותר</span>
        </div>
        <div className="stat">
          <span className="fig">{formatIls(median)}</span>
          <span className="cap">חציון המחירים</span>
        </div>
        <div className="stat">
          <span className="fig">
            {lowestKm ? formatKm(lowestKm.km) : "-"}
          </span>
          <span className="cap">
            הק״מ הנמוך ביותר{lowestKm ? ` · ${lowestKm.year}` : ""}
          </span>
        </div>
        <div className="stat">
          <span className="fig hi">{passing}</span>
          <span className="cap">עומדים ברף: עד 80 אלף ק״מ, בלי צי</span>
        </div>
        <div className="stat">
          <span className="fig">{noteCount}</span>
          <span className="cap">רכבים שכתבת עליהם הערה</span>
        </div>
      </div>

      <div className="filters">
        <div className="field">
          <label>בעלות קודמת</label>
          <div className="chips">
            {(
              [
                ["all", "הכל"],
                ["clean", "בלי ליסינג והשכרה"],
                ["private", "פרטית בלבד"],
              ] as const
            ).map(([v, t]) => (
              <button
                key={v}
                type="button"
                className="chip"
                aria-pressed={ownerF === v}
                onClick={() => setOwnerF(v)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>מוכר</label>
          <div className="chips">
            {(
              [
                ["all", "הכל"],
                ["private", "פרטי"],
                ["dealer", "סוחר"],
              ] as const
            ).map(([v, t]) => (
              <button
                key={v}
                type="button"
                className="chip"
                aria-pressed={seller === v}
                onClick={() => setSeller(v)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>שנתון</label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value as typeof year)}
          >
            <option value="all">2022 ומעלה</option>
            <option value="2022">2022</option>
            <option value="2023">2023</option>
            <option value="2024">2024</option>
          </select>
        </div>

        <div className="field range">
          <label>מחיר עד</label>
          <input
            type="range"
            min={80000}
            max={150000}
            step={1000}
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
          />
          <span className="rangeval">{formatIls(maxPrice)}</span>
        </div>

        <div className="field range">
          <label>ק״מ עד</label>
          <input
            type="range"
            min={10000}
            max={140000}
            step={5000}
            value={maxKm}
            onChange={(e) => setMaxKm(Number(e.target.value))}
          />
          <span className="rangeval">{formatKm(maxKm)} ק״מ</span>
        </div>

        <div className="field">
          <label>מיון</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="match">התאמה לקריטריונים</option>
            <option value="value">עלות משוערת ל-5 שנים</option>
            <option value="km">ק״מ, מהנמוך</option>
            <option value="price">מחיר, מהזול</option>
            <option value="year">שנתון, מהחדש</option>
            <option value="posted">פורסם לאחרונה</option>
          </select>
        </div>

        <div className="field">
          <label>נמכרו</label>
          <button
            type="button"
            className="chip"
            aria-pressed={showSold}
            onClick={() => setShowSold((s) => !s)}
          >
            {showSold ? "מוצגים" : "מוסתרים"}
          </button>
        </div>

        <button type="button" className="reset" onClick={reset}>
          איפוס
        </button>
      </div>

      <p className="count">
        {visible.length} תוצאות מתוך {listings.length} · מדורג לפי{" "}
        {SORT_LABELS[sort]}
      </p>

      <div className="list">
        {visible
          .filter((l) => l.id !== chosenId)
          .map((l, i) => (
            <ListingCard
              key={l.id}
              listing={l}
              rank={i + 1}
              assumptions={assumptions}
              note={notes[l.id]}
              isOpen={openNote === l.id}
              onToggle={() => setOpenNote(openNote === l.id ? null : l.id)}
              onSave={saveNote}
            />
          ))}
      </div>

      {visible.length === 0 && (
        <p className="count">אין תוצאות בסינון הזה. נסה לאפס.</p>
      )}

      <footer className="foot">
        <span className="eyebrow">בסיס החישוב</span>
        <ul>
          <li>
            נסועה: {formatKm(assumptions.kmPerYear)} ק״מ בשנה. בנזין 95 בשירות
            עצמי {assumptions.petrolPricePerLiter} ₪ לליטר, חשמל ביתי{" "}
            {assumptions.electricityPerKwh} ₪ לקוט״ש.
          </li>
          <li>
            אחריות סוללה: {formatKm(assumptions.phevBatteryCapKm)} ק״מ או 10
            שנים מהמסירה, לפי המוקדם. הארכה{" "}
            {assumptions.batteryExtensionPerYear} ₪ לשנה, סוללה חדשה כ-
            {formatKm(assumptions.batteryReplacementCost)} ₪.
          </li>
          <li>
            ציון ההתאמה, 0 עד 100, מורכב מק״מ (40), בעלות קודמת (25), מחיר
            (20), מספר יד (10) ושנתון (5). ליד2 אין שדה תאונות, ולכן הבעלות
            הקודמת היא הסימן הטוב ביותר שיש: רכב ליסינג או השכרה עבר הרבה
            נהגים. הצהרת ״ללא תאונות״ במודעה היא טקסט של המוכר, לא בדיקה.
          </li>
          <li>
            העלות ל-5 שנים היא הערכה גסה להשוואה בין שורות, לא תחזית. היא כוללת
            פחת משוער, אנרגיה ותחזוקה.
          </li>
          <li>
            המחירים והמלאי משתנים יומית. כל רכב דורש בדיקת מכון עצמאית לפני
            רכישה.
          </li>
        </ul>
      </footer>
    </>
  );
}

/* ---------------- כרטיס מודעה ---------------- */

function ListingCard({
  listing: l,
  rank,
  assumptions,
  note,
  purchased = false,
  isOpen,
  onToggle,
  onSave,
}: {
  listing: Listing;
  /** מקום בדירוג. null = הרכב שנבחר, שמוצג מחוץ לרשימה. */
  rank: number | null;
  /** הרכב הנעוץ כבר נרכש. מסתיר את סימון ״נמכר״ ומחליף את התגית. */
  purchased?: boolean;
  assumptions: Assumptions;
  note?: UserNote;
  isOpen: boolean;
  onToggle: () => void;
  onSave: (id: string, note: string, status: string) => Promise<void>;
}) {
  const score = matchScore(l);
  const price = effectivePrice(l);
  const runway = batteryRunway(l, assumptions);
  const energy = annualEnergyCost(l, assumptions);
  const five = fiveYearCost(l, assumptions);
  const days = daysOnMarket(l.postedAt);
  const hasNote = Boolean(note?.note.trim() || note?.status);

  return (
        <article
                    className={[
            "card",
            rank != null && rank <= 3 ? "podium p" + rank : "",
          rank == null ? "chosen" : "",
            purchased ? "purchased" : "",
            l.highlight === "top" ? "top" : "",
            l.highlight === "caution" ? "caution" : "",
            l.status === "sold" && !purchased ? "sold" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="card-head">
            <div>
              <div className="title-row">
                <span className="name">
                  קיה {l.model} {l.trim}
                </span>
                {rank == null ? (
                  <span className="rank chosen-tag">
                    {purchased ? "נרכשה" : "הרכב שנבחר"}
                  </span>
                ) : (
                  <span className={"rank" + (rank <= 3 ? " r" + rank : "")}>
                    <b>{rank}</b>
                    {placeLabel(rank)}
                  </span>
                )}
                {l.status === "sold" && !purchased && (
                  <span className="badge no">נמכר</span>
                )}
              </div>
              <div className="specs">
                <span className="strong">
                  {l.month ? `${l.month}/${l.year}` : l.year}
                </span>
                <span className="strong">{formatKm(l.km)} ק״מ</span>
                <span>יד {l.hand}</span>
                <span
                  className={
                    "owner o-" +
                    (l.owner === "rental" || l.owner === "lease"
                      ? "fleet"
                      : l.owner)
                  }
                >
                  {OWNER_LABEL[l.owner]}
                </span>
                {days != null && <span>בלוח {days} ימים</span>}
              </div>
              <div className="seller">
                <span>
                  {l.sellerType === "private" ? "מוכר פרטי" : l.sellerName}
                  {l.contact ? ` · ${l.contact}` : ""}
                </span>
                {l.area && <span>{l.area}</span>}
                {l.phones.map((p) => (
                  <a key={p} href={`tel:${p.replace(/-/g, "")}`}>
                    {p}
                  </a>
                ))}
              </div>
            </div>

            <div className="price-col">
              {l.negotiatedPrice != null && l.price != null && (
                <span className="price was">{formatIls(l.price)}</span>
              )}
              <span className="price">{formatIls(price)}</span>
              {l.negotiatedPrice != null && (
                <span className="price deal">מחיר שסוכם</span>
              )}
            </div>
          </div>

          {(l.flags.length > 0 || meetsBar(l) || l.highlight === "top") && (
            <div className="badges">
              {meetsBar(l) && <span className="badge go">עומד ברף</span>}
              {l.highlight === "top" && (
                <span className="badge go">מומלץ לבדוק</span>
              )}
              {l.highlight === "caution" && (
                <span className="badge warn">דורש בירור</span>
              )}
              {l.flags.map((f) => (
                <span key={f} className="badge">
                  {f}
                </span>
              ))}
            </div>
          )}

          {l.claudeNote && (
            <div className="claude-note">
              <span className="who">ניתוח</span>
              {l.claudeNote}
            </div>
          )}

          <div className="metrics">
            <div className="metric">
              <span className="k">ציון התאמה</span>
              <span className="v score">{score.total}</span>
            </div>
            <div className="metric">
              <span className="k">אחריות סוללה נותרה</span>
              <span
                className={
                  "v " +
                  (runway.years < 3.5
                    ? "bad"
                    : runway.years < 4.5
                      ? "warn"
                      : "")
                }
              >
                {runway.years.toFixed(1)} שנים
              </span>
            </div>
            <div className="metric">
              <span className="k">ק״מ עד התקרה</span>
              <span className="v">{formatKm(runway.kmLeft)}</span>
            </div>
            <div className="metric">
              <span className="k">אנרגיה לשנה</span>
              <span className="v">
                {Math.round(energy).toLocaleString("he-IL")} ₪
              </span>
            </div>
            {five && (
              <div className="metric">
                <span className="k">עלות ל-5 שנים</span>
                <span className="v">{formatIls(five.total)}</span>
              </div>
            )}
            {five && (
              <div className="metric">
                <span className="k">ק״מ בעוד 5 שנים</span>
                <span className="v">{formatKm(five.kmAtExit)}</span>
              </div>
            )}
          </div>

          <div className="card-foot">
            <a
              className="linkout"
              href={yad2Url(l.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              פתיחת המודעה ביד2 ↗
            </a>
            {note?.status && <span className="badge go">{note.status}</span>}
            <button
              type="button"
              className={"note-toggle" + (hasNote ? " filled" : "")}
              onClick={onToggle}
            >
              {hasNote ? "ההערה שלי" : "הוספת הערה"}
            </button>
          </div>

          {isOpen && (
            <NoteEditor
              listingId={l.id}
              initial={note}
              onSave={onSave}
              onClose={onToggle}
            />
          )}
        </article>
  );
}

/** "2026-09-07" → "7.9.2026" */
function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${m}.${y}`;
}

/* ---------------- סרטון של הדגם ---------------- */

function VideoEmbed({ video }: { video: ChosenVideo }) {
  const [y, m] = video.publishedAt.split("-");
  return (
    <figure className="video">
      <div className="video-frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}`}
          title={video.title}
          loading="lazy"
          allow="accelerometer; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <figcaption className="video-cap">
        <span className="video-title">{video.title}</span>
        <span className="video-meta">
          {video.channel} · {m}/{y} · {video.minutes} דקות
          {video.articleUrl && (
            <>
              {" · "}
              <a
                href={video.articleUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                המבחן הכתוב ↗
              </a>
            </>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

/* ---------------- note editor ---------------- */

const STATUSES = ["", "לבדיקה", "התקשרתי", "נקבעה צפייה", "נפסל"];

function NoteEditor({
  listingId,
  initial,
  onSave,
  onClose,
}: {
  listingId: string;
  initial?: UserNote;
  onSave: (id: string, note: string, status: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial?.note ?? "");
  const [status, setStatus] = useState(initial?.status ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(
    initial?.updatedAt ?? null
  );

  async function submit() {
    setSaving(true);
    await onSave(listingId, text, status);
    setSavedAt(new Date().toISOString());
    setSaving(false);
  }

  return (
    <div className="note-panel">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="מה בדקת, מה אמרו לך בטלפון, מה הוסכם על המחיר, מה עלה בדוח"
        aria-label="הערה על הרכב"
      />
      <div className="note-row">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="סטטוס"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || "ללא סטטוס"}
            </option>
          ))}
        </select>
        <button className="btn" type="button" onClick={submit} disabled={saving}>
          {saving ? "שומר..." : "שמירה"}
        </button>
        <button className="btn ghost" type="button" onClick={onClose}>
          סגירה
        </button>
        {savedAt && (
          <span className="saved">
            נשמר {new Date(savedAt).toLocaleString("he-IL")}
          </span>
        )}
      </div>
    </div>
  );
}
