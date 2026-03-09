import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const year = parseInt(searchParams.get("year") || "2026");

  const config = await prisma.forecastConfig.findFirst();
  const lastClosed = config?.lastClosedMonth || 0;
  const prevYear = year - 1;

  const [
    totalSkus,
    totalClients,
    soCurrentYear,
    soPrevYear,
    aopCurrentYear,
    aopPrevYear,
    dpForecast,
    comForecast,
    siCurrentYear,
    topBrandsFcst,
    topKaesFcst,
    inventoryAgg,
  ] = await Promise.all([
    prisma.sku.count(),
    prisma.client.count(),
    // SO current year by month
    prisma.sellOutRecord.groupBy({
      by: ["month"],
      where: { year },
      _sum: { c9l: true },
      orderBy: { month: "asc" },
    }),
    // SO previous year by month
    prisma.sellOutRecord.groupBy({
      by: ["month"],
      where: { year: prevYear },
      _sum: { c9l: true },
      orderBy: { month: "asc" },
    }),
    // AOP current year
    prisma.aopRecord.groupBy({
      by: ["month"],
      where: { year },
      _sum: { value: true },
      orderBy: { month: "asc" },
    }),
    // AOP previous year (fallback)
    prisma.aopRecord.groupBy({
      by: ["month"],
      where: { year: prevYear },
      _sum: { value: true },
      orderBy: { month: "asc" },
    }),
    // DP forecast by month
    prisma.forecastRecord.groupBy({
      by: ["month"],
      where: { year, type: "DP" },
      _sum: { soForecast: true, siForecast: true },
      orderBy: { month: "asc" },
    }),
    // COM forecast by month (with overrides)
    prisma.forecastRecord.findMany({
      where: { year, type: "COM" },
      select: { month: true, soForecast: true, soInputKae: true },
    }),
    // Sell In current year
    prisma.sellInRecord.groupBy({
      by: ["month"],
      where: { year },
      _sum: { c9l: true },
      orderBy: { month: "asc" },
    }),
    // Top brands by DP forecast
    prisma.forecastRecord.findMany({
      where: { year, type: "DP" },
      select: { soForecast: true, sku: { select: { brand: true } } },
    }),
    // DP by KAE
    prisma.forecastRecord.findMany({
      where: { year, type: "DP" },
      select: { soForecast: true, client: { select: { kae: true } } },
    }),
    // Inventory last closed
    prisma.inventoryRecord.aggregate({
      where: { year: prevYear, month: lastClosed > 0 ? lastClosed : 1 },
      _sum: { quantity: true },
    }),
  ]);

  // Build monthly maps
  const soByMonth: Record<number, number> = {};
  for (const r of soCurrentYear) soByMonth[r.month] = r._sum.c9l || 0;

  const soPrevByMonth: Record<number, number> = {};
  for (const r of soPrevYear) soPrevByMonth[r.month] = r._sum.c9l || 0;

  const aopData = aopCurrentYear.length > 0 ? aopCurrentYear : aopPrevYear;
  const aopYear = aopCurrentYear.length > 0 ? year : prevYear;
  const aopByMonth: Record<number, number> = {};
  for (const r of aopData) aopByMonth[r.month] = r._sum.value || 0;

  const dpByMonth: Record<number, number> = {};
  const siDpByMonth: Record<number, number> = {};
  for (const r of dpForecast) {
    dpByMonth[r.month] = r._sum.soForecast || 0;
    siDpByMonth[r.month] = r._sum.siForecast || 0;
  }

  const comByMonth: Record<number, number> = {};
  let comOverrides = 0;
  for (const r of comForecast) {
    const val = r.soInputKae ?? r.soForecast;
    comByMonth[r.month] = (comByMonth[r.month] || 0) + val;
    if (r.soInputKae != null) comOverrides++;
  }

  const siByMonth: Record<number, number> = {};
  for (const r of siCurrentYear) siByMonth[r.month] = r._sum.c9l || 0;

  // Totals
  const sum = (obj: Record<number, number>) => Object.values(obj).reduce((s, v) => s + v, 0);
  const soTotal = sum(soByMonth);
  const soPrevTotal = sum(soPrevByMonth);
  const aopTotal = sum(aopByMonth);
  const dpTotal = sum(dpByMonth);
  const comTotal = sum(comByMonth);
  const siTotal = sum(siByMonth);
  const siDpTotal = sum(siDpByMonth);
  const inventory = inventoryAgg._sum.quantity || 0;

  // Brand totals
  const brandTotals: Record<string, number> = {};
  for (const r of topBrandsFcst) {
    brandTotals[r.sku.brand] = (brandTotals[r.sku.brand] || 0) + r.soForecast;
  }
  const topBrands = Object.entries(brandTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([brand, total]) => ({ brand, total }));

  // KAE totals
  const kaeTotals: Record<string, number> = {};
  for (const r of topKaesFcst) {
    kaeTotals[r.client.kae] = (kaeTotals[r.client.kae] || 0) + r.soForecast;
  }
  const topKaes = Object.entries(kaeTotals)
    .sort(([, a], [, b]) => b - a)
    .map(([kae, total]) => ({ kae, total }));

  // Accuracy: for closed months, compare forecast vs actual SO
  let accuracyPct: number | null = null;
  if (lastClosed > 0) {
    let fcstClosed = 0;
    let soClosed = 0;
    for (let m = 1; m <= lastClosed; m++) {
      fcstClosed += dpByMonth[m] || 0;
      soClosed += soByMonth[m] || 0;
    }
    if (fcstClosed > 0) {
      accuracyPct = Math.max(0, 100 - Math.abs((fcstClosed - soClosed) / fcstClosed) * 100);
    }
  }

  return NextResponse.json({
    totalSkus,
    totalClients,
    currentYear: config?.currentYear || year,
    lastClosedMonth: lastClosed,
    remainingMonths: config?.remainingMonths || 12,
    prevYear,
    aopYear,
    soByMonth,
    soPrevByMonth,
    aopByMonth,
    dpByMonth,
    comByMonth,
    siByMonth,
    siDpByMonth,
    soTotal,
    soPrevTotal,
    aopTotal,
    dpTotal,
    comTotal,
    siTotal,
    siDpTotal,
    inventory,
    comOverrides,
    comTotalRecords: comForecast.length,
    topBrands,
    topKaes,
    accuracyPct,
  });
}
