"use client";

import { useState, useRef } from "react";
import { ChevronDown, ChevronUp, FileSpreadsheet, Info } from "lucide-react";

const IMPORT_TYPES = [
  { value: "all", label: "Todo (auto-detectar hojas)", description: "Importa SKUs, Clientes, Precios, Sell Out, Sell In, Forecast y Ponderaciones" },
  { value: "skus", label: "SKUs", description: "Desde hoja 'Precios' o catálogo de productos" },
  { value: "clients", label: "Clientes", description: "Desde hoja 'IMPORT_CLIENTES' o similar" },
  { value: "prices", label: "Precios", description: "Desde hoja 'Precios'" },
  { value: "sellout", label: "Sell Out", description: "Desde hoja 'SO LY' — datos de sell out por mes" },
  { value: "sellin", label: "Sell In", description: "Desde hoja 'SI LY' o 'SOLPED'" },
  { value: "forecast_dp", label: "Forecast DP", description: "Desde hoja 'Fcst DP' — Demand Planning en C9L" },
  { value: "forecast_com", label: "Forecast Comercial", description: "Desde hoja 'Fcst Comercial' — en cajas fisicas" },
  { value: "seasonal", label: "Ponderacion Estacional", description: "Desde hoja 'Ponderacion Sell Out'" },
];

interface SheetTemplate {
  sheet: string;
  startRow: string;
  columns: { name: string; example: string; required: boolean }[];
  notes?: string;
}

const TEMPLATES: Record<string, SheetTemplate[]> = {
  skus: [
    {
      sheet: "Precios",
      startRow: "Fila 1 (con encabezados)",
      columns: [
        { name: "SKU", example: "DA02001", required: true },
        { name: "Marca", example: "Danzantes", required: true },
        { name: "Categoria", example: "Mezcal", required: true },
        { name: "Variante", example: "Joven Espadin", required: true },
        { name: "ml", example: "750", required: false },
        { name: "Botellas x Caja", example: "6", required: false },
      ],
    },
  ],
  clients: [
    {
      sheet: "IMPORT_CLIENTES",
      startRow: "Fila 4 (encabezados en fila 4)",
      columns: [
        { name: "CODIGO FORECAST", example: "C-0001A", required: true },
        { name: "C_FAMILIA", example: "C-0001", required: true },
        { name: "CLIENTE", example: "Berima", required: true },
        { name: "KAE", example: "KAE Especializados Sureste", required: true },
        { name: "NOMBRE OFICIAL", example: "BERIMA S.A.", required: false },
      ],
    },
  ],
  prices: [
    {
      sheet: "Precios",
      startRow: "Fila 1 (con encabezados)",
      columns: [
        { name: "SKU", example: "DA02001", required: true },
        { name: "LISTA", example: "L6", required: true },
        { name: "RSP Especializados", example: "1099", required: false },
        { name: "RSP Moderno", example: "1190", required: false },
        { name: "Precio Lista c/Impuestos", example: "912.17", required: false },
        { name: "Precio Pz Esp Lista s/Impuestos", example: "513.96", required: false },
        { name: "Precio Caja s/Impuestos", example: "3083.76", required: false },
      ],
    },
  ],
  sellout: [
    {
      sheet: "SO LY",
      startRow: "Fila 1 (con encabezados)",
      columns: [
        { name: "COD. CLIENTE", example: "C-0156A", required: true },
        { name: "SKU", example: "AL02001", required: true },
        { name: "Ano", example: "2025", required: true },
        { name: "Mes_Numero", example: "1", required: true },
        { name: "SO Botella", example: "5", required: true },
        { name: "SO_C9L", example: "0.4167", required: true },
        { name: "IN Botella", example: "121", required: false },
        { name: "INV_C9L", example: "10.083", required: false },
      ],
      notes: "Se puede usar tambien 'Cod Cliente Forecast' en lugar de 'COD. CLIENTE'. Los datos de inventario (IN Botella, INV_C9L) se importan automaticamente.",
    },
  ],
  sellin: [
    {
      sheet: "SI LY o SOLPED",
      startRow: "Fila 4 (encabezados en fila 4)",
      columns: [
        { name: "MES", example: "ENERO", required: true },
        { name: "ID CLIENTE", example: "C-0074", required: true },
        { name: "ID SKU", example: "DD06001", required: true },
        { name: "PIEZAS PEDIDO", example: "12", required: true },
        { name: "PRODUCTO", example: "2", required: true },
        { name: "C9L", example: "1.5", required: true },
        { name: "NUM SOLICITUD PEDIDO", example: "2500000", required: false },
        { name: "SUBTOTAL SIN IMPUESTOS", example: "1714.85", required: false },
        { name: "DESCUENTO", example: "34.29", required: false },
      ],
      notes: "El mes se escribe en texto (ENERO, FEBRERO, etc.). El ano se asume como 2025. PRODUCTO = cajas fisicas.",
    },
  ],
  forecast_dp: [
    {
      sheet: "Fcst DP",
      startRow: "Fila 9 (encabezados en fila 9)",
      columns: [
        { name: "C_Cliente_Hijo Forecast", example: "C-0052A", required: true },
        { name: "Sku", example: "AB07001", required: true },
        { name: "SO FCST ENE ... DIC", example: "0.0508", required: true },
        { name: "SI FCST ENE ... DIC", example: "0.2178", required: false },
      ],
      notes: "Valores en Cajas 9L. Las columnas de SO van de 'SO FCST ENE' a 'SO FCST DIC' (12 columnas). Igual para SI FCST. Las filas de configuracion (filas 1-4) definen: Meses Restantes, Mes Ultimo Cierre, Ano Corriente, Ano Anterior.",
    },
  ],
  forecast_com: [
    {
      sheet: "Fcst Comercial",
      startRow: "Fila 8 (encabezados en fila 8)",
      columns: [
        { name: "C_Cliente_FCST", example: "C-0052A", required: true },
        { name: "Sku", example: "AB07001", required: true },
        { name: "ENE ... DIC", example: "0.1089", required: true },
      ],
      notes: "Valores en Cajas Fisicas. 12 columnas mensuales (ENE a DIC) con el forecast de Sell Out del KAE. Opcionalmente se pueden agregar columnas de 'SO Input KAE' para ajustes manuales.",
    },
  ],
  seasonal: [
    {
      sheet: "Ponderacion Sell Out",
      startRow: "Fila 1 (con encabezados)",
      columns: [
        { name: "MES FORECAST RESTANTES", example: "12", required: true },
        { name: "MES PROYECTADO", example: "1", required: true },
        { name: "PONDERACION SELL OUT", example: "0.0665", required: true },
      ],
      notes: "Define como se distribuye el volumen pendiente entre los meses restantes. Por ejemplo, con 12 meses restantes y mes proyectado 1, el peso 0.0665 indica que enero recibe el 6.65% del volumen pendiente.",
    },
  ],
};

