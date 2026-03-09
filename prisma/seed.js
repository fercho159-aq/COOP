const { PrismaClient } = require("@prisma/client");
const XLSX = require("xlsx");
const path = require("path");

const prisma = new PrismaClient();

const ROLLING_PATH = path.resolve(__dirname, "../../Rolling Forecast 2026 - Moderno.xlsx");
const TRIANGULO_PATH = path.resolve(__dirname, "../../Triángulo_Escaleras de previsiones.xlsx");

const MONTH_MAP = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};

const BATCH_SIZE = 500;

function num(val) {
  const n = parseFloat(String(val || "0"));
  return isNaN(n) ? 0 : n;
}

function str(val) {
  return String(val || "").trim();
}

function readSheet(wb, name) {
  const sheet = wb.Sheets[name];
  if (!sheet) { console.log(`  ⚠ Sheet "${name}" not found`); return []; }
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

async function batchCreate(model, records, label) {
  let total = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const result = await model.createMany({ data: batch, skipDuplicates: true });
    total += result.count;
    if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE) {
      process.stdout.write(`  ... ${Math.min(i + BATCH_SIZE, records.length)}/${records.length}\r`);
    }
  }
  console.log(`  ${total} ${label} imported.          `);
  return total;
}

async function main() {
  console.log("Loading Excel files...");
  const rolling = XLSX.readFile(ROLLING_PATH);
  const triangulo = XLSX.readFile(TRIANGULO_PATH);

  // ═══════════════════════════════════════
  // 1. CLEAN EXISTING DATA
  // ═══════════════════════════════════════
  console.log("\n--- Cleaning existing data...");
  await prisma.forecastRecord.deleteMany();
  await prisma.aopRecord.deleteMany();
  await prisma.sellInRecord.deleteMany();
  await prisma.sellOutRecord.deleteMany();
  await prisma.inventoryRecord.deleteMany();
  await prisma.seasonalWeight.deleteMany();
  await prisma.cost.deleteMany();
  await prisma.price.deleteMany();
  await prisma.forecastConfig.deleteMany();
  await prisma.client.deleteMany();
  await prisma.sku.deleteMany();
  console.log("  Done.");

  // ═══════════════════════════════════════
  // 2. SKUs (from Rolling "Precios" + Conv9L from Triángulo)
  // ═══════════════════════════════════════
  console.log("\n--- Importing SKUs...");
  const preciosData = XLSX.utils.sheet_to_json(rolling.Sheets["Precios"], { range: 0 });

  const conv9lData = readSheet(triangulo, "Conv9L");
  const conv9lMap = {};
  for (let i = 3; i < conv9lData.length; i++) {
    const code = str(conv9lData[i][0]);
    const conv = num(conv9lData[i][4]);
    if (code && conv) conv9lMap[code] = conv;
  }

  const skuRecords = [];
  const seenSkus = new Set();
  for (const row of preciosData) {
    const code = str(row["SKU"]);
    if (!code || code === "SKU" || seenSkus.has(code)) continue;
    seenSkus.add(code);

    skuRecords.push({
      code,
      brand: str(row["Marca"] || row["MARCAS"]),
      category: str(row["Categoría"] || row["CATEGRIA"]),
      variant: str(row["Variante"]),
      description: str(row["Variante"] || `${str(row["Marca"])} ${str(row["Variante"])}`),
      ml: parseInt(String(row["ml"] || "750")) || 750,
      unitsPerBox: parseInt(String(row["Botellas x Caja"] || "6")) || 6,
      convC9L: conv9lMap[code] || 0.5,
    });
  }
  await batchCreate(prisma.sku, skuRecords, "SKUs");

  // ═══════════════════════════════════════
  // 3. CLIENTS (from Rolling "IMPORT_CLIENTES")
  // ═══════════════════════════════════════
  console.log("\n--- Importing Clients...");
  const clientSheet = rolling.Sheets["IMPORT_CLIENTES"];
  const clientData = XLSX.utils.sheet_to_json(clientSheet, { range: 3 });
  const clientRecords = [];
  const seenClients = new Set();

  for (const row of clientData) {
    const code = str(row["CODIGO FORECAST"] || row["C_HIJO"]);
    if (!code || code.length < 3 || seenClients.has(code)) continue;
    seenClients.add(code);

    const name = str(row["CLIENTE"] || row["CLIENTE OK"]);
    if (!name) continue;

    clientRecords.push({
      code,
      familyCode: str(row["C_FAMILIA"] || code.replace(/[A-Z]$/, "")),
      name,
      officialName: str(row["NOMBRE OFICIAL"]) || null,
      kae: str(row["KAE"]),
    });
  }
  await batchCreate(prisma.client, clientRecords, "Clients");

  // Build lookup maps
  const allSkus = await prisma.sku.findMany();
  const allClients = await prisma.client.findMany();
  const skuMap = Object.fromEntries(allSkus.map((s) => [s.code, s.id]));
  const clientMap = Object.fromEntries(allClients.map((c) => [c.code, c.id]));
  console.log(`  Lookup maps: ${Object.keys(skuMap).length} SKUs, ${Object.keys(clientMap).length} Clients`);

  // ═══════════════════════════════════════
  // 4. PRICES (from Rolling "Precios")
  // ═══════════════════════════════════════
  console.log("\n--- Importing Prices...");
  const priceRecords = [];
  const seenPrices = new Set();
  for (const row of preciosData) {
    const skuCode = str(row["SKU"]);
    if (!skuCode || skuCode === "SKU") continue;
    const skuId = skuMap[skuCode];
    if (!skuId) continue;

    const listVersion = str(row["LISTA"] || "L1");
    const key = `${skuId}-${listVersion}`;
    if (seenPrices.has(key)) continue;
    seenPrices.add(key);

    priceRecords.push({
      skuId, listVersion,
      effectiveDate: new Date(),
      rspEspecializados: num(row["RSP Especializados"]) || null,
      rspModerno: num(row["RSP Moderno"]) || null,
      priceWithTax: num(row["Precio Lista c/Impuestos"]) || null,
      pricePerPcNoTax: num(row["Precio Pz Esp Lista s/Impuestos"]) || null,
      pricePerBoxNoTax: num(row["Precio Caja s/Impuestos"]) || null,
    });
  }
  await batchCreate(prisma.price, priceRecords, "Prices");

  // ═══════════════════════════════════════
  // 5. COSTS (from Triángulo "Costos")
  // ═══════════════════════════════════════
  console.log("\n--- Importing Costs...");
  const costosData = readSheet(triangulo, "Costos");
  const costRecords = [];
  const seenCosts = new Set();
  for (let i = 4; i < costosData.length; i++) {
    const row = costosData[i];
    const skuCode = str(row[0]);
    if (!skuCode) continue;
    const skuId = skuMap[skuCode];
    if (!skuId) continue;

    const listVersion = str(row[4]) || "LC1";
    const key = `${skuId}-${listVersion}`;
    if (seenCosts.has(key)) continue;
    seenCosts.add(key);

    const costPerBoxNoTax = num(row[5]);
    const costPerBoxTax = num(row[6]);
    if (!costPerBoxNoTax && !costPerBoxTax) continue;

    costRecords.push({
      skuId, listVersion, costPerBoxNoTax, costPerBoxTax,
      cost9LNoTax: num(row[8]) || null,
      cost9LWithTax: num(row[9]) || null,
    });
  }
  await batchCreate(prisma.cost, costRecords, "Costs");

  // ═══════════════════════════════════════
  // 6. SEASONAL WEIGHTS
  // ═══════════════════════════════════════
  console.log("\n--- Importing Seasonal Weights...");
  const swData = XLSX.utils.sheet_to_json(rolling.Sheets["Ponderación Sell Out"], { range: 0 });
  const swRecords = [];
  const seenSw = new Set();
  for (const row of swData) {
    const remainingMonths = parseInt(String(row["MES FORECAST RESTANTES"] || "0"));
    const targetMonth = parseInt(String(row["MES PROYECTADO"] || "0"));
    const weight = num(row["PONDERACiÓN SELL OUT"]);
    if (!remainingMonths || !targetMonth || !weight) continue;
    const key = `${remainingMonths}-${targetMonth}`;
    if (seenSw.has(key)) continue;
    seenSw.add(key);
    swRecords.push({ remainingMonths, targetMonth, weight });
  }
  await batchCreate(prisma.seasonalWeight, swRecords, "Seasonal Weights");

  // ═══════════════════════════════════════
  // 7. SELL OUT 2025 + 2024
  // ═══════════════════════════════════════
  console.log("\n--- Importing Sell Out 2025 (SO LY)...");
  const so25 = buildSellOutRecords(rolling, "SO LY", skuMap, clientMap);
  await batchCreate(prisma.sellOutRecord, so25, "Sell Out 2025 records");

  console.log("\n--- Importing Sell Out 2024 (SO LY-1)...");
  const so24 = buildSellOutRecords(rolling, "SO LY-1", skuMap, clientMap);
  await batchCreate(prisma.sellOutRecord, so24, "Sell Out 2024 records");

  // ═══════════════════════════════════════
  // 8. INVENTORY (from SO LY inBottles/invC9l)
  // ═══════════════════════════════════════
  console.log("\n--- Importing Inventory Records...");
  const invRecords = buildInventoryRecords(rolling, "SO LY", skuMap, clientMap);
  const inv24 = buildInventoryRecords(rolling, "SO LY-1", skuMap, clientMap);
  const allInv = [...invRecords, ...inv24];
  await batchCreate(prisma.inventoryRecord, allInv, "Inventory records");

  // ═══════════════════════════════════════
  // 9. SELL IN 2025
  // ═══════════════════════════════════════
  console.log("\n--- Importing Sell In 2025...");
  const siData = XLSX.utils.sheet_to_json(rolling.Sheets["SI LY"], { range: 3 });
  const siAgg = {};

  for (const row of siData) {
    const rawClient = str(row["ID CLIENTE"]);
    const clientId = clientMap[rawClient] || clientMap[rawClient + "A"];
    const skuCode = str(row["ID SKU"]);
    const skuId = skuMap[skuCode];
    const mesStr = str(row["MES"]).toUpperCase();
    const month = MONTH_MAP[mesStr] || 0;
    if (!clientId || !skuId || !month) continue;

    const key = `${clientId}-${skuId}-${month}`;
    if (!siAgg[key]) {
      siAgg[key] = { clientId, skuId, year: 2025, month, pieces: 0, boxes: 0, c9l: 0, subtotalNoTax: 0, discount: 0, totalNoTax: 0 };
    }
    siAgg[key].pieces += num(row["PIEZAS PEDIDO"]);
    siAgg[key].boxes += num(row["PRODUCTO"]);
    siAgg[key].c9l += num(row["C9L"]);
    siAgg[key].subtotalNoTax += num(row["SUBTOTAL SIN IMPUESTOS"]);
    siAgg[key].discount += num(row["DESCUENTO"]);
    siAgg[key].totalNoTax += num(row["SUBTOTAL - DESCUENTO"]);
  }
  await batchCreate(prisma.sellInRecord, Object.values(siAgg), "Sell In records");

  // ═══════════════════════════════════════
  // 10. AOP 2026 (from Triángulo "BASE", DATO = "AOP 2025" — it's the plan for 2026)
  // ═══════════════════════════════════════
  console.log("\n--- Importing AOP 2026...");
  const baseData = readSheet(triangulo, "BASE");
  const aopRecords = [];
  const seenAop = new Set();

  for (let i = 4; i < baseData.length; i++) {
    const row = baseData[i];
    if (str(row[7]) !== "AOP 2025") continue;

    const clientCode = str(row[1]);
    const skuCode = str(row[5]);
    const clientId = clientMap[clientCode];
    const skuId = skuMap[skuCode];
    if (!clientId || !skuId) continue;

    for (let m = 0; m < 12; m++) {
      const value = num(row[8 + m]);
      if (value === 0) continue;
      const key = `${clientId}-${skuId}-2025-${m + 1}`;
      if (seenAop.has(key)) continue;
      seenAop.add(key);
      aopRecords.push({ clientId, skuId, year: 2026, month: m + 1, value });
    }
  }
  await batchCreate(prisma.aopRecord, aopRecords, "AOP 2026 records");

  // ═══════════════════════════════════════
  // 11. FORECAST CONFIG
  // ═══════════════════════════════════════
  console.log("\n--- Setting up Forecast Config...");
  await prisma.forecastConfig.create({
    data: { currentYear: 2026, lastClosedMonth: 1, remainingMonths: 11, previousYear: 2025 },
  });
  console.log("  Config: year=2026, lastClosedMonth=1");

  // ═══════════════════════════════════════
  // 12. HISTORICAL FORECASTS 2025 (from Triangulo "BASE")
  //     These are past calculations kept for the triangle view
  // ═══════════════════════════════════════
  console.log("\n--- Importing Historical Forecasts 2025...");
  const fcstVersionMap = {
    "FCST 0 LIVE": 0, "FCST 1 ENE": 1, "FCST 2 FEB": 2, "FCST 3 MAR": 3,
    "FCST 4 ABR": 4, "FCST 5 MAY": 5, "FCST 6 JUN": 6, "FCST 7 JUL": 7, "FCST 8 AGO": 8,
  };

  const histRecords = [];
  const seenHist = new Set();
  for (let i = 4; i < baseData.length; i++) {
    const row = baseData[i];
    const dato = str(row[7]);
    const version = fcstVersionMap[dato];
    if (version === undefined) continue;

    const clientCode = str(row[1]);
    const skuCode = str(row[5]);
    const clientId = clientMap[clientCode];
    const skuId = skuMap[skuCode];
    if (!clientId || !skuId) continue;

    for (let m = 0; m < 12; m++) {
      const soForecast = num(row[8 + m]);
      if (soForecast === 0) continue;
      const key = `${clientId}-${skuId}-2025-${m + 1}-${version}-DP`;
      if (seenHist.has(key)) continue;
      seenHist.add(key);
      histRecords.push({ clientId, skuId, year: 2025, month: m + 1, version, type: "DP", soForecast });
    }
  }
  await batchCreate(prisma.forecastRecord, histRecords, "Historical Forecast 2025 records");

  // ═══════════════════════════════════════
  // 13. CALCULATE FORECAST DP 2026 (engine)
  //     NOT imported — calculated from SO 2025 + SO 2024 + weights + inventory
  // ═══════════════════════════════════════
  console.log("\n--- Calculating Forecast DP 2026...");
  const calcCount = await calculateAllForecasts(prisma);
  console.log(`  ${calcCount} Forecast DP 2026 records calculated.`);

  console.log("\n[OK] Seed completed successfully!");
}

