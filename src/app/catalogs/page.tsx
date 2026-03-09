"use client";

import { useEffect, useState } from "react";

interface SkuItem {
  id: string;
  code: string;
  brand: string;
  description: string;
}

interface ClientItem {
  id: string;
  code: string;
  name: string;
  kae: string;
}

export default function CatalogsPage() {
  const [tab, setTab] = useState<"skus" | "clients">("skus");
  const [skus, setSkus] = useState<SkuItem[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (tab === "skus") {
      fetch("/api/catalogs?type=skus").then((r) => r.json()).then(setSkus).finally(() => setLoading(false));
    } else {
      fetch("/api/catalogs?type=clients").then((r) => r.json()).then(setClients).finally(() => setLoading(false));
    }
  }, [tab]);

  const filteredSkus = skus.filter(
    (s) =>
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.brand.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredClients = clients.filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.kae.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Catálogos</h1>
        <p className="text-gray-500">SKUs y Clientes registrados en el sistema</p>
      </div>

      <div className="flex gap-4 items-center">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setTab("skus")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "skus" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            SKUs ({skus.length})
          </button>
          <button
            onClick={() => setTab("clients")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "clients" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            Clientes ({clients.length})
          </button>
        </div>
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1 max-w-xs"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Cargando...</div>
        ) : tab === "skus" ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Código</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Marca</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSkus.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-gray-700">{s.code}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{s.brand}</td>
                  <td className="px-4 py-2.5 text-gray-600">{s.description}</td>
                </tr>
              ))}
              {filteredSkus.length === 0 && (
                <tr><td colSpan={3} className="text-center py-8 text-gray-400">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Código</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">KAE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredClients.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-gray-700">{c.code}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-2.5 text-gray-600">{c.kae}</td>
                </tr>
              ))}
              {filteredClients.length === 0 && (
                <tr><td colSpan={3} className="text-center py-8 text-gray-400">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
