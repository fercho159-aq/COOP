import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type");

  if (type === "brands") {
    const brands = await prisma.sku.findMany({
      select: { brand: true },
      distinct: ["brand"],
      orderBy: { brand: "asc" },
    });
    return NextResponse.json(brands.map((b) => b.brand));
  }

  if (type === "kaes") {
    const kaes = await prisma.client.findMany({
      select: { kae: true },
      distinct: ["kae"],
      orderBy: { kae: "asc" },
    });
    return NextResponse.json(kaes.map((k) => k.kae));
  }

  if (type === "clients") {
    const clients = await prisma.client.findMany({
      select: { id: true, code: true, name: true, kae: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(clients);
  }

  if (type === "skus") {
    const skus = await prisma.sku.findMany({
      select: { id: true, code: true, brand: true, description: true },
      orderBy: [{ brand: "asc" }, { code: "asc" }],
    });
    return NextResponse.json(skus);
  }

  return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
}