function buildSellOutRecords(wb, sheetName, skuMap, clientMap) {
  const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { range: 0 });
  const agg = {};

  for (const row of data) {
    const clientCode = str(row["Cod Cliente Forecast"] || row["COD. CLIENTE"]);
    const skuCode = str(row["SKU"]);
    const year = parseInt(String(row["Año"] || "0"));
    const month = parseInt(String(row["Mes_Numero"] || "0"));
    const clientId = clientMap[clientCode];
    const skuId = skuMap[skuCode];
    if (!clientId || !skuId || !year || !month) continue;

    const key = `${clientId}-${skuId}-${year}-${month}`;
    if (!agg[key]) {
      agg[key] = { clientId, skuId, year, month, bottles: 0, c9l: 0, inBottles: 0, invC9l: 0 };
    }
    agg[key].bottles += num(row["SO Botella"]);
    agg[key].c9l += num(row["SO_C9L"]);
    agg[key].inBottles = num(row["IN Botella"]);
    agg[key].invC9l = num(row["INV_C9L"]);
  }

  return Object.values(agg);
}

function buildInventoryRecords(wb, sheetName, skuMap, clientMap) {
  const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { range: 0 });
  const agg = {};

  for (const row of data) {
    const clientCode = str(row["Cod Cliente Forecast"] || row["COD. CLIENTE"]);
    const skuCode = str(row["SKU"]);
    const year = parseInt(String(row["Año"] || "0"));
    const month = parseInt(String(row["Mes_Numero"] || "0"));
    const clientId = clientMap[clientCode];
    const skuId = skuMap[skuCode];
    if (!clientId || !skuId || !year || !month) continue;

    const inBottles = num(row["IN Botella"]);
    const invC9l = num(row["INV_C9L"]);
    if (inBottles === 0 && invC9l === 0) continue;

    const key = `${clientId}-${skuId}-${year}-${month}`;
    if (!agg[key]) {
      agg[key] = { clientId, skuId, year, month, quantity: invC9l, bottles: inBottles };
    } else {
      agg[key].quantity = invC9l;
      agg[key].bottles = inBottles;
    }
  }

  return Object.values(agg);
}

