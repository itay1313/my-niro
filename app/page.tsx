import Dashboard from "@/components/Dashboard";
import dataset from "@/data/listings.json";
import type { Dataset } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function Page() {
  // המקור היחיד לאמת הוא data/listings.json. שנתון 2021 ומטה לא נכנס לאתר.
  const data = dataset as unknown as Dataset;
  const listings = data.listings.filter((l) => l.year >= 2022);

  return (
    <main className="wrap">
      <Dashboard
        listings={listings}
        assumptions={data.assumptions}
        updatedAt={data.updatedAt}
      />
    </main>
  );
}
