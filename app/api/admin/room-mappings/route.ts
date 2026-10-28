// Room-mapping admin API (adapter Phase 3, multi-tenant core). Every method
// requires the session cookie; owners touch only their own property's
// rows. One row per room per property; rows govern the chat catalogue for
// any property that has them.
//   GET   ?propertyId= -> rows (400 without it)
//   POST  -> { propertyId, slug, name, basePricePoisha, suiteRoomId,
//             highlights[] } creates (409 on dup slug)
//   PATCH -> { id, ...fields } updates one row
//   DELETE -> { id } removes one row
// Seeding from the demo file lives at POST .../room-mappings/seed.
// Room IDs are opaque backend identifiers (usually UUIDs, never enforced).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, sessionCan } from "@/lib/tenant";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cleanRoom(body: Record<string, unknown>):
  | { ok: true; room: { slug: string; name: string; basePricePoisha: number; suiteRoomId: string; highlights: string[] } }
  | { ok: false; error: string } {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const basePricePoisha = body.basePricePoisha;
  const suiteRoomId = typeof body.suiteRoomId === "string" ? body.suiteRoomId.trim() : "";
  const highlights = body.highlights;
  if (!SLUG_RE.test(slug) || slug.length > 60) {
    return { ok: false, error: "Slug must look like bamboo-cottage (lowercase, dashes, max 60)." };
  }
  if (!name || name.length > 100) {
    return { ok: false, error: "Name is required (max 100 characters)." };
  }
  if (
    typeof basePricePoisha !== "number" ||
    !Number.isInteger(basePricePoisha) ||
    basePricePoisha <= 0 ||
    basePricePoisha > 100_000_000
  ) {
    return { ok: false, error: "Price must be a positive integer poisha amount." };
  }
  if (!suiteRoomId || suiteRoomId.length > 100) {
    return { ok: false, error: "Backend room ID is required (max 100 characters)." };
  }
  if (
    !Array.isArray(highlights) ||
    highlights.length > 6 ||
    highlights.some((h) => typeof h !== "string" || h.length > 80)
  ) {
    return { ok: false, error: "Highlights must be up to 6 short strings." };
  }
  return { ok: true, room: { slug, name, basePricePoisha, suiteRoomId, highlights } };
}

function shape(row: {
  id: string;
  propertyId: string;
  slug: string;
  name: string;
  basePricePoisha: number;
  suiteRoomId: string;
  highlights: string[];
}) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    slug: row.slug,
    name: row.name,
    basePricePoisha: row.basePricePoisha,
    suiteRoomId: row.suiteRoomId,
    highlights: row.highlights,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const propertyId = req.nextUrl.searchParams.get("propertyId") ?? "";
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId query is required." }, { status: 400 });
  }
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
  }
  const rows = await prisma.roomMapping.findMany({
    where: { propertyId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(rows.map(shape));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const propertyId =
    body && typeof body.propertyId === "string" ? body.propertyId.trim() : "";
  if (!propertyId || propertyId.length > 100) {
    return NextResponse.json({ error: "Property ID is required (max 100 characters)." }, { status: 400 });
  }
  if (!sessionCan(session, propertyId)) {
    return NextResponse.json({ error: "Not authorized for this property." }, { status: 403 });
  }
  const cleaned = cleanRoom(body ?? {});
  if (!cleaned.ok) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }
  const existing = await prisma.roomMapping.findUnique({
    where: { propertyId_slug: { propertyId, slug: cleaned.room.slug } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "That slug already exists for this property — edit it instead." },
      { status: 409 }
    );
  }
  const row = await prisma.roomMapping.create({ data: { propertyId, ...cleaned.room } });
  return NextResponse.json(shape(row), { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = body && typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Row id is required." }, { status: 400 });
  }
  const existing = await prisma.roomMapping.findUnique({ where: { id } });
  if (!existing || !sessionCan(session, existing.propertyId)) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }
  const merged = {
    slug: body?.slug ?? existing.slug,
    name: body?.name ?? existing.name,
    basePricePoisha: body?.basePricePoisha ?? existing.basePricePoisha,
    suiteRoomId: body?.suiteRoomId ?? existing.suiteRoomId,
    highlights: body?.highlights ?? existing.highlights,
  };
  const cleaned = cleanRoom(merged);
  if (!cleaned.ok) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }
  if (cleaned.room.slug !== existing.slug) {
    const clash = await prisma.roomMapping.findUnique({
      where: { propertyId_slug: { propertyId: existing.propertyId, slug: cleaned.room.slug } },
    });
    if (clash) {
      return NextResponse.json({ error: "That slug already exists for this property." }, { status: 409 });
    }
  }
  const row = await prisma.roomMapping.update({ where: { id }, data: cleaned.room });
  return NextResponse.json(shape(row));
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = body && typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Row id is required." }, { status: 400 });
  }
  const current = await prisma.roomMapping.findUnique({ where: { id } });
  if (!current || !sessionCan(session, current.propertyId)) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }
  await prisma.roomMapping.delete({ where: { id } });
  return NextResponse.json({ deleted: true, slug: current.slug });
}