/**
 * Forecast engine (mirrors src/lib/forecast-engine.ts)
 * Rules from the "Cambios" sheet:
 * 1. Inventory from last close
 * 2. Cumulative comparable month averages
 * 3. Projection: no_data / current_year_only / growth_factor
 * 4. Distribute pending volume with seasonal weights
 */
function runForecastEngine({ lastClosedMonth, soCurrentYear, soPreviousYear, seasonalWeights, inventoryC9L }) {
  const results = [];

  const cyMonths = soCurrentYear.filter((s) => s.month <= lastClosedMonth);
  const lyMonths = soPreviousYear.filter((s) => s.month <= lastClosedMonth);

  const cyTotal = cyMonths.reduce((sum, s) => sum + s.c9l, 0);
  const lyTotal = lyMonths.reduce((sum, s) => sum + s.c9l, 0);

  const cyAvg = cyMonths.length > 0 ? cyTotal / cyMonths.length : 0;
  const lyAvg = lyMonths.length > 0 ? lyTotal / lyMonths.length : 0;

  let annualEstimate = 0;
  let method = "no_data";

  if (cyAvg === 0 && lyAvg === 0) {
    method = "no_data";
  } else if (lyAvg === 0) {
    method = "current_year_only";
    annualEstimate = cyAvg * 12;
  } else {
    method = "growth_factor";
    const growthFactor = cyAvg > 0 ? cyAvg / lyAvg : 1;
    const lyAnnual = soPreviousYear.reduce((sum, s) => sum + s.c9l, 0);
    annualEstimate = lyAnnual * growthFactor;
  }

  const ytdSO = cyTotal;
  const remainingMonths = 12 - lastClosedMonth;
  if (remainingMonths <= 0) return results;

  let pendingVolume;
  if (annualEstimate > ytdSO) {
    pendingVolume = annualEstimate - ytdSO;
  } else {
    const ytdRate = lastClosedMonth > 0 ? ytdSO / lastClosedMonth : 0;
    annualEstimate = ytdRate * 12;
    pendingVolume = Math.max(0, annualEstimate - ytdSO);
  }

  const remainingWeights = [];
  let totalRemainingWeight = 0;
  for (let m = lastClosedMonth + 1; m <= 12; m++) {
    const w = seasonalWeights[m] || 1 / 12;
    remainingWeights.push({ month: m, weight: w });
    totalRemainingWeight += w;
  }

  for (const { month, weight } of remainingWeights) {
    const proportion = totalRemainingWeight > 0 ? weight / totalRemainingWeight : 1 / remainingMonths;
    const soForecast = method === "no_data" ? 0 : pendingVolume * proportion;
    const siForecast = Math.max(0, soForecast - inventoryC9L / remainingMonths);
    results.push({ month, soForecast, siForecast });
  }

  return results;
}

