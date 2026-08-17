"use client";
// Port of Whatsapp/client/src/components/admin/modals/ContractModal.jsx
import { useEffect, useRef } from "react";

export default function ContractModal({ onClose }: { onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  };

  const handleDownloadPdf = () => {
    const w = window.open("/contract.html", "_blank");
    if (!w) return;
    w.addEventListener("load", () => {
      w.focus();
      w.print();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ direction: "rtl" }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex flex-col m-4 md:m-8 rounded-2xl overflow-hidden shadow-2xl bg-white flex-1 min-h-0">
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3.5 py-2 rounded-lg transition"
            >
              הדפס
            </button>
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 rounded-lg transition shadow-sm"
            >
              הורד PDF
            </button>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
            <span className="text-sm font-semibold text-slate-700">הסכם שירות — גרסת בטא</span>
          </div>
        </div>
        <div className="flex-1 bg-slate-100 overflow-hidden">
          <iframe ref={iframeRef} src="/contract.html" className="w-full h-full border-0" title="הסכם שירות" />
        </div>
      </div>
    </div>
  );
}
