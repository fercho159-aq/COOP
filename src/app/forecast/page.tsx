"use client";

import { useEffect, useState, useCallback } from "react";
import { MONTHS, formatNumber } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

interface ForecastRow {
  id: string;
  year: number;
  month: number;
  version: number;
  type: string;
  soForecast: number;
  siForecast: number;
  soInputKae: number | null;
  siInputKae: number | null;
  isLocked: boolean;
  client: { code: string; name: string; kae: string };
  sku: { code: string; brand: string; description: string; convC9L: number };
}

interface GroupedForecast {
  key: string;
  clientCode: string;
  clientName: string;
  kae: string;
  skuCode: string;
  brand: string;
  description: string;
  convC9L: number;
  months: Record<number, ForecastRow>;
  soTotal: number;
  siTotal: number;
}

interface SummaryData {
  dpByMonth: Record<number, number>;
  comByMonth: Record<number, number>;
  soByMonth: Record<number, number>;
  soPrevByMonth: Record<number, number>;
  aopByMonth: Record<number, number>;
  aopYear: number;
  topBrands: { brand: string; total: number }[];
  topKaes: { kae: string; total: number }[];
  overrideCount: number;
  totalComRecords: number;
  year: number;
  config: { currentYear: number; lastClosedMonth: number } | null;
}

const BRAND_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#ef4444", "#14b8a6", "#8b5cf6", "#f97316", "#06b6d4",
];

