"use client";
/**
 * Top bar with the service switcher — port of
 * `Whatsapp/client/src/components/layout/AppNavbar.jsx`, using next/navigation
 * instead of react-router. A discreet logout (bootWhat's shared session) is
 * added on the far side, since the unified shell has no other logout affordance.
 */
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import ContractModal from "./ContractModal";
import { SERVICE_LIST, serviceFromPath, type ServiceDef } from "@/lib/wtmbtb/services";
import { useAccess } from "@/lib/access/useAccess";
import type { ServiceId } from "@/modules/admin/models";

function ServiceSwitcher({ current }: { current: ServiceDef | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { allowedServices } = useAccess();
  const services = SERVICE_LIST.filter((s) => allowedServices.includes(s.id as ServiceId));

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-semibold text-white hover:bg-white/10 transition"
      >
        <span>{current ? current.name : "בחר שירות"}</span>
        <svg className={`w-3.5 h-3.5 transition ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-60 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 text-right">
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setOpen(false);
                if (s.active) router.push(s.path);
              }}
              disabled={!s.active}
              className={`w-full px-3 py-2 flex items-center gap-3 text-right transition
                ${s.active ? "hover:bg-gray-50 cursor-pointer" : "opacity-50 cursor-not-allowed"}
                ${current?.id === s.id ? "bg-gray-50" : ""}`}
            >
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-xs flex-shrink-0"
                style={{ backgroundColor: s.color }}
              >
                {s.name}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-[#111b21]">{s.name}</span>
                <span className="block text-xs text-gray-400 truncate">{s.title}</span>
              </span>
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/services");
              }}
              className="w-full px-3 py-2 text-right text-sm text-gray-500 hover:bg-gray-50 transition"
            >
              כל השירותים
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppNavbar() {
  const [showContract, setShowContract] = useState(false);
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const current = serviceFromPath(pathname);
  const headerColor = current?.color || "#075E54";
  const accent = current?.accent || "#25D366";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="text-white flex-shrink-0 shadow transition-colors" style={{ backgroundColor: headerColor }}>
        <div className="px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/services"
              className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-sm"
              style={{ backgroundColor: accent }}
            >
              B
            </Link>
            <ServiceSwitcher current={current} />
          </div>

          <nav className="flex items-center gap-1">
            {current?.nav?.map((item) => {
              const active = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${active ? "bg-white/20" : "text-white/60 hover:text-white hover:bg-white/10"}`}
                >
                  {item.label}
                </Link>
              );
            })}

            {current?.id === "wtm" && (
              <>
                <span className="w-px h-5 bg-white/20 mx-1" />
                <button
                  onClick={() => setShowContract(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition"
                >
                  חוזה
                </button>
              </>
            )}

            <span className="w-px h-5 bg-white/20 mx-1" />
            <button
              onClick={logout}
              title="התנתקות"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition"
            >
              <LogOut size={16} />
            </button>
          </nav>
        </div>
      </header>

      {showContract && <ContractModal onClose={() => setShowContract(false)} />}
    </>
  );
}
