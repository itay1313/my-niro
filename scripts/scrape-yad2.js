/* eslint-disable */
/**
 * סריקת יד2 — מודבק לקונסולת הדפדפן, לא רץ ב-node.
 *
 * יד2 מגיש דף ריק לכל בקשה שלא מגיעה מדפדפן אמיתי, ולכן האיסוף חייב לרוץ
 * בטאב פתוח. פותחים את דף החיפוש של נירו פלוס, מדביקים את כל הקובץ הזה
 * בקונסולה, ומחכים. בסוף יורד קובץ JSON שנכנס ל-merge-scrape.mjs.
 *
 * 48 = קיה, 13158 = נירו פלוס.
 */
(async () => {
  const BASE = "/vehicles/cars?manufacturer=48&model=13158&year=2022--1&km=0-100000";
  const nextData = (html) => {
    const m = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    return m ? JSON.parse(m[1]) : null;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // --- שלב 1: הפיד, בשביל רשימת המזהים ושם המגרש ---
  const feed = new Map();
  for (let page = 1; page <= 10; page++) {
    const html = await fetch(`${BASE}&page=${page}`, {
      credentials: "include",
    }).then((r) => r.text());
    const d = nextData(html);
    if (!d) break;
    const q = d.props.pageProps.dehydratedState.queries.find((x) =>
      x.queryHash.startsWith('["feed-mix"')
    );
    if (!q) break;
    for (const group of ["ads", "platinum", "solo", "boost"]) {
      for (const ad of q.state.data[group] || []) {
        if (!/פלאג/.test(ad.engineType?.text || "")) continue; // חשמלי בחוץ
        feed.set(ad.token, {
          agency: ad.customer?.agencyName || null,
          feedArea: ad.address?.area?.text || null,
        });
      }
    }
    console.log(`feed page ${page} · ${feed.size} מודעות`);
    await sleep(350);
  }

  // --- שלב 2: כל מודעה בנפרד, כי ק״מ ובעלות לא קיימים בפיד ---
  const rows = [];
  let i = 0;
  for (const [id, extra] of feed) {
    i++;
    try {
      const html = await fetch(`/vehicles/item/${id}`, {
        credentials: "include",
      }).then((r) => r.text());
      const d = nextData(html);
      if (!d) continue;
      const it = d.props.pageProps.dehydratedState.queries[0].state.data;
      const desc = (it.metaData?.description || "").replace(/\s+/g, " ").trim();
      rows.push({
        id,
        price: it.price ?? null,
        km: it.km ?? null,
        year: it.vehicleDates?.yearOfProduction,
        month: it.vehicleDates?.monthOfProduction?.id ?? null,
        test: (it.vehicleDates?.testDate || "").slice(0, 7),
        hand: it.hand?.id,
        owner: it.owner?.text || "",
        adType: it.adType,
        sub: it.subModel?.text || "",
        color: it.color?.text || "",
        city: it.address?.city?.text || "",
        area: it.address?.area?.text || "",
        created: (it.dates?.createdAt || "").slice(0, 10),
        updated: (it.dates?.updatedAt || "").slice(0, 10),
        tags: (it.tags || []).map((t) => t.name),
        // הצהרות של המוכר בטקסט חופשי. סימון בלבד, לא עובדה.
        noAcc: /ללא\s*תאונ|לא\s*עבר\s*תאונ|ללא\s*מעורבות/.test(desc),
        warranty: /אחריות/.test(desc),
        desc: desc.slice(0, 300),
        ...extra,
      });
    } catch (err) {
      console.warn(id, err.message);
    }
    if (i % 20 === 0) console.log(`${i}/${feed.size}`);
    await sleep(180);
  }

  const blob = new Blob([JSON.stringify(rows)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "yad2-niro-plus.json";
  a.click();
  console.log(`נאספו ${rows.length} מודעות`);
})();
