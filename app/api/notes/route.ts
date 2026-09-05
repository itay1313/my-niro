import { NextResponse } from "next/server";
import { deleteNote, hasDb, readNotes, writeNote } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!hasDb) {
    return NextResponse.json({ storage: "local", notes: {} });
  }
  try {
    const notes = await readNotes();
    return NextResponse.json({ storage: "postgres", notes });
  } catch (err) {
    console.error("notes GET failed", err);
    return NextResponse.json({ storage: "local", notes: {} });
  }
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "חסר מזהה מודעה" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.slice(0, 5000) : "";
  const status = typeof body.status === "string" ? body.status.slice(0, 40) : "";

  if (!hasDb) {
    return NextResponse.json({ storage: "local" }, { status: 200 });
  }

  try {
    const saved = await writeNote(body.id, note, status);
    return NextResponse.json({ storage: "postgres", note: saved });
  } catch (err) {
    console.error("notes PUT failed", err);
    return NextResponse.json({ storage: "local" }, { status: 200 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "חסר מזהה מודעה" }, { status: 400 });
  }
  if (!hasDb) {
    return NextResponse.json({ storage: "local" });
  }
  try {
    await deleteNote(id);
    return NextResponse.json({ storage: "postgres" });
  } catch (err) {
    console.error("notes DELETE failed", err);
    return NextResponse.json({ storage: "local" });
  }
}
