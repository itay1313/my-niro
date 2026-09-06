import Dashboard from "@/components/Dashboard";
import dataset from "@/data/listings.json";
import type { Dataset } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * האתר עוקב אחרי דגם אחד בלבד: קיה נירו פלוס פלאג-אין, שנתון 2022 ומעלה.
 * חשמלי מלא ונירו רגיל לא נכנסים, גם אם הם מופיעים בקובץ הנתונים.
 */
function isTracked(l: Dataset["listings"][number]) {
  return l.year >= 2022 && l.powertrain === "phev" && l.model.includes("פלוס");
}

export default function Page() {
  const data = dataset as unknown as Dataset;
  const listings = data.listings.filter(isTracked);

  return (
    <main className="wrap">
      <Dashboard
        listings={listings}
        assumptions={data.assumptions}
        updatedAt={data.updatedAt}
        chosenId={data.chosenId}
      />
    </main>
  );
}