export default function ImportPage() {
  const [importType, setImportType] = useState("all");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", importType);

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data.imported);
      }
    } catch (e) {
      setError(`Error de conexión: ${e instanceof Error ? e.message : "Unknown"}`);
    }

    setUploading(false);
  };

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar Datos</h1>
        <p className="text-gray-500">Carga tus archivos Excel del Rolling Forecast</p>
      </div>

      {/* File Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Archivo Excel (.xlsx)
          </label>
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setResult(null);
                setError(null);
              }}
            />
            {file ? (
              <div>
                <p className="text-lg font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div>
                <p className="text-gray-500">Arrastra o haz clic para seleccionar archivo</p>
                <p className="text-xs text-gray-400 mt-1">Rolling Forecast 2026 - Moderno.xlsx o Triángulo_Escaleras</p>
              </div>
            )}
          </div>
        </div>

        {/* Import Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo de importación
          </label>
          <div className="space-y-2">
            {IMPORT_TYPES.map((t) => (
              <label
                key={t.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  importType === t.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="importType"
                  value={t.value}
                  checked={importType === t.value}
                  onChange={(e) => setImportType(e.target.value)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">{t.label}</div>
                  <div className="text-xs text-gray-500">{t.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Import Button */}
        <button
          onClick={handleImport}
          disabled={!file || uploading}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Importando...
            </>
          ) : (
            "Importar Datos"
          )}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <h3 className="font-semibold text-green-800 mb-3">Importación exitosa</h3>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(result).map(([key, count]) => (
              <div key={key} className="flex justify-between items-center bg-white rounded-lg px-4 py-2">
                <span className="text-sm text-gray-600 capitalize">{key.replace("_", " ")}</span>
                <span className="font-semibold text-green-700">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h3 className="font-semibold text-red-800 mb-1">Error</h3>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Template Reference */}
      <TemplateReference importType={importType} />
    </div>
  );
}

function TemplateReference({ importType }: { importType: string }) {
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);

  // For "all", show all templates
  const templates: SheetTemplate[] =
    importType === "all"
      ? Object.values(TEMPLATES).flat()
      : TEMPLATES[importType] || [];

  if (templates.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Plantilla de columnas requeridas</h3>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Asegurate de que tu archivo Excel tenga estas columnas en las hojas correspondientes.
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {templates.map((tpl) => {
          const isOpen = expandedSheet === tpl.sheet || templates.length === 1;
          return (
            <div key={tpl.sheet}>
              <button
                onClick={() =>
                  setExpandedSheet(isOpen && templates.length > 1 ? null : tpl.sheet)
                }
                className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    {tpl.sheet}
                  </span>
                  <span className="text-xs text-gray-400">{tpl.startRow}</span>
                </div>
                {templates.length > 1 && (
                  isOpen
                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {isOpen && (
                <div className="px-6 pb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-100">
                        <th className="pb-2 font-medium w-2/5">Columna</th>
                        <th className="pb-2 font-medium w-2/5">Ejemplo</th>
                        <th className="pb-2 font-medium text-right w-1/5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {tpl.columns.map((col) => (
                        <tr key={col.name}>
                          <td className="py-1.5 font-mono text-gray-700">{col.name}</td>
                          <td className="py-1.5 text-gray-400">{col.example}</td>
                          <td className="py-1.5 text-right">
                            {col.required ? (
                              <span className="text-[10px] font-medium text-red-400 bg-red-50 px-1.5 py-0.5 rounded">
                                requerido
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded">
                                opcional
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {tpl.notes && (
                    <div className="mt-3 flex gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{tpl.notes}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
