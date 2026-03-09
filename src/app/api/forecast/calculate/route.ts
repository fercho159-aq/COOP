import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateForecast } from "@/lib/forecast-engine";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { clientId, skuId, year, version, bulk } = body;

  // Bulk calculation: all client+sku combos
  if (bulk) {
    const count = await calculateAll(year);
    return NextResponse.json({ bulk: true, calculated: count });
  }

  // Single calculation
  if (!clientId || !skuId) {
    return NextResponse.json({ error: "clientId y skuId son requeridos" }, { status: 400 });
  }

  const config = await prisma.forecastConfig.findFirst();
  const lastClosedMonth = config?.lastClosedMonth || 1;
  const currentYear = year || config?.currentYear || 2026;
  const previousYear = currentYear - 1;

  const [soCurrentYear, soPreviousYear, weights, inventory] = await Promise.all([
    prisma.sellOutRecord.findMany({
      where: { clientId, skuId, year: previousYear },
      orderBy: { month: "asc" },
    }),
    prisma.sellOutRecord.findMany({
      where: { clientId, skuId, year: previousYear - 1 },
      orderBy: { month: "asc" },
    }),
    prisma.seasonalWeight.findMany({
      where: { remainingMonths: 12 - lastClosedMonth },
    }),
    prisma.inventoryRecord.findFirst({
      where: { clientId, skuId, year: previousYear, month: lastClosedMonth },
    }),
  ]);

  const seasonalWeights: Record<number, number> = {};
  for (const w of weights) {
    seasonalWeights[w.targetMonth] = w.weight;
  }

  const results = calculateForecast({
    currentYear,
    lastClosedMonth,
    soCurrentYear: soCurrentYear.map((s) => ({ year: s.year, month: s.month, c9l: s.c9l })),
    soPreviousYear: soPreviousYear.map((s) => ({ year: s.year, month: s.month, c9l: s.c9l })),
    seasonalWeights,
    inventoryC9L: inventory?.quantity || 0,
  });

  const ver = version || lastClosedMonth + 1;
  const upserted = await Promise.all(
    results.map((r) =>
      prisma.forecastRecord.upsert({
        where: {
          clientId_skuId_year_month_version_type: {
            clientId, skuId, year: currentYear, month: r.month, version: ver, type: "DP",
          },
        },
        update: { soForecast: r.soForecast, siForecast: r.siForecast },
        create: {
          clientId, skuId, year: currentYear, month: r.month, version: ver, type: "DP",
          soForecast: r.soForecast, siForecast: r.siForecast,
        },
      })
    )
  );

  return NextResponse.json({ results, upserted: upserted.length });
}

async function calculateAll(yearOverride?: number) {
  const config = await prisma.forecastConfig.findFirst();
  if (!config) throw new Error("ForecastConfig not found");

  const currentYear = yearOverride || config.currentYear;
  const previousYear = currentYear - 1;
  const lastClosedMonth = config.lastClosedMonth;
  const version = lastClosedMonth + 1;

  // Load all SO for previousYear (=CY for engine) and previousYear-1 (=LY for engine)
  const allSO = await prisma.sellOutRecord.findMany({
    where: { year: { in: [previousYear - 1, previousYear] } },
    select: { clientId: true, skuId: true, year: true, month: true, c9l: true },
  });

  // Seasonal weights
  const weights = await prisma.seasonalWeight.findMany({
    where: { remainingMonths: 12 - lastClosedMonth },
  });
  const seasonalWeights: Record<number, number> = {};
  for (const w of weights) seasonalWeights[w.targetMonth] = w.weight;

  // Inventory
  const allInventory = await prisma.inventoryRecord.findMany({
    where: { year: previousYear, month: lastClosedMonth },
    select: { clientId: true, skuId: true, quantity: true },
  });
  const invMap: Record<string, number> = {};
  for (const inv of allInventory) {
    invMap[`${inv.clientId}-${inv.skuId}`] = inv.quantity;
  }

  // Group SO by client+sku
  const soGroups: Record<string, { clientId: string; skuId: string; cy: { year: number; month: number; c9l: number }[]; ly: { year: number; month: number; c9l: number }[] }> = {};
  for (const s of allSO) {
    const key = `${s.clientId}-${s.skuId}`;
    if (!soGroups[key]) soGroups[key] = { clientId: s.clientId, skuId: s.skuId, cy: [], ly: [] };
    if (s.year === previousYear) {
      soGroups[key].cy.push(s);
    } else {
      soGroups[key].ly.push(s);
    }
  }

  // Delete existing DP and COM forecasts for this year+version before recalculating
  await prisma.forecastRecord.deleteMany({
    where: { year: currentYear, version, type: { in: ["DP", "COM"] } },
  });

  // Calculate and batch insert
  const allRecords: {
    clientId: string; skuId: string; year: number; month: number;
    version: number; type: string; soForecast: number; siForecast: number;
  }[] = [];

  for (const group of Object.values(soGroups)) {
    const inv = invMap[`${group.clientId}-${group.skuId}`] || 0;

    const results = calculateForecast({
      currentYear,
      lastClosedMonth,
      soCurrentYear: group.cy,
      soPreviousYear: group.ly,
      seasonalWeights,
      inventoryC9L: inv,
    });

    for (const r of results) {
      if (r.soForecast === 0 && r.siForecast === 0) continue;
      // DP record
      allRecords.push({
        clientId: group.clientId, skuId: group.skuId,
        year: currentYear, month: r.month, version, type: "DP",
        soForecast: r.soForecast, siForecast: r.siForecast,
      });
      // COM record (copy of DP, editable by KAEs)
      allRecords.push({
        clientId: group.clientId, skuId: group.skuId,
        year: currentYear, month: r.month, version, type: "COM",
        soForecast: r.soForecast, siForecast: r.siForecast,
      });
    }
  }

  const BATCH = 500;
  let total = 0;
  for (let i = 0; i < allRecords.length; i += BATCH) {
    const batch = allRecords.slice(i, i + BATCH);
    const result = await prisma.forecastRecord.createMany({ data: batch, skipDuplicates: true });
    total += result.count;
  }

  return total;
}
