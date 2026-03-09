"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { MONTHS, formatNumber } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface TriangleRow {
  label: string;
  type: string;
  version?: number;
  values: Record<number, number>;
}

interface ForecastMeta {
  method: string;
  lastClosedMonth: number;
  previousYear: number;
  previousYear2: number;
  soCurrentYear: { year: number; total: number; months: number; avg: number };
  soLastYear: { year: number; total: number; months: number; avg: number; annualTotal: number };
  growthFactor: number;
  annualEstimate: number;
  ytdSO: number;
  pendingVolume: number;
  remainingMonths: number;
  inventory: number;
  seasonalWeightsCount: number;
}

interface TriangleData {
  rows: TriangleRow[];
  prevYearRows: TriangleRow[];
  year: number;
  availableYears: number[];
  config: { currentYear: number; lastClosedMonth: number } | null;
  forecastMeta: ForecastMeta | null;
}

const ROW_COLORS: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  aop:      { dot: "bg-amber-400",  bg: "bg-amber-50",  text: "text-amber-800", border: "" },
  sellout:  { dot: "bg-emerald-500", bg: "bg-emerald-100", text: "text-emerald-900 font-semibold", border: "border-y-2 border-emerald-300" },
  sellin:   { dot: "bg-teal-400",   bg: "bg-teal-50",   text: "text-teal-700", border: "" },
  forecast: { dot: "bg-blue-400",   bg: "",              text: "text-gray-700", border: "" },
  prev_so:  { dot: "bg-gray-300",   bg: "bg-gray-50",   text: "text-gray-500", border: "" },
};

const METHOD_LABELS: Record<string, string> = {
  factor_crecimiento: "Factor de crecimiento (SO ano anterior x factor)",
  solo_ano_corriente: "Extrapolacion ano corriente (promedio CY x 12)",
  sin_datos: "Sin datos suficientes",
};

function CellTooltip({ children, content }: { children: React.ReactNode; content: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLTableCellElement>(null);

  return (
    <td
      ref={ref}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({ x: rect.left + rect.width / 2, y: rect.top });
        setShow(true);
      }}
      onMouseLeave={() => setShow(false)}
      className="relative"
    >
      {children}
      {show && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)" }}
        >
          <div className="bg-gray-900 text-white text-[11px] leading-relaxed rounded-lg px-3 py-2 shadow-lg max-w-[280px] whitespace-pre-line">
            {content}
            <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
          </div>
        </div>
      )}
    </td>
  );
}

