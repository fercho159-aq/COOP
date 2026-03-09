"use client";

import { useEffect, useState } from "react";
import { MONTHS, formatNumber } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

interface DashboardData {
  totalSkus: number;
  totalClients: number;
  currentYear: number;
  lastClosedMonth: number;
  remainingMonths: number;
  prevYear: number;
  aopYear: number;
  soByMonth: Record<number, number>;
  soPrevByMonth: Record<number, number>;
  aopByMonth: Record<number, number>;
  dpByMonth: Record<number, number>;
  comByMonth: Record<number, number>;
  siByMonth: Record<number, number>;
  siDpByMonth: Record<number, number>;
  soTotal: number;
  soPrevTotal: number;
  aopTotal: number;
  dpTotal: number;
  comTotal: number;
  siTotal: number;
  siDpTotal: number;
  inventory: number;
  comOverrides: number;
  comTotalRecords: number;
  topBrands: { brand: string; total: number }[];
  topKaes: { kae: string; total: number }[];
  accuracyPct: number | null;
}

const BRAND_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#ef4444", "#14b8a6", "#8b5cf6", "#f97316", "#06b6d4",
];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard?year=2026")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!data?.totalSkus) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Sin datos cargados</h3>
          <p className="text-gray-500 mb-4">Importa tus archivos Excel para comenzar a usar el forecast.</p>
          <a href="/import" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Ir a Importar Datos
          </a>
        </div>
      </div>
    );
  }

  const d = data;
  const year = d.currentYear;
  const dpVsAop = d.aopTotal > 0 ? ((d.dpTotal - d.aopTotal) / d.aopTotal) * 100 : 0;
  const dpVsSoPrev = d.soPrevTotal > 0 ? ((d.dpTotal - d.soPrevTotal) / d.soPrevTotal) * 100 : 0;
  const comVsDp = d.dpTotal > 0 ? ((d.comTotal - d.dpTotal) / d.dpTotal) * 100 : 0;

  // Chart: main lines
  const monthlyChart = MONTHS.map((m, i) => {
    const month = i + 1;
    const point: Record<string, unknown> = { name: m };
    const aop = d.aopByMonth[month];
    if (aop) point[`AOP ${d.aopYear}`] = aop;
    const soPrev = d.soPrevByMonth[month];
    if (soPrev) point[`SO ${d.prevYear}`] = soPrev;
    const so = d.soByMonth[month];
    if (so) point[`SO ${year}`] = so;
    point["Fcst DP"] = d.dpByMonth[month] || 0;
    point["Fcst COM"] = d.comByMonth[month] || 0;
    return point;
  });

  // Chart: DP vs SO prev year bars
  const vsChart = MONTHS.map((m, i) => {
    const month = i + 1;
    return {
      name: m,
      [`SO ${d.prevYear}`]: d.soPrevByMonth[month] || 0,
      [`Fcst DP ${year}`]: d.dpByMonth[month] || 0,
    };
  });

  // Comparison table
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const sum = (obj: Record<number, number>) => Object.values(obj).reduce((s, v) => s + v, 0);

  const tableRows = [
    { label: `AOP ${d.aopYear}`, data: d.aopByMonth, color: "text-purple-700", bg: "bg-purple-50" },
    { label: `SO ${d.prevYear}`, data: d.soPrevByMonth, color: "text-gray-600", bg: "" },
    { label: `SO ${year}`, data: d.soByMonth, color: "text-amber-700", bg: "bg-amber-50" },
    { label: `Sell In ${year}`, data: d.siByMonth, color: "text-teal-700", bg: "" },
    { label: "Fcst DP (SO)", data: d.dpByMonth, color: "text-blue-700", bg: "bg-blue-50" },
    { label: "Fcst DP (SI)", data: d.siDpByMonth, color: "text-blue-500", bg: "" },
    { label: "Fcst COM", data: d.comByMonth, color: "text-emerald-700", bg: "bg-emerald-50" },
  ];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm">Rolling Forecast {year} — Resumen General</p>
      </div>

      {/* KPI Row 1: Volume */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] text-gray-500 mb-1">SKUs</div>
          <div className="text-2xl font-bold text-gray-900">{d.totalSkus}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] text-gray-500 mb-1">Clientes</div>
          <div className="text-2xl font-bold text-gray-900">{d.totalClients}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] text-gray-500 mb-1">Mes Cerrado</div>
          <div className="text-2xl font-bold text-amber-600">{d.lastClosedMonth > 0 ? MONTHS[d.lastClosedMonth - 1] : "--"}</div>
          <div className="text-[10px] text-gray-400">{d.remainingMonths} restantes</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] text-gray-500 mb-1">Inventario</div>
          <div className="text-2xl font-bold text-gray-700">{formatNumber(d.inventory, 0)}</div>
          <div className="text-[10px] text-gray-400">C9L</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] text-gray-500 mb-1">SO {d.prevYear}</div>
          <div className="text-xl font-bold text-gray-600">{formatNumber(d.soPrevTotal, 0)}</div>
          <div className="text-[10px] text-gray-400">C9L anual</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] text-gray-500 mb-1">SO {year}</div>
          <div className="text-xl font-bold text-amber-600">{formatNumber(d.soTotal, 0)}</div>
          <div className="text-[10px] text-gray-400">{d.lastClosedMonth > 0 ? `Mes 1-${d.lastClosedMonth}` : "Sin datos"}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] text-gray-500 mb-1">AOP {d.aopYear}</div>
          <div className="text-xl font-bold text-purple-600">{formatNumber(d.aopTotal, 0)}</div>
          <div className="text-[10px] text-gray-400">C9L anual</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] text-gray-500 mb-1">Sell In {year}</div>
          <div className="text-xl font-bold text-teal-600">{formatNumber(d.siTotal, 0)}</div>
          <div className="text-[10px] text-gray-400">C9L</div>
        </div>
      </div>

      {/* KPI Row 2: Forecast */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <div className="text-[11px] text-blue-600 mb-1">Fcst DP {year} (SO)</div>
          <div className="text-2xl font-bold text-blue-700">{formatNumber(d.dpTotal, 0)}</div>
          <div className={`text-[11px] ${dpVsAop >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {d.aopTotal > 0 ? `${dpVsAop > 0 ? "+" : ""}${dpVsAop.toFixed(1)}% vs AOP` : ""}
          </div>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <div className="text-[11px] text-blue-600 mb-1">Fcst DP {year} (SI)</div>
          <div className="text-2xl font-bold text-blue-600">{formatNumber(d.siDpTotal, 0)}</div>
          <div className="text-[10px] text-gray-400">C9L anual</div>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <div className="text-[11px] text-emerald-600 mb-1">Fcst Comercial {year}</div>
          <div className="text-2xl font-bold text-emerald-700">{formatNumber(d.comTotal, 0)}</div>
          <div className={`text-[11px] ${comVsDp === 0 ? "text-gray-400" : comVsDp > 0 ? "text-emerald-600" : "text-red-500"}`}>
            {comVsDp === 0 ? "= DP" : `${comVsDp > 0 ? "+" : ""}${comVsDp.toFixed(1)}% vs DP`}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] text-gray-500 mb-1">DP vs SO {d.prevYear}</div>
          <div className={`text-2xl font-bold ${dpVsSoPrev >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {dpVsSoPrev >= 0 ? "+" : ""}{dpVsSoPrev.toFixed(1)}%
          </div>
          <div className="text-[10px] text-gray-400">{formatNumber(d.dpTotal - d.soPrevTotal, 0)} C9L</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] text-gray-500 mb-1">Precision Fcst</div>
          {d.accuracyPct != null ? (
            <>
              <div className={`text-2xl font-bold ${d.accuracyPct >= 80 ? "text-emerald-600" : d.accuracyPct >= 60 ? "text-amber-600" : "text-red-500"}`}>
                {d.accuracyPct.toFixed(1)}%
              </div>
              <div className="text-[10px] text-gray-400">Meses 1-{d.lastClosedMonth}</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-300">--</div>
              <div className="text-[10px] text-gray-400">Sin meses cerrados</div>
            </>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lines */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Comparativo mensual {year} (C9L)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                formatter={(value) => formatNumber(Number(value))} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey={`AOP ${d.aopYear}`} stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="6 3" dot={{ r: 2 }} connectNulls={false} />
              <Line type="monotone" dataKey={`SO ${d.prevYear}`} stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 2 }} connectNulls={false} />
              <Line type="monotone" dataKey={`SO ${year}`} stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              <Line type="monotone" dataKey="Fcst DP" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Fcst COM" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bars: DP vs SO prev */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Fcst DP {year} vs SO Real {d.prevYear}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={vsChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                formatter={(value) => formatNumber(Number(value))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey={`SO ${d.prevYear}`} fill="#9ca3af" radius={[3, 3, 0, 0]} opacity={0.6} />
              <Bar dataKey={`Fcst DP ${year}`} fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Brands */}
        {d.topBrands.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Forecast DP por marca</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={d.topBrands} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="brand" type="category" tick={{ fontSize: 10 }} width={100} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value) => formatNumber(Number(value))} />
                <Bar dataKey="total" name="C9L Total" radius={[0, 3, 3, 0]}>
                  {d.topBrands.map((_, i) => (
                    <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* KAE */}
        {d.topKaes.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Forecast DP por KAE</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={d.topKaes} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="kae" type="category" tick={{ fontSize: 10 }} width={120} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value) => formatNumber(Number(value))} />
                <Bar dataKey="total" name="C9L Total" fill="#6366f1" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Monthly Comparison Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Comparativo Mensual (C9L)</h2>
          <p className="text-sm text-gray-500">AOP vs Sell Out vs Sell In vs Forecast DP vs Forecast Comercial</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[140px] z-10">Dato</th>
                {months.map((m) => (
                  <th key={m} className={`text-right px-3 py-3 font-medium min-w-[80px] ${
                    m <= d.lastClosedMonth ? "text-gray-400 bg-gray-100/50" : "text-gray-500"
                  }`}>{MONTHS[m - 1]}</th>
                ))}
                <th className="text-right px-4 py-3 font-medium text-gray-700 bg-gray-100">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.label} className={`border-t border-gray-100 ${row.bg}`}>
                  <td className={`px-4 py-2.5 font-medium whitespace-nowrap sticky left-0 z-10 ${row.color} ${row.bg || "bg-white"}`}>
                    {row.label}
                  </td>
                  {months.map((m) => (
                    <td key={m} className={`text-right px-3 py-2.5 tabular-nums ${
                      m <= d.lastClosedMonth ? "bg-gray-50/50" : ""
                    } ${row.color}`}>
                      {row.data[m] ? formatNumber(row.data[m]) : <span className="text-gray-200">--</span>}
                    </td>
                  ))}
                  <td className={`text-right px-4 py-2.5 font-bold tabular-nums bg-gray-50 ${row.color}`}>
                    {formatNumber(sum(row.data))}
                  </td>
                </tr>
              ))}
              {/* Variance row */}
              <tr className="border-t-2 border-gray-300 bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-700 sticky left-0 bg-gray-50 z-10 whitespace-nowrap">
                  Var Fcst vs AOP
                </td>
                {months.map((m) => {
                  const hasDp = d.dpByMonth[m] !== undefined && d.dpByMonth[m] !== 0;
                  const hasAop = d.aopByMonth[m] !== undefined && d.aopByMonth[m] !== 0;
                  if (!hasDp && !hasAop) {
                    return <td key={m} className="text-right px-3 py-2.5"><span className="text-gray-200">--</span></td>;
                  }
                  if (!hasDp || !hasAop) {
                    return <td key={m} className="text-right px-3 py-2.5 text-gray-300">--</td>;
                  }
                  const diff = d.dpByMonth[m] - d.aopByMonth[m];
                  return (
                    <td key={m} className={`text-right px-3 py-2.5 font-medium tabular-nums ${diff >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {formatNumber(diff)}
                    </td>
                  );
                })}
                {(() => {
                  let dpSum = 0, aopSum = 0;
                  for (const m of months) {
                    if (d.dpByMonth[m] && d.aopByMonth[m]) {
                      dpSum += d.dpByMonth[m];
                      aopSum += d.aopByMonth[m];
                    }
                  }
                  const totalDiff = dpSum - aopSum;
                  return (
                    <td className={`text-right px-4 py-2.5 font-bold tabular-nums ${totalDiff >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {formatNumber(totalDiff)}
                    </td>
                  );
                })()}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