export default function ForecastPage() {
  const [records, setRecords] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ brand: "", kae: "" });
  const [brands, setBrands] = useState<string[]>([]);
  const [kaes, setKaes] = useState<string[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ year: "2026", type: "DP", limit: "5000" });
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.kae) params.set("kae", filters.kae);
    const res = await fetch(`/api/forecast?${params}`);
    const data = await res.json();
    setRecords(data.records);
    setLoading(false);
  }, [filters]);

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams({ year: "2026" });
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.kae) params.set("kae", filters.kae);
    const res = await fetch(`/api/forecast/summary?${params}`);
    setSummary(await res.json());
  }, [filters]);

  useEffect(() => {
    fetchData();
    fetchSummary();
    fetch("/api/catalogs?type=brands").then((r) => r.json()).then(setBrands);
    fetch("/api/catalogs?type=kaes").then((r) => r.json()).then(setKaes);
  }, [fetchData, fetchSummary]);

  // Group records by client+sku
  const grouped: GroupedForecast[] = [];
  const groupMap = new Map<string, GroupedForecast>();
  for (const r of records) {
    const key = `${r.client.code}-${r.sku.code}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key, clientCode: r.client.code, clientName: r.client.name,
        kae: r.client.kae, skuCode: r.sku.code, brand: r.sku.brand,
        description: r.sku.description, convC9L: r.sku.convC9L,
        months: {}, soTotal: 0, siTotal: 0,
      });
      grouped.push(groupMap.get(key)!);
    }
    const g = groupMap.get(key)!;
    g.months[r.month] = r;
    g.soTotal += r.soForecast;
    g.siTotal += r.siForecast;
  }

  // Summary computed values
  const forecastYear = summary?.year || 2026;
  const prevYear = forecastYear - 1;
  const lastClosed = summary?.config?.lastClosedMonth || 0;

  const dpTotal = summary ? Object.values(summary.dpByMonth).reduce((s, v) => s + v, 0) : 0;
  const soTotal = summary ? Object.values(summary.soByMonth).reduce((s, v) => s + v, 0) : 0;
  const soPrevTotal = summary ? Object.values(summary.soPrevByMonth).reduce((s, v) => s + v, 0) : 0;
  const aopTotal = summary ? Object.values(summary.aopByMonth).reduce((s, v) => s + v, 0) : 0;
  const dpVsAop = aopTotal > 0 ? ((dpTotal - aopTotal) / aopTotal) * 100 : 0;
  const dpVsSoPrev = soPrevTotal > 0 ? ((dpTotal - soPrevTotal) / soPrevTotal) * 100 : 0;

  // Chart data
  const monthlyChart = MONTHS.map((m, i) => {
    const month = i + 1;
    const point: Record<string, unknown> = { name: m };
    point["Fcst DP SO"] = summary?.dpByMonth[month] || 0;
    const so = summary?.soByMonth[month];
    if (so) point[`SO ${forecastYear}`] = so;
    const soPrev = summary?.soPrevByMonth[month];
    if (soPrev) point[`SO ${prevYear}`] = soPrev;
    const aop = summary?.aopByMonth[month];
    if (aop) point[`AOP ${summary?.aopYear || forecastYear}`] = aop;
    return point;
  });

  const growthChart = MONTHS.map((m, i) => {
    const month = i + 1;
    return {
      name: m,
      [`Fcst DP ${forecastYear}`]: summary?.dpByMonth[month] || 0,
      [`SO ${prevYear}`]: summary?.soPrevByMonth[month] || 0,
    };
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Forecast Demand Planning</h1>
        <p className="text-gray-500 text-sm">
          Forecast generado por el motor de calculo — Valores en C9L
        </p>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">SO {prevYear} (real)</div>
            <div className="text-xl font-bold text-amber-600">{formatNumber(soPrevTotal, 0)}</div>
            <div className="text-[11px] text-gray-400">C9L anual</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">SO {forecastYear} (parcial)</div>
            <div className="text-xl font-bold text-amber-500">{formatNumber(soTotal, 0)}</div>
            <div className="text-[11px] text-gray-400">{lastClosed > 0 ? `Mes 1-${lastClosed}` : "Sin datos"}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">AOP {summary.aopYear}</div>
            <div className="text-xl font-bold text-purple-600">{formatNumber(aopTotal, 0)}</div>
            <div className="text-[11px] text-gray-400">C9L anual</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Fcst DP {forecastYear}</div>
            <div className="text-xl font-bold text-blue-600">{formatNumber(dpTotal, 0)}</div>
            <div className={`text-[11px] ${dpVsAop === 0 ? "text-gray-400" : dpVsAop > 0 ? "text-emerald-500" : "text-red-500"}`}>
              {aopTotal > 0 ? `${dpVsAop > 0 ? "+" : ""}${dpVsAop.toFixed(1)}% vs AOP` : ""}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">DP vs SO {prevYear}</div>
            <div className={`text-xl font-bold ${dpVsSoPrev >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {dpVsSoPrev >= 0 ? "+" : ""}{dpVsSoPrev.toFixed(1)}%
            </div>
            <div className="text-[11px] text-gray-400">{formatNumber(dpTotal - soPrevTotal, 0)} C9L</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={filters.brand} onChange={(e) => setFilters((f) => ({ ...f, brand: e.target.value }))}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">Todas las marcas</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={filters.kae} onChange={(e) => setFilters((f) => ({ ...f, kae: e.target.value }))}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">Todos los KAE</option>
          {kaes.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        {(filters.brand || filters.kae) && (
          <button onClick={() => setFilters({ brand: "", kae: "" })}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Limpiar filtros
          </button>
        )}
        <span className="text-sm text-gray-500 ml-auto">{grouped.length} registros</span>
      </div>

      {/* Charts */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly lines: DP vs SO vs AOP */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Forecast DP vs Sell Out vs AOP (mensual)
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value) => formatNumber(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey={`AOP ${summary.aopYear}`} stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="6 3" dot={{ r: 2 }} connectNulls={false} />
                <Line type="monotone" dataKey={`SO ${prevYear}`} stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 2 }} connectNulls={false} />
                <Line type="monotone" dataKey={`SO ${forecastYear}`} stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="Fcst DP SO" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bar: DP vs SO previous year */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Forecast DP {forecastYear} vs SO Real {prevYear}
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={growthChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value) => formatNumber(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey={`SO ${prevYear}`} fill="#9ca3af" radius={[3, 3, 0, 0]} opacity={0.6} />
                <Bar dataKey={`Fcst DP ${forecastYear}`} fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top brands */}
          {summary.topBrands.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Forecast DP por marca
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={summary.topBrands} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="brand" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    formatter={(value) => formatNumber(Number(value))} />
                  <Bar dataKey="total" name="C9L Total" radius={[0, 3, 3, 0]}>
                    {summary.topBrands.map((_, i) => (
                      <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* By KAE */}
          {summary.topKaes.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Forecast DP por KAE
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={summary.topKaes} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="kae" type="category" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    formatter={(value) => formatNumber(Number(value))} />
                  <Bar dataKey="total" name="C9L Total" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Detail Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Detalle por Cliente / SKU</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">SO Forecast y SI Forecast generados por el motor de calculo</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[140px] z-10">Cliente</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Marca</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">SKU</th>
                {MONTHS.map((m, i) => (
                  <th key={m} className={`text-right px-2 py-2 font-medium min-w-[70px] ${
                    i + 1 <= lastClosed ? "text-gray-300 bg-gray-100" : "text-gray-500"
                  }`}>{m}</th>
                ))}
                <th className="text-right px-3 py-2 font-semibold text-gray-700 bg-gray-100">SO FY</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700 bg-gray-100">SI FY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={17} className="text-center py-12 text-gray-400">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto mb-2" />
                  Cargando...
                </td></tr>
              ) : grouped.length === 0 ? (
                <tr><td colSpan={17} className="text-center py-12 text-gray-400">Sin registros</td></tr>
              ) : grouped.map((g) => (
                <tr key={g.key} className="hover:bg-blue-50/50 transition-colors">
                  <td className="px-3 py-2 sticky left-0 bg-white z-10">
                    <div className="font-medium text-gray-900 truncate max-w-[130px]" title={g.clientName}>{g.clientName}</div>
                    <div className="text-[10px] text-gray-400">{g.kae}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{g.brand}</td>
                  <td className="px-3 py-2 text-gray-500 font-mono" title={g.description}>{g.skuCode}</td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = i + 1;
                    const rec = g.months[m];
                    const value = rec?.soForecast ?? 0;
                    const isClosed = m <= lastClosed;

                    return (
                      <td key={m}
                        className={`text-right px-2 py-2 tabular-nums ${
                          isClosed ? "bg-gray-50 text-gray-300" : "text-gray-600"
                        }`}
                        title={rec ? `SO: ${formatNumber(rec.soForecast)} | SI: ${formatNumber(rec.siForecast)}` : undefined}
                      >
                        {value ? formatNumber(value) : isClosed ? "" : <span className="text-gray-200">--</span>}
                      </td>
                    );
                  })}
                  <td className="text-right px-3 py-2 font-semibold text-blue-700 bg-gray-50 tabular-nums">
                    {formatNumber(g.soTotal)}
                  </td>
                  <td className="text-right px-3 py-2 font-semibold text-teal-700 bg-gray-50 tabular-nums">
                    {formatNumber(g.siTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-5 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-50 border border-gray-200" />
          Meses cerrados
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />
          SO Forecast (C9L)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-teal-100 border border-teal-300" />
          SI Forecast (C9L)
        </div>
      </div>
    </div>
  );
}
