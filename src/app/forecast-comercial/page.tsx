"use client";

import { useEffect, useState, useCallback } from "react";
import { MONTHS, formatNumber } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

interface ForecastRow {
  id: string;
  month: number;
  soForecast: number;
  soInputKae: number | null;
  isLocked: boolean;
  client: { code: string; name: string; kae: string };
  sku: { code: string; brand: string; description: string; convC9L: number };
}

interface GroupedRow {
  key: string;
  clientName: string;
  clientCode: string;
  kae: string;
  brand: string;
  skuCode: string;
  description: string;
  months: Record<number, ForecastRow>;
  total: number;
  dpTotal: number;
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

interface ClientOption {
  id: string;
  code: string;
  name: string;
  kae: string;
}

const CHART_COLORS = {
  dp: "#3b82f6",
  com: "#10b981",
  so: "#f59e0b",
  aop: "#8b5cf6",
};

const BRAND_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#ef4444", "#14b8a6", "#8b5cf6", "#f97316", "#06b6d4",
];

export default function ForecastComercialPage() {
  const [records, setRecords] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<string[]>([]);
  const [kaes, setKaes] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [filterBrand, setFilterBrand] = useState("");
  const [filterKae, setFilterKae] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [summary, setSummary] = useState<SummaryData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ year: "2026", type: "COM", limit: "5000" });
    if (filterBrand) params.set("brand", filterBrand);
    if (filterKae) params.set("kae", filterKae);
    if (filterClient) params.set("client", filterClient);
    const res = await fetch(`/api/forecast?${params}`);
    const data = await res.json();
    setRecords(data.records);
    setLoading(false);
  }, [filterBrand, filterKae, filterClient]);

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams({ year: "2026" });
    if (filterBrand) params.set("brand", filterBrand);
    if (filterKae) params.set("kae", filterKae);
    if (filterClient) params.set("client", filterClient);
    const res = await fetch(`/api/forecast/summary?${params}`);
    const data = await res.json();
    setSummary(data);
  }, [filterBrand, filterKae, filterClient]);

  useEffect(() => {
    fetchData();
    fetchSummary();
    fetch("/api/catalogs?type=brands").then((r) => r.json()).then(setBrands);
    fetch("/api/catalogs?type=kaes").then((r) => r.json()).then(setKaes);
    fetch("/api/catalogs?type=clients").then((r) => r.json()).then(setClients);
  }, [fetchData, fetchSummary]);

  // Group records by client+sku
  const grouped: GroupedRow[] = [];
  const map = new Map<string, GroupedRow>();
  for (const r of records) {
    const key = `${r.client.code}-${r.sku.code}`;
    if (!map.has(key)) {
      map.set(key, {
        key, clientName: r.client.name, clientCode: r.client.code,
        kae: r.client.kae, brand: r.sku.brand, skuCode: r.sku.code,
        description: r.sku.description, months: {}, total: 0, dpTotal: 0,
      });
      grouped.push(map.get(key)!);
    }
    const g = map.get(key)!;
    g.months[r.month] = r;
    g.total += r.soInputKae ?? r.soForecast;
    g.dpTotal += r.soForecast;
  }

  const handleSave = async (rec: ForecastRow) => {
    await fetch("/api/forecast", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rec.id, soInputKae: editValue }),
    });
    setEditingCell(null);
    fetchData();
    fetchSummary();
  };

  // Summary stats
  const dpTotal = summary ? Object.values(summary.dpByMonth).reduce((s, v) => s + v, 0) : 0;
  const comTotal = summary ? Object.values(summary.comByMonth).reduce((s, v) => s + v, 0) : 0;
  const soTotal = summary ? Object.values(summary.soByMonth).reduce((s, v) => s + v, 0) : 0;
  const soPrevTotal = summary ? Object.values(summary.soPrevByMonth).reduce((s, v) => s + v, 0) : 0;
  const variance = dpTotal > 0 ? ((comTotal - dpTotal) / dpTotal) * 100 : 0;
  const lastClosed = summary?.config?.lastClosedMonth || 0;

  const forecastYear = summary?.year || 2026;
  const prevYear = forecastYear - 1;

  // Chart: monthly DP vs COM vs SO
  const monthlyChartData = MONTHS.map((m, i) => {
    const month = i + 1;
    const point: Record<string, unknown> = {
      name: m,
      "Fcst DP": summary?.dpByMonth[month] || 0,
      "Fcst Comercial": summary?.comByMonth[month] || 0,
    };
    const so = summary?.soByMonth[month];
    if (so) point[`SO ${forecastYear}`] = so;
    const soPrev = summary?.soPrevByMonth[month];
    if (soPrev) point[`SO ${prevYear}`] = soPrev;
    const aop = summary?.aopByMonth[month];
    if (aop) point[`AOP ${summary?.aopYear || forecastYear}`] = aop;
    return point;
  });

  // Chart: Forecast COM vs SO previous year (growth)
  const growthChartData = MONTHS.map((m, i) => {
    const month = i + 1;
    const com = summary?.comByMonth[month] || 0;
    const soPrev = summary?.soPrevByMonth[month] || 0;
    return {
      name: m,
      [`Fcst COM ${forecastYear}`]: com,
      [`SO ${prevYear}`]: soPrev,
    };
  });

  // Filtered clients based on selected KAE
  const filteredClients = filterKae
    ? clients.filter((c) => c.kae === filterKae)
    : clients;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Forecast Comercial</h1>
        <p className="text-gray-500 text-sm">
          Input directo del KAE — Haz clic en cualquier celda para editarla. Los valores se muestran en C9L.
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
            <div className="text-xs text-gray-500 mb-1">Fcst DP {forecastYear}</div>
            <div className="text-xl font-bold text-blue-600">{formatNumber(dpTotal, 0)}</div>
            <div className="text-[11px] text-gray-400">C9L anual</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Fcst Comercial {forecastYear}</div>
            <div className="text-xl font-bold text-emerald-600">{formatNumber(comTotal, 0)}</div>
            <div className={`text-[11px] ${variance === 0 ? "text-gray-400" : variance > 0 ? "text-emerald-500" : "text-red-500"}`}>
              {variance === 0 ? "= DP" : `${variance > 0 ? "+" : ""}${variance.toFixed(1)}% vs DP`}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Ajustes KAE</div>
            <div className="text-xl font-bold text-purple-600">{summary.overrideCount}</div>
            <div className="text-[11px] text-gray-400">de {summary.totalComRecords} celdas</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">Todas las marcas</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={filterKae} onChange={(e) => { setFilterKae(e.target.value); setFilterClient(""); }}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">Todos los KAE</option>
          {kaes.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white min-w-[200px]">
          <option value="">Todos los clientes</option>
          {filteredClients.map((c) => (
            <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
          ))}
        </select>
        {(filterBrand || filterKae || filterClient) && (
          <button
            onClick={() => { setFilterBrand(""); setFilterKae(""); setFilterClient(""); }}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Limpiar filtros
          </button>
        )}
        <span className="text-sm text-gray-500 ml-auto">{grouped.length} registros</span>
      </div>

      {/* Charts */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* DP vs COM vs SO monthly */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              DP vs Comercial vs Sell Out (mensual)
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value) => formatNumber(Number(value))}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey={`AOP ${summary?.aopYear || forecastYear}`} stroke={CHART_COLORS.aop} strokeWidth={1.5} strokeDasharray="6 3" dot={{ r: 2 }} connectNulls={false} />
                <Line type="monotone" dataKey={`SO ${prevYear}`} stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 2 }} connectNulls={false} />
                <Line type="monotone" dataKey={`SO ${forecastYear}`} stroke={CHART_COLORS.so} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="Fcst DP" stroke={CHART_COLORS.dp} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
                <Line type="monotone" dataKey="Fcst Comercial" stroke={CHART_COLORS.com} strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Variance DP vs COM */}
          {/* Forecast COM vs SO previous year */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Forecast Comercial {forecastYear} vs SO Real {prevYear}
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={growthChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value) => formatNumber(Number(value))}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey={`SO ${prevYear}`} fill="#9ca3af" radius={[3, 3, 0, 0]} opacity={0.6} />
                <Bar dataKey={`Fcst COM ${forecastYear}`} fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top brands */}
          {summary.topBrands.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Forecast Comercial por marca
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={summary.topBrands} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="brand" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    formatter={(value) => formatNumber(Number(value))}
                  />
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
                Forecast Comercial por KAE
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={summary.topKaes} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="kae" type="category" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    formatter={(value) => formatNumber(Number(value))}
                  />
                  <Bar dataKey="total" name="C9L Total" fill="#6366f1" radius={[0, 3, 3, 0]} />
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
          <p className="text-[11px] text-gray-400 mt-0.5">Clic en una celda para editar. Celdas editadas se muestran en verde.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[140px] z-10">Cliente</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">KAE</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Marca</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">SKU</th>
                {MONTHS.map((m, i) => (
                  <th key={m} className={`text-right px-2 py-2 font-medium min-w-[65px] ${
                    i + 1 <= lastClosed ? "text-gray-300 bg-gray-100" : "text-gray-500"
                  }`}>{m}</th>
                ))}
                <th className="text-right px-3 py-2 font-semibold text-gray-700 bg-gray-100">FY</th>
                <th className="text-right px-3 py-2 font-medium text-gray-400 bg-gray-100 text-[10px]">vs DP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={18} className="text-center py-12 text-gray-400">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600 mx-auto mb-2" />
                  Cargando...
                </td></tr>
              ) : grouped.length === 0 ? (
                <tr><td colSpan={18} className="text-center py-12 text-gray-400">Sin registros</td></tr>
              ) : grouped.map((g) => {
                const rowVariance = g.dpTotal > 0 ? ((g.total - g.dpTotal) / g.dpTotal) * 100 : 0;
                const hasOverrides = Object.values(g.months).some((r) => r.soInputKae != null);

                return (
                  <tr key={g.key} className={`hover:bg-emerald-50/50 ${hasOverrides ? "bg-emerald-50/30" : ""}`}>
                    <td className="px-3 py-2 sticky left-0 bg-white z-10">
                      <div className="font-medium text-gray-900 truncate max-w-[130px]" title={g.clientName}>
                        {g.clientName}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-500 truncate max-w-[100px]">{g.kae}</td>
                    <td className="px-3 py-2 text-gray-700">{g.brand}</td>
                    <td className="px-3 py-2 text-gray-500 font-mono" title={g.description}>{g.skuCode}</td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = i + 1;
                      const rec = g.months[m];
                      const cellId = `${g.key}-${m}`;
                      const val = rec?.soInputKae ?? rec?.soForecast ?? 0;
                      const isOverride = rec?.soInputKae != null;
                      const isClosed = m <= lastClosed;

                      if (editingCell === cellId && rec && !isClosed) {
                        return (
                          <td key={m} className="px-1 py-1">
                            <input type="number" value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleSave(rec)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleSave(rec); if (e.key === "Escape") setEditingCell(null); }}
                              className="w-full px-1 py-0.5 text-right text-xs border border-emerald-400 rounded bg-emerald-50 focus:outline-none"
                              autoFocus />
                          </td>
                        );
                      }

                      return (
                        <td key={m}
                          className={[
                            "text-right px-2 py-2",
                            isClosed ? "bg-gray-50 text-gray-300" : "cursor-pointer hover:bg-emerald-100",
                            isOverride ? "text-emerald-700 font-semibold" : isClosed ? "" : "text-gray-600",
                          ].join(" ")}
                          onClick={() => {
                            if (rec && !isClosed) {
                              setEditingCell(cellId);
                              setEditValue(String(val || ""));
                            }
                          }}>
                          {val ? formatNumber(val) : isClosed ? "" : <span className="text-gray-200">--</span>}
                        </td>
                      );
                    })}
                    <td className="text-right px-3 py-2 font-semibold text-gray-900 bg-gray-50">
                      {formatNumber(g.total)}
                    </td>
                    <td className={`text-right px-3 py-2 text-[10px] font-medium bg-gray-50 ${
                      rowVariance === 0 ? "text-gray-300" :
                      rowVariance > 0 ? "text-emerald-600" : "text-red-500"
                    }`}>
                      {rowVariance === 0 ? "--" : `${rowVariance > 0 ? "+" : ""}${rowVariance.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-5 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-50 border border-gray-200" />
          Meses cerrados (no editables)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
          Celda editada por KAE
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-white border border-gray-200" />
          Valor original del forecast DP
        </div>
      </div>
    </div>
  );
}
