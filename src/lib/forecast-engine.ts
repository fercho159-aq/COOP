/**
 * Forecast calculation engine
 * Implements the 4 rules from the "Cambios" sheet:
 *
 * 1. Inventory from last close; if none, previous month; if 0, leave 0
 * 2. Sales averages are cumulative with comparable months
 * 3. Conditional projection:
 *    - No cumulative avg → considered low, no Sell Out
 *    - Only current year sales → extrapolate with current year avg
 *    - Both years → extrapolate from LY avg × growth factor
 * 4. Pending SO volume estimation:
 *    - If annual estimate > YTD SO → difference spread across remaining months
 *    - If annual estimate < YTD SO → extrapolate YTD SO annually
 */

export interface SellOutData {
  year: number;
  month: number;
  c9l: number;
}

export interface SeasonalWeights {
  [month: number]: number; // month -> weight (0-1)
}

export interface ForecastResult {
  month: number;
  soForecast: number;
  siForecast: number;
  method: "no_data" | "current_year_only" | "growth_factor";
}

export function calculateForecast(params: {
  currentYear: number;
  lastClosedMonth: number;
  soCurrentYear: SellOutData[];
  soPreviousYear: SellOutData[];
  seasonalWeights: SeasonalWeights;
  inventoryC9L: number;
}): ForecastResult[] {
  const {
    lastClosedMonth,
    soCurrentYear,
    soPreviousYear,
    seasonalWeights,
    inventoryC9L,
  } = params;

  const results: ForecastResult[] = [];

  // Calculate cumulative averages
  const cyMonths = soCurrentYear.filter((s) => s.month <= lastClosedMonth);
  const lyMonths = soPreviousYear.filter((s) => s.month <= lastClosedMonth);

  const cyTotal = cyMonths.reduce((sum, s) => sum + s.c9l, 0);
  const lyTotal = lyMonths.reduce((sum, s) => sum + s.c9l, 0);

  const cyAvg = cyMonths.length > 0 ? cyTotal / cyMonths.length : 0;
  const lyAvg = lyMonths.length > 0 ? lyTotal / lyMonths.length : 0;

  // Rule 3: Determine projection method
  let annualEstimate = 0;
  let method: ForecastResult["method"] = "no_data";

  if (cyAvg === 0 && lyAvg === 0) {
    // No data at all
    method = "no_data";
    annualEstimate = 0;
  } else if (lyAvg === 0) {
    // Only current year data
    method = "current_year_only";
    annualEstimate = cyAvg * 12;
  } else {
    // Both years available
    method = "growth_factor";
    const growthFactor = cyAvg > 0 ? cyAvg / lyAvg : 1;
    const lyAnnual = soPreviousYear.reduce((sum, s) => sum + s.c9l, 0);
    annualEstimate = lyAnnual * growthFactor;
  }

  // Rule 4: Calculate YTD and distribute remaining
  const ytdSO = cyTotal;
  const remainingMonths = 12 - lastClosedMonth;

  if (remainingMonths <= 0) return results;

  let pendingVolume: number;
  if (annualEstimate > ytdSO) {
    pendingVolume = annualEstimate - ytdSO;
  } else {
    // Extrapolate YTD annually
    const ytdRate = lastClosedMonth > 0 ? ytdSO / lastClosedMonth : 0;
    annualEstimate = ytdRate * 12;
    pendingVolume = Math.max(0, annualEstimate - ytdSO);
  }

  // Distribute pending volume using seasonal weights
  const remainingWeights: { month: number; weight: number }[] = [];
  let totalRemainingWeight = 0;

  for (let m = lastClosedMonth + 1; m <= 12; m++) {
    const w = seasonalWeights[m] || 1 / 12;
    remainingWeights.push({ month: m, weight: w });
    totalRemainingWeight += w;
  }

  for (const { month, weight } of remainingWeights) {
    const proportion = totalRemainingWeight > 0 ? weight / totalRemainingWeight : 1 / remainingMonths;
    const soForecast = method === "no_data" ? 0 : pendingVolume * proportion;

    // SI forecast: SO + coverage adjustment (simplified: SO + delta inventory)
    const siForecast = Math.max(0, soForecast - inventoryC9L / remainingMonths);

    results.push({ month, soForecast, siForecast, method });
  }

  return results;
}

/**
 * Build the triangle/staircase data structure for visualization
 */
export interface TriangleRow {
  label: string; // e.g. "AOP 2025", "SELL OUT", "FCST 1 ENE"
  type: "aop" | "sellout" | "forecast";
  version?: number;
  values: Record<number, number>; // month -> value
}

export function buildTriangle(params: {
  aopValues: Record<number, number>;
  sellOutValues: Record<number, number>;
  forecastVersions: { version: number; values: Record<number, number> }[];
}): TriangleRow[] {
  const { aopValues, sellOutValues, forecastVersions } = params;

  const rows: TriangleRow[] = [
    { label: "AOP 2025", type: "aop", values: aopValues },
    { label: "SELL OUT", type: "sellout", values: sellOutValues },
  ];

  const monthLabels = [
    "", "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
    "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
  ];

  for (const fv of forecastVersions) {
    rows.push({
      label: `FCST ${fv.version} ${monthLabels[fv.version] || ""}`,
      type: "forecast",
      version: fv.version,
      values: fv.values,
    });
  }

  return rows;
}