export default function TrianglePage() {
  const [data, setData] = useState<TriangleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(2026);
  const [brands, setBrands] = useState<string[]>([]);
  const [kaes, setKaes] = useState<string[]>([]);
  const [filterBrand, setFilterBrand] = useState("");
  const [filterKae, setFilterKae] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(year) });
    if (filterBrand) params.set("brand", filterBrand);
    if (filterKae) params.set("kae", filterKae);
    const res = await fetch(`/api/triangle?${params}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [year, filterBrand, filterKae]);

  useEffect(() => {
    fetchData();
    fetch("/api/catalogs?type=brands").then((r) => r.json()).then(setBrands);
    fetch("/api/catalogs?type=kaes").then((r) => r.json()).then(setKaes);
  }, [fetchData]);

  const rows = data?.rows || [];
  const prevYearRows = data?.prevYearRows || [];
  const meta = data?.forecastMeta;
  const lastClosed = data?.config?.lastClosedMonth || 0;
  const isCurrentYear = year === (data?.config?.currentYear || 2026);

  const aopRow = rows.find((r) => r.type === "aop");
  const soRow = rows.find((r) => r.type === "sellout");
  const siRow = rows.find((r) => r.type === "sellin");
  const fcstRows = rows.filter((r) => r.type === "forecast");
  const latestFcst = fcstRows[fcstRows.length - 1];
  const allTableRows = [...rows, ...prevYearRows];

  // Build tooltip text for a forecast cell
  function buildCellTooltip(row: TriangleRow, month: number, val: number): string {
    if (!meta || row.type !== "forecast") return "";
    const m = MONTHS[month - 1];
    const lines: string[] = [];
    lines.push(`${row.label} / ${m}: ${formatNumber(val)} C9L`);
    lines.push("");
    lines.push(`Metodo: ${METHOD_LABELS[meta.method] || meta.method}`);
    lines.push(`SO ${meta.soCurrentYear.year} (ENE): ${formatNumber(meta.soCurrentYear.total)}`);
    lines.push(`Promedio CY: ${formatNumber(meta.soCurrentYear.avg)}`);
    if (meta.method === "factor_crecimiento") {
      lines.push(`SO ${meta.soLastYear.year} (ENE): ${formatNumber(meta.soLastYear.total)}`);
      lines.push(`Promedio LY: ${formatNumber(meta.soLastYear.avg)}`);
      lines.push(`Factor: ${meta.growthFactor.toFixed(4)}`);
      lines.push(`SO anual ${meta.soLastYear.year}: ${formatNumber(meta.soLastYear.annualTotal)}`);
    }
    lines.push(`Estimado anual: ${formatNumber(meta.annualEstimate)}`);
    lines.push(`YTD SO: ${formatNumber(meta.ytdSO)}`);
    lines.push(`Vol. pendiente: ${formatNumber(meta.pendingVolume)}`);
    lines.push(`Inventario: ${formatNumber(meta.inventory)}`);
    lines.push(`Distribuido con ${meta.seasonalWeightsCount} pesos estacionales`);
    return lines.join("\n");
  }

  // Chart data
  const chartData = MONTHS.map((m, i) => {
    const month = i + 1;
    const point: Record<string, unknown> = { name: m };
    if (aopRow) point["AOP"] = aopRow.values[month] || 0;
    if (soRow) point["Sell Out"] = soRow.values[month] || 0;
    if (siRow) point["Sell In"] = siRow.values[month] || 0;
    if (latestFcst) point["Forecast"] = latestFcst.values[month] || 0;
    for (const pr of prevYearRows) {
      point[pr.label] = pr.values[month] || 0;
    }
    return point;
  });

  const yoyData = MONTHS.map((m, i) => {
    const month = i + 1;
    const point: Record<string, unknown> = { name: m };
    if (soRow) point[`SO ${year}`] = soRow.values[month] || 0;
    for (const pr of prevYearRows) {
      point[pr.label] = pr.values[month] || 0;
    }
    return point;
  });

  const YOY_COLORS = ["#6366f1", "#a78bfa", "#c4b5fd"];
  const soYoyKeys = [`SO ${year}`, ...prevYearRows.map((r) => r.label)];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Triangulo de Previsiones</h1>
        <p className="text-gray-500 text-sm">
          Escalera de forecast. Cada fila es una version. Compara como evoluciona la prevision mes a mes.
        </p>
      </div>

      {/* Methodology banner */}
      {meta && isCurrentYear && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
          <div className="font-semibold mb-2">Como se calcula el Forecast DP {year}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs text-blue-800">
            <div className="space-y-1">
              <p><span className="text-blue-500 font-medium">1. Inventario:</span> Se toma el inventario del ultimo mes cerrado (mes {meta.lastClosedMonth}). Total: {formatNumber(meta.inventory)} C9L.</p>
              <p><span className="text-blue-500 font-medium">2. Promedios:</span> Se comparan promedios acumulados de venta del mismo periodo.</p>
              <div className="pl-3 text-[11px] text-blue-700 space-y-0.5">
                <p>SO {meta.soCurrentYear.year} (meses 1-{meta.lastClosedMonth}): {formatNumber(meta.soCurrentYear.total)} C9L, promedio: {formatNumber(meta.soCurrentYear.avg)}</p>
                <p>SO {meta.soLastYear.year} (meses 1-{meta.lastClosedMonth}): {formatNumber(meta.soLastYear.total)} C9L, promedio: {formatNumber(meta.soLastYear.avg)}</p>
              </div>
            </div>
            <div className="space-y-1">
              <p><span className="text-blue-500 font-medium">3. Proyeccion ({METHOD_LABELS[meta.method]}):</span></p>
              <div className="pl-3 text-[11px] text-blue-700 space-y-0.5">
                {meta.method === "factor_crecimiento" && (
                  <>
                    <p>Factor de crecimiento: {formatNumber(meta.soCurrentYear.avg)} / {formatNumber(meta.soLastYear.avg)} = {meta.growthFactor.toFixed(4)}</p>
                    <p>Estimado anual: {formatNumber(meta.soLastYear.annualTotal)} x {meta.growthFactor.toFixed(4)} = {formatNumber(meta.annualEstimate)} C9L</p>
                  </>
                )}
                {meta.method === "solo_ano_corriente" && (
                  <p>Estimado anual: {formatNumber(meta.soCurrentYear.avg)} x 12 = {formatNumber(meta.annualEstimate)} C9L</p>
                )}
              </div>
              <p><span className="text-blue-500 font-medium">4. Distribucion:</span> Volumen pendiente ({formatNumber(meta.pendingVolume)} C9L) repartido en {meta.remainingMonths} meses con {meta.seasonalWeightsCount} pesos estacionales.</p>
              <p className="text-[11px] text-blue-600">SI Forecast = SO Forecast - (inventario / meses restantes)</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex bg-gray-100 rounded-lg p-0.5 mr-2">
          {(data?.availableYears || [2024, 2025, 2026]).map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                year === y
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">Todas las marcas</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={filterKae} onChange={(e) => setFilterKae(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">Todos los KAE</option>
          {kaes.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      {/* Triangle Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[160px] z-10">
                  Version
                </th>
                {MONTHS.map((m, i) => (
                  <th key={m} className="text-right px-3 py-3 font-medium text-gray-500 min-w-[90px] bg-gray-50">
                    <div>{m}</div>
                    <div className="text-[10px] text-gray-400 font-normal">Mes {i + 1}</div>
                  </th>
                ))}
                <th className="text-right px-4 py-3 font-semibold text-gray-700 bg-gray-100 min-w-[100px]">
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={14} className="text-center py-16 text-gray-400">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto mb-2" />
                    Cargando...
                  </td>
                </tr>
              ) : allTableRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-16 text-gray-400">
                    Sin datos para {year}.
                  </td>
                </tr>
              ) : (
                allTableRows.map((row, idx) => {
                  const total = Object.values(row.values).reduce((s, v) => s + (v || 0), 0);
                  const colors = ROW_COLORS[row.type] || ROW_COLORS.forecast;
                  const isSeparator = row.type === "forecast" && idx > 0 && allTableRows[idx - 1]?.type !== "forecast";
                  const isPrevSection = row.type === "prev_so" && idx > 0 && allTableRows[idx - 1]?.type !== "prev_so";

                  return (
                    <tr
                      key={row.label}
                      className={[
                        colors.border || "border-t",
                        colors.border ? "" : (isSeparator || isPrevSection ? "border-t-2 border-gray-300" : "border-gray-100"),
                        colors.bg,
                        colors.text,
                      ].filter(Boolean).join(" ")}
                    >
                      <td className="px-4 py-2 font-medium sticky left-0 bg-white z-10 whitespace-nowrap">
                        <div className={`flex items-center gap-2 ${colors.bg ? colors.bg + " -mx-4 px-4 -my-2 py-2" : ""}`}>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                          {row.label}
                        </div>
                      </td>

                      {Array.from({ length: 12 }, (_, i) => {
                        const m = i + 1;
                        const val = row.values[m];
                        const isClosed = row.type === "forecast" && row.version != null && m <= row.version && isCurrentYear;
                        const isActual = row.type === "sellout" && isCurrentYear && m <= lastClosed;
                        const isFcstCell = row.type === "forecast" && val != null && val !== 0 && !isClosed;

                        const cellClasses = [
                          "text-right px-3 py-2 tabular-nums",
                          isClosed ? "bg-gray-100 text-gray-300" : "",
                          isActual ? "bg-emerald-50 font-medium" : "",
                          isFcstCell ? "cursor-help" : "",
                        ].join(" ");

                        const cellContent = val != null && val !== 0 ? (
                          formatNumber(val)
                        ) : isClosed ? (
                          ""
                        ) : (
                          <span className="text-gray-200">--</span>
                        );

                        if (isFcstCell && meta) {
                          return (
                            <CellTooltip key={m} content={buildCellTooltip(row, m, val)}>
                              <div className={cellClasses}>{cellContent}</div>
                            </CellTooltip>
                          );
                        }

                        return (
                          <td key={m} className={cellClasses}>
                            {cellContent}
                          </td>
                        );
                      })}

                      <td className={`text-right px-4 py-2 font-bold tabular-nums ${
                        row.type === "aop" ? "bg-amber-50" :
                        row.type === "sellout" ? "bg-emerald-50" :
                        "bg-gray-50"
                      }`}>
                        {formatNumber(total)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-5 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          AOP (Plan Operativo Anual)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          Sell Out Real
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
          Sell In
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
          Versiones del Forecast
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          Sell Out anos anteriores
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-3 rounded bg-gray-100 border border-gray-200" />
          Meses cerrados
        </div>
        {meta && (
          <div className="flex items-center gap-1.5 text-blue-500">
            <span className="w-2.5 h-2.5 rounded border border-blue-300 bg-blue-50" />
            Posiciona el cursor sobre celdas de forecast para ver el detalle del calculo
          </div>
        )}
      </div>

      {/* Charts */}
      {!loading && allTableRows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              AOP vs Sell Out vs Forecast {year}
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value) => formatNumber(Number(value))}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {aopRow && (
                  <Line type="monotone" dataKey="AOP" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="6 3" />
                )}
                <Line type="monotone" dataKey="Sell Out" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                {latestFcst && (
                  <Line type="monotone" dataKey="Forecast" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                )}
                {siRow && (
                  <Line type="monotone" dataKey="Sell In" stroke="#14b8a6" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Sell Out comparativo anual
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={yoyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value) => formatNumber(Number(value))}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {soYoyKeys.map((key, i) => (
                  <Bar key={key} dataKey={key}
                    fill={i === 0 ? "#6366f1" : YOY_COLORS[i] || "#d1d5db"}
                    radius={[2, 2, 0, 0]} opacity={i === 0 ? 1 : 0.6} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {fcstRows.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Evolucion del Forecast {year} (todas las versiones)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={MONTHS.map((m, i) => {
                    const month = i + 1;
                    const point: Record<string, unknown> = { name: m };
                    for (const fr of fcstRows) {
                      point[fr.label] = fr.values[month] || null;
                    }
                    if (soRow) point["Sell Out"] = soRow.values[month] || 0;
                    return point;
                  })}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    formatter={(value) => value != null ? formatNumber(Number(value)) : "--"}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="Sell Out" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                  {fcstRows.map((fr, i) => {
                    const opacity = 0.3 + (i / Math.max(fcstRows.length - 1, 1)) * 0.7;
                    return (
                      <Line key={fr.label} type="monotone" dataKey={fr.label}
                        stroke={`rgba(59, 130, 246, ${opacity})`}
                        strokeWidth={i === fcstRows.length - 1 ? 2.5 : 1}
                        dot={i === fcstRows.length - 1 ? { r: 3 } : false}
                        connectNulls={false} />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
