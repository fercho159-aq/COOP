import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File;
  const importType = formData.get("type") as string;

  if (!file) {
    return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const results: Record<string, number> = {};

  try {
    if (importType === "skus" || importType === "all") {
      const count = await importSkus(workbook);
      results.skus = count;
    }

    if (importType === "clients" || importType === "all") {
      const count = await importClients(workbook);
      results.clients = count;
    }

    if (importType === "prices" || importType === "all") {
      const count = await importPrices(workbook);
      results.prices = count;
    }

    if (importType === "sellout" || importType === "all") {
      const count = await importSellOut(workbook, "SO LY");
      results.sellout = count;
    }

    if (importType === "sellin" || importType === "all") {
      const count = await importSellIn(workbook);
      results.sellin = count;
    }

    if (importType === "forecast_dp" || importType === "all") {
      const count = await importForecastDP(workbook);
      results.forecast_dp = count;
    }

    if (importType === "forecast_com" || importType === "all") {
      const count = await importForecastCom(workbook);
      results.forecast_com = count;
    }

    if (importType === "seasonal" || importType === "all") {
      const count = await importSeasonalWeights(workbook);
      results.seasonal = count;
    }

    return NextResponse.json({ success: true, imported: results });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: `Error en importación: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}

async function importSkus(workbook: XLSX.WorkBook): Promise<number> {
  // Try "Lista completa de SKUs y Client" or "Precios" sheet
  let sheet = workbook.Sheets["Precios"];
  if (!sheet) sheet = workbook.Sheets[Object.keys(workbook.Sheets)[0]];

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 0 });
  let count = 0;

  for (const row of data) {
    const code = String(row["SKU"] || "").trim();
    if (!code || code === "SKU") continue;

    const brand = String(row["Marca"] || row["MARCAS"] || "").trim();
    const category = String(row["Categoría"] || row["CATEGRIA"] || "").trim();
    const variant = String(row["Variante"] || "").trim();
    const ml = parseInt(String(row["ml"] || "750")) || 750;
    const unitsPerBox = parseInt(String(row["Botellas x Caja"] || "6")) || 6;

    // Description from various possible column names
    const description = String(
      row["Variante"] || row["Descripción"] || row["PRODUCTO"] || `${brand} ${variant}`
    ).trim();

    try {
      await prisma.sku.upsert({
        where: { code },
        update: { brand, category, variant, description, ml, unitsPerBox },
        create: { code, brand, category, variant, description, ml, unitsPerBox },
      });
      count++;
    } catch {
      // Skip duplicates or errors
    }
  }

  return count;
}

async function importClients(workbook: XLSX.WorkBook): Promise<number> {
  const sheetName = Object.keys(workbook.Sheets).find(
    (s) => s.includes("CLIENTES") || s.includes("Cliente") || s.includes("Lista")
  );
  if (!sheetName) return 0;

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 2 });
  let count = 0;

  for (const row of data) {
    const code = String(row["CODIGO FORECAST"] || row["C_HIJO"] || "").trim();
    if (!code || code.length < 3) continue;

    const familyCode = String(row["C_FAMILIA"] || code.replace(/[A-Z]$/, "")).trim();
    const name = String(row["CLIENTE"] || row["CLIENTE OK"] || "").trim();
    const kae = String(row["KAE"] || "").trim();

    if (!name) continue;

    try {
      await prisma.client.upsert({
        where: { code },
        update: { familyCode, name, kae },
        create: { code, familyCode, name, kae },
      });
      count++;
    } catch {
      // Skip
    }
  }

  return count;
}

async function importPrices(workbook: XLSX.WorkBook): Promise<number> {
  const sheet = workbook.Sheets["Precios"];
  if (!sheet) return 0;

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 0 });
  let count = 0;

  for (const row of data) {
    const skuCode = String(row["SKU"] || "").trim();
    if (!skuCode || skuCode === "SKU") continue;

    const sku = await prisma.sku.findUnique({ where: { code: skuCode } });
    if (!sku) continue;

    const listVersion = String(row["LISTA"] || "L1").trim();

    try {
      await prisma.price.upsert({
        where: { skuId_listVersion: { skuId: sku.id, listVersion } },
        update: {
          rspEspecializados: parseFloat(String(row["RSP Especializados"] || "0")) || null,
          rspModerno: parseFloat(String(row["RSP Moderno"] || "0")) || null,
          priceWithTax: parseFloat(String(row["Precio Lista c/Impuestos"] || "0")) || null,
          pricePerPcNoTax: parseFloat(String(row["Precio Pz Esp Lista s/Impuestos"] || "0")) || null,
          pricePerBoxNoTax: parseFloat(String(row["Precio Caja s/Impuestos"] || "0")) || null,
        },
        create: {
          skuId: sku.id,
          listVersion,
          effectiveDate: new Date(),
          rspEspecializados: parseFloat(String(row["RSP Especializados"] || "0")) || null,
          rspModerno: parseFloat(String(row["RSP Moderno"] || "0")) || null,
          priceWithTax: parseFloat(String(row["Precio Lista c/Impuestos"] || "0")) || null,
          pricePerPcNoTax: parseFloat(String(row["Precio Pz Esp Lista s/Impuestos"] || "0")) || null,
          pricePerBoxNoTax: parseFloat(String(row["Precio Caja s/Impuestos"] || "0")) || null,
        },
      });
      count++;
    } catch {
      // Skip
    }
  }

  return count;
}

async function importSellOut(workbook: XLSX.WorkBook, sheetName: string): Promise<number> {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return 0;

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 0 });
  let count = 0;

  // Get all clients and SKUs for lookup
  const clients = await prisma.client.findMany();
  const skus = await prisma.sku.findMany();
  const clientMap = Object.fromEntries(clients.map((c) => [c.code, c.id]));
  const skuMap = Object.fromEntries(skus.map((s) => [s.code, s.id]));

  for (const row of data) {
    const clientCode = String(row["Cod Cliente Forecast"] || row["COD. CLIENTE"] || "").trim();
    const skuCode = String(row["SKU"] || "").trim();
    const year = parseInt(String(row["Año"] || "0"));
    const month = parseInt(String(row["Mes_Numero"] || "0"));

    const clientId = clientMap[clientCode];
    const skuId = skuMap[skuCode];

    if (!clientId || !skuId || !year || !month) continue;

    const bottles = parseFloat(String(row["SO Botella"] || "0")) || 0;
    const c9l = parseFloat(String(row["SO_C9L"] || "0")) || 0;
    const inBottles = parseFloat(String(row["IN Botella"] || "0")) || 0;
    const invC9l = parseFloat(String(row["INV_C9L"] || "0")) || 0;

    try {
      await prisma.sellOutRecord.upsert({
        where: { clientId_skuId_year_month: { clientId, skuId, year, month } },
        update: { bottles, c9l, inBottles, invC9l },
        create: { clientId, skuId, year, month, bottles, c9l, inBottles, invC9l },
      });
      count++;
    } catch {
      // Skip
    }
  }

  return count;
}

async function importSellIn(workbook: XLSX.WorkBook): Promise<number> {
  const sheet = workbook.Sheets["SI LY"] || workbook.Sheets["SOLPED"];
  if (!sheet) return 0;

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 3 });
  let count = 0;

  const clients = await prisma.client.findMany();
  const skus = await prisma.sku.findMany();
  const clientMap = Object.fromEntries(clients.map((c) => [c.code, c.id]));
  const skuMap = Object.fromEntries(skus.map((s) => [s.code, s.id]));

  const monthMap: Record<string, number> = {
    ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
    JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
  };

  for (const row of data) {
    const clientCode = String(row["ID CLIENTE"] || "").trim();
    const skuCode = String(row["ID SKU"] || "").trim();
    const mesStr = String(row["MES"] || "").toUpperCase().trim();
    const month = monthMap[mesStr] || 0;

    const clientId = clientMap[clientCode];
    const skuId = skuMap[skuCode];

    if (!clientId || !skuId || !month) continue;

    const pieces = parseFloat(String(row["PIEZAS PEDIDO"] || "0")) || 0;
    const boxes = parseFloat(String(row["PRODUCTO"] || "0")) || 0;
    const c9l = parseFloat(String(row["C9L"] || "0")) || 0;

    try {
      await prisma.sellInRecord.create({
        data: {
          clientId,
          skuId,
          year: 2025,
          month,
          pieces,
          boxes,
          c9l,
        },
      });
      count++;
    } catch {
      // Skip
    }
  }

  return count;
}

async function importForecastDP(workbook: XLSX.WorkBook): Promise<number> {
  const sheet = workbook.Sheets["Fcst DP"];
  if (!sheet) return 0;

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 8 });
  let count = 0;

  const clients = await prisma.client.findMany();
  const skus = await prisma.sku.findMany();
  const clientMap = Object.fromEntries(clients.map((c) => [c.code, c.id]));
  const skuMap = Object.fromEntries(skus.map((s) => [s.code, s.id]));

  const config = await prisma.forecastConfig.findFirst();
  const version = (config?.lastClosedMonth || 0) + 1;

  const soMonthCols = [
    "SO FCST\nENE", "SO FCST\nFEB", "SO FCST\nMAR", "SO FCST\nABR",
    "SO FCST\nMAY", "SO FCST\nJUN", "SO FCST\nJUL", "SO FCST\nAGO",
    "SO FCST\nSEP", "SO FCST\nOCT", "SO FCST\nNOV", "SO FCST\nDIC",
  ];

  const siMonthCols = [
    "SI FCST\nENE", "SI FCST\nFEB", "SI FCST\nMAR", "SI FCST\nABR",
    "SI FCST\nMAY", "SI FCST\nJUN", "SI FCST\nJUL", "SI FCST\nAGO",
    "SI FCST\nSEP", "SI FCST\nOCT", "SI FCST\nNOV", "SI FCST\nDIC",
  ];

  for (const row of data) {
    const clientCode = String(row["C_Cliente_Hijo Forecast"] || "").trim();
    const skuCode = String(row["Sku"] || "").trim();

    const clientId = clientMap[clientCode];
    const skuId = skuMap[skuCode];
    if (!clientId || !skuId) continue;

    for (let m = 0; m < 12; m++) {
      const so = parseFloat(String(row[soMonthCols[m]] || "0")) || 0;
      const si = parseFloat(String(row[siMonthCols[m]] || "0")) || 0;
      if (so === 0 && si === 0) continue;

      try {
        await prisma.forecastRecord.upsert({
          where: {
            clientId_skuId_year_month_version_type: {
              clientId, skuId, year: 2026, month: m + 1, version, type: "DP",
            },
          },
          update: { soForecast: so, siForecast: si },
          create: {
            clientId, skuId, year: 2026, month: m + 1, version, type: "DP",
            soForecast: so, siForecast: si,
          },
        });
        count++;
      } catch {
        // Skip
      }
    }
  }

  return count;
}

async function importForecastCom(workbook: XLSX.WorkBook): Promise<number> {
  const sheet = workbook.Sheets["Fcst Comercial"];
  if (!sheet) return 0;

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 7 });
  let count = 0;

  const clients = await prisma.client.findMany();
  const skus = await prisma.sku.findMany();
  const clientMap = Object.fromEntries(clients.map((c) => [c.code, c.id]));
  const skuMap = Object.fromEntries(skus.map((s) => [s.code, s.id]));

  const config = await prisma.forecastConfig.findFirst();
  const version = (config?.lastClosedMonth || 0) + 1;

  const monthCols = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

  for (const row of data) {
    const clientCode = String(row["C_Cliente_FCST"] || "").trim();
    const skuCode = String(row["Sku"] || "").trim();

    const clientId = clientMap[clientCode];
    const skuId = skuMap[skuCode];
    if (!clientId || !skuId) continue;

    for (let m = 0; m < 12; m++) {
      const so = parseFloat(String(row[monthCols[m]] || "0")) || 0;
      if (so === 0) continue;

      try {
        await prisma.forecastRecord.upsert({
          where: {
            clientId_skuId_year_month_version_type: {
              clientId, skuId, year: 2026, month: m + 1, version, type: "COM",
            },
          },
          update: { soForecast: so },
          create: {
            clientId, skuId, year: 2026, month: m + 1, version, type: "COM", soForecast: so,
          },
        });
        count++;
      } catch {
        // Skip
      }
    }
  }

  return count;
}

async function importSeasonalWeights(workbook: XLSX.WorkBook): Promise<number> {
  const sheet = workbook.Sheets["Ponderación Sell Out"];
  if (!sheet) return 0;

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 0 });
  let count = 0;

  for (const row of data) {
    const remainingMonths = parseInt(String(row["MES FORECAST RESTANTES"] || "0"));
    const targetMonth = parseInt(String(row["MES PROYECTADO"] || "0"));
    const weight = parseFloat(String(row["PONDERACiÓN SELL OUT"] || "0"));

    if (!remainingMonths || !targetMonth || !weight) continue;

    try {
      await prisma.seasonalWeight.upsert({
        where: { remainingMonths_targetMonth: { remainingMonths, targetMonth } },
        update: { weight },
        create: { remainingMonths, targetMonth, weight },
      });
      count++;
    } catch {
      // Skip
    }
  }

  return count;
}
