import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const year = parseInt(searchParams.get("year") || "2026");
  const type = searchParams.get("type") || "DP";
  const clientId = searchParams.get("clientId");
  const clientCode = searchParams.get("client");
  const brand = searchParams.get("brand");
  const kae = searchParams.get("kae");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: Record<string, unknown> = { year, type };
  if (clientId) where.clientId = clientId;

  const clientWhere: Record<string, unknown> = {};
  if (clientCode) clientWhere.code = clientCode;
  if (kae) clientWhere.kae = kae;
  if (Object.keys(clientWhere).length > 0) where.client = clientWhere;

  if (brand) where.sku = { brand };

  const [records, total] = await Promise.all([
    prisma.forecastRecord.findMany({
      where,
      include: {
        client: { select: { code: true, name: true, kae: true } },
        sku: { select: { code: true, brand: true, description: true, convC9L: true } },
      },
      orderBy: [{ client: { name: "asc" } }, { sku: { brand: "asc" } }, { month: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.forecastRecord.count({ where }),
  ]);

  return NextResponse.json({ records, total, page, limit });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, soInputKae, siInputKae, modifiedBy } = body;

  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const updated = await prisma.forecastRecord.update({
    where: { id },
    data: {
      ...(soInputKae !== undefined && { soInputKae: parseFloat(soInputKae) }),
      ...(siInputKae !== undefined && { siInputKae: parseFloat(siInputKae) }),
      ...(modifiedBy && { modifiedBy }),
    },
    include: {
      client: { select: { code: true, name: true, kae: true } },
      sku: { select: { code: true, brand: true, description: true } },
    },
  });

  return NextResponse.json(updated);
}
