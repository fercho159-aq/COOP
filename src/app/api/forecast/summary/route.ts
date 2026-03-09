import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const year = parseInt(searchParams.get("year") || "2026");
  const brand = searchParams.get("brand");
  const kae = searchParams.get("kae");
  const clientCode = searchParams.get("client");

  const relFilter: Record<string, unknown> = {};
  const skuWhere: Record<string, unknown> = {};
  const clientWhere: Record<string, unknown> = {};
  if (brand) skuWhere.brand = brand;
  if (clientCode) clientWhere.code = clientCode;
  if (kae) clientWhere.kae = kae;
  if (Object.keys(skuWhere).length > 0) relFilter.sku = skuWhere;
  if (Object.keys(clientWhere).length > 0) relFilter.client = clientWhere;

  // DP forecast by month
  const dpRecords = await prisma.forecastRecord.findMany({
    where: { year, type: "DP", ...relFilter },
    select: { month: true, soForecast: true },
  });
  const dpByMonth: Record<number, number> = {};
  for (const r of dpRecords) {
    dpByMonth[r.month] = (dpByMonth[r.month] || 0) + r.soForecast;
  }

  // COM forecast by month (with KAE overrides)
  const comRecords = await prisma.forecastRecord.findMany({
    where: { year, type: "COM", ...relFilter },
    select: { month: true, soForecast: true, soInputKae: true },
  });
  const comByMonth: Record<number, number> = {};
  let overrideCount = 0;
  for (const r of comRecords) {
    const val = r.soInputKae ?? r.soForecast;
    comByMonth[r.month] = (comByMonth[r.month] || 0) + val;
    if (r.soInputKae != null) overrideCount++;
  }

  // Sell Out for the selected year
  const soRecords = await prisma.sellOutRecord.findMany({
    where: { year, ...relFilter },
    select: { month: true, c9l: true },
  });
  const soByMonth: Record<number, number> = {};
  for (const r of soRecords) {
    soByMonth[r.month] = (soByMonth[r.month] || 0) + r.c9l;
  }

  // AOP: try selected year first, fallback to year-1
  let aopRecords = await prisma.aopRecord.findMany({
    where: { year, ...relFilter },
    select: { month: true, value: true },
  });
  let aopYear = year;
  if (aopRecords.length === 0) {
    aopRecords = await prisma.aopRecord.findMany({
      where: { year: year - 1, ...relFilter },
      select: { month: true, value: true },
    });
    aopYear = year - 1;
  }
  const aopByMonth: Record<number, number> = {};
  for (const r of aopRecords) {
    aopByMonth[r.month] = (aopByMonth[r.month] || 0) + r.value;
  }

  // Sell Out previous year (for comparison)
  const soPrevRecords = await prisma.sellOutRecord.findMany({
    where: { year: year - 1, ...relFilter },
    select: { month: true, c9l: true },
  });
  const soPrevByMonth: Record<number, number> = {};
  for (const r of soPrevRecords) {
    soPrevByMonth[r.month] = (soPrevByMonth[r.month] || 0) + r.c9l;
  }

  // COM by brand (top 10)
  const comByBrand = await prisma.forecastRecord.findMany({
    where: { year, type: "COM", ...relFilter },
    select: { soForecast: true, soInputKae: true, sku: { select: { brand: true } } },
  });
  const brandTotals: Record<string, number> = {};
  for (const r of comByBrand) {
    const val = r.soInputKae ?? r.soForecast;
    brandTotals[r.sku.brand] = (brandTotals[r.sku.brand] || 0) + val;
  }
  const topBrands = Object.entries(brandTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([brand, total]) => ({ brand, total }));

  // COM by KAE
  const comByKae = await prisma.forecastRecord.findMany({
    where: { year, type: "COM", ...relFilter },
    select: { soForecast: true, soInputKae: true, client: { select: { kae: true } } },
  });
  const kaeTotals: Record<string, number> = {};
  for (const r of comByKae) {
    const val = r.soInputKae ?? r.soForecast;
    kaeTotals[r.client.kae] = (kaeTotals[r.client.kae] || 0) + val;
  }
  const topKaes = Object.entries(kaeTotals)
    .sort(([, a], [, b]) => b - a)
    .map(([kae, total]) => ({ kae, total }));

  const config = await prisma.forecastConfig.findFirst();

  return NextResponse.json({
    dpByMonth,
    comByMonth,
    soByMonth,
    soPrevByMonth,
    aopByMonth,
    aopYear,
    topBrands,
    topKaes,
    overrideCount,
    totalComRecords: comRecords.length,
    year,
    config: config
      ? { currentYear: config.currentYear, lastClosedMonth: config.lastClosedMonth }
      : null,
  });
}