/**
 * Calculate forecasts for ALL client+sku combinations that have sell out data
 */
async function calculateAllForecasts(prisma) {
  const config = await prisma.forecastConfig.findFirst();
  const currentYear = config.currentYear;     // 2026
  const previousYear = config.previousYear;   // 2025
  const lastClosedMonth = config.lastClosedMonth; // 1

  // previousYear SO = "current year" for the engine (2025 data drives 2026 forecast)
  // previousYear-1 SO = "previous year" for the engine (2024 data for growth factor)
  const version = lastClosedMonth + 1;

  // Load all SO data at once
  const allSO = await prisma.sellOutRecord.findMany({
    where: { year: { in: [previousYear - 1, previousYear] } },
    select: { clientId: true, skuId: true, year: true, month: true, c9l: true },
  });

  // Load seasonal weights for the remaining months
  const weights = await prisma.seasonalWeight.findMany({
    where: { remainingMonths: 12 - lastClosedMonth },
  });
  const seasonalWeights = {};
  for (const w of weights) seasonalWeights[w.targetMonth] = w.weight;

  // Load inventory for lastClosedMonth
  const allInventory = await prisma.inventoryRecord.findMany({
    where: { year: previousYear, month: lastClosedMonth },
    select: { clientId: true, skuId: true, quantity: true },
  });
  const invMap = {};
  for (const inv of allInventory) {
    invMap[`${inv.clientId}-${inv.skuId}`] = inv.quantity;
  }

  // Group SO by client+sku
  const soGroups = {};
  for (const s of allSO) {
    const key = `${s.clientId}-${s.skuId}`;
    if (!soGroups[key]) soGroups[key] = { clientId: s.clientId, skuId: s.skuId, cy: [], ly: [] };
    if (s.year === previousYear) {
      soGroups[key].cy.push(s);
    } else if (s.year === previousYear - 1) {
      soGroups[key].ly.push(s);
    }
  }

  // Calculate for each combination
  const allRecords = [];
  for (const group of Object.values(soGroups)) {
    const inv = invMap[`${group.clientId}-${group.skuId}`] || 0;

    const results = runForecastEngine({
      lastClosedMonth,
      soCurrentYear: group.cy,
      soPreviousYear: group.ly,
      seasonalWeights,
      inventoryC9L: inv,
    });

    for (const r of results) {
      if (r.soForecast === 0 && r.siForecast === 0) continue;
      allRecords.push({
        clientId: group.clientId,
        skuId: group.skuId,
        year: currentYear,
        month: r.month,
        version,
        type: "DP",
        soForecast: r.soForecast,
        siForecast: r.siForecast,
      });
      // COM record (copy of DP, editable by KAEs)
      allRecords.push({
        clientId: group.clientId,
        skuId: group.skuId,
        year: currentYear,
        month: r.month,
        version,
        type: "COM",
        soForecast: r.soForecast,
        siForecast: r.siForecast,
      });
    }
  }

  // Batch insert
  let total = 0;
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE);
    const result = await prisma.forecastRecord.createMany({ data: batch, skipDuplicates: true });
    total += result.count;
    if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE) {
      process.stdout.write(`  ... ${Math.min(i + BATCH_SIZE, allRecords.length)}/${allRecords.length}\r`);
    }
  }
  return total;
}

main()
  .catch((e) => { console.error("Seed error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
