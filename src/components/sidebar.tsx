"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  TrendingUp,
  Briefcase,
  Triangle,
  List,
  Upload,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/forecast", label: "Forecast DP", icon: TrendingUp },
  { href: "/forecast-comercial", label: "Forecast Comercial", icon: Briefcase },
  { href: "/triangle", label: "Triángulo", icon: Triangle },
  { href: "/catalogs", label: "Catálogos", icon: List },
  { href: "/import", label: "Importar Datos", icon: Upload },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">COOP</h1>
        <p className="text-sm text-gray-500">Rolling Forecast 2026</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon className="w-[18px] h-[18px] stroke-[1.5]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-400">COOP Forecast v1.0</div>
      </div>
    </aside>
  );
}
