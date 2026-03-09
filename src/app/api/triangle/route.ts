import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const year = parseInt(searchParams.get("year") || "2026");
  const brand = searchParams.get("brand");
  const skuCode = searchParams.get("sku");
  const clientCode = searchParams.get("client");
  const kae = searchParams.get("kae");

  const skuWhere: Record<string, unknown> = {};
  const clientWhere: Record<string, unknown> = {};
  if (brand) skuWhere.brand = brand;
  if (skuCode) skuWhere.code = skuCode;
  if (clientCode) clientWhere.code = clientCode;
  if (kae) clientWhere.kae = kae;

  const relFilter = {
    ...(Object.keys(skuWhere).length > 0 && { sku: skuWhere }),
    ...(Object.keys(clientWhere).length > 0 && { client: clientWhere }),
  };

  // AOP
  const aopRecords = await prisma.aopRecord.findMany({
    where: { year, ...relFilter },
  });
  const aopByMonth: Record<number, number> = {};
  for (const r of aopRecords) {
    aopByMonth[r.month] = (aopByMonth[r.month] || 0) + r.value;
  }

  // Sell Out for the selected year
  const soRecords = await prisma.sellOutRecord.findMany({
    where: { year, ...relFilter },
  });
  const soByMonth: Record<number, number> = {};
  for (const r of soRecords) {
    soByMonth[r.month] = (soByMonth[r.month] || 0) + r.c9l;
  }

  // Sell Out for previous years (for comparison)
  const prevYears = [year - 1, year - 2].filter((y) => y >= 2023);
  const prevSoData: Record<number, Record<number, number>> = {};
  if (prevYears.length > 0) {
    const prevRecords = await prisma.sellOutRecord.findMany({
      where: { year: { in: prevYears }, ...relFilter },
    });
    for (const r of prevRecords) {
      if (!prevSoData[r.year]) prevSoData[r.year] = {};
      prevSoData[r.year][r.month] = (prevSoData[r.year][r.month] || 0) + r.c9l;
    }
  }

  // Sell In for the selected year
  const siRecords = await prisma.sellInRecord.findMany({
    where: { year, ...relFilter },
  });
  const siByMonth: Record<number, number> = {};
  for (const r of siRecords) {
    siByMonth[r.month] = (siByMonth[r.month] || 0) + r.c9l;
  }

  // All forecast versions
  const forecasts = await prisma.forecastRecord.findMany({
    where: { year, type: "DP", ...relFilter },
    orderBy: [{ version: "asc" }, { month: "asc" }],
  });

  const versionMap: Record<number, Record<number, number>> = {};
  for (const f of forecasts) {
    if (!versionMap[f.version]) versionMap[f.version] = {};
    versionMap[f.version][f.month] = (versionMap[f.version][f.month] || 0) + f.soForecast;
  }

  const monthLabels = [
    "", "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
    "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
  ];

  // Build rows
  const rows = [
    { label: `AOP ${year}`, type: "aop", values: aopByMonth },
    { label: "SELL OUT", type: "sellout", values: soByMonth },
    { label: "SELL IN", type: "sellin", values: siByMonth },
    ...Object.entries(versionMap)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([ver, values]) => ({
        label: `FCST ${ver} ${monthLabels[parseInt(ver)] || "LIVE"}`,
        type: "forecast",
        version: parseInt(ver),
        values,
      })),
  ];

  // Previous years SO rows
  const prevYearRows = Object.entries(prevSoData)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([yr, values]) => ({
      label: `SO ${yr}`,
      type: "prev_so",
      values,
    }));

  // Available years with data
  const yearsWithData = await prisma.sellOutRecord.groupBy({
    by: ["year"],
    orderBy: { year: "asc" },
  });
  const availableYears = yearsWithData.map((y) => y.year);
  const config = await prisma.forecastConfig.findFirst();
  if (config && !availableYears.includes(config.currentYear)) {
    availableYears.push(config.currentYear);
  }

  // Build forecast metadata for tooltips
  // Aggregate inputs that the engine used to calculate
  const lastClosed = config?.lastClosedMonth || 0;
  const previousYear = year - 1;
  let forecastMeta = null;

  if (config && year === config.currentYear) {
    // Load aggregate SO for CY (previousYear) and LY (previousYear-1)
    const [soCY, soLY, invAgg, swCount] = await Promise.all([
      prisma.sellOutRecord.findMany({
        where: { year: previousYear, month: { lte: lastClosed }, ...relFilter },
        select: { c9l: true, month: true },
      }),
      prisma.sellOutRecord.findMany({
        where: { year: previousYear - 1, month: { lte: lastClosed }, ...relFilter },
        select: { c9l: true, month: true },
      }),
      prisma.inventoryRecord.aggregate({
        where: { year: previousYear, month: lastClosed, ...relFilter },
        _sum: { quantity: true },
      }),
      prisma.seasonalWeight.count({
        where: { remainingMonths: 12 - lastClosed },
      }),
    ]);

    // Full year LY for annual estimate
    const soLYFull = await prisma.sellOutRecord.findMany({
      where: { year: previousYear - 1, ...relFilter },
      select: { c9l: true },
    });

    const cyTotal = soCY.reduce((s, r) => s + r.c9l, 0);
    const lyTotal = soLY.reduce((s, r) => s + r.c9l, 0);
    const cyMonths = new Set(soCY.map((r) => r.month)).size;
    const lyMonths = new Set(soLY.map((r) => r.month)).size;
    const cyAvg = cyMonths > 0 ? cyTotal / cyMonths : 0;
    const lyAvg = lyMonths > 0 ? lyTotal / lyMonths : 0;
    const lyAnnualTotal = soLYFull.reduce((s, r) => s + r.c9l, 0);
    const inventory = invAgg._sum.quantity || 0;

    let method = "sin_datos";
    let annualEstimate = 0;
    let growthFactor = 0;

    if (cyAvg === 0 && lyAvg === 0) {
      method = "sin_datos";
    } else if (lyAvg === 0) {
      method = "solo_ano_corriente";
      annualEstimate = cyAvg * 12;
    } else {
      method = "factor_crecimiento";
      growthFactor = cyAvg > 0 ? cyAvg / lyAvg : 1;
      annualEstimate = lyAnnualTotal * growthFactor;
    }

    const ytdSO = cyTotal;
    let pendingVolume = 0;
    if (annualEstimate > ytdSO) {
      pendingVolume = annualEstimate - ytdSO;
    } else {
      const ytdRate = lastClosed > 0 ? ytdSO / lastClosed : 0;
      annualEstimate = ytdRate * 12;
      pendingVolume = Math.max(0, annualEstimate - ytdSO);
    }

    forecastMeta = {
      method,
      lastClosedMonth: lastClosed,
      previousYear,
      previousYear2: previousYear - 1,
      soCurrentYear: { year: previousYear, total: cyTotal, months: cyMonths, avg: cyAvg },
      soLastYear: { year: previousYear - 1, total: lyTotal, months: lyMonths, avg: lyAvg, annualTotal: lyAnnualTotal },
      growthFactor,
      annualEstimate,
      ytdSO,
      pendingVolume,
      remainingMonths: 12 - lastClosed,
      inventory,
      seasonalWeightsCount: swCount,
    };
  }

  return NextResponse.json({
    rows,
    prevYearRows,
    year,
    availableYears: availableYears.sort(),
    config: config
      ? { currentYear: config.currentYear, lastClosedMonth: config.lastClosedMonth }
      : null,
    forecastMeta,
  });
}
