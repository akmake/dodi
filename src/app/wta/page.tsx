"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { wtaApi, ApiError } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";
import ClientSidebar from "@/components/wtmbtb/wta/ClientSidebar";
import ClientPanel from "@/components/wtmbtb/wta/ClientPanel";
import AddClientModal from "@/components/wtmbtb/wta/modals/AddClientModal";
import EditClientModal from "@/components/wtmbtb/wta/modals/EditClientModal";
import QRModal from "@/components/wtmbtb/wta/modals/QRModal";

export default function WtaAdminPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editClient, setEditClient] = useState<any>(null);
  const [qrModal, setQrModal] = useState<any>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      setClients((await wtaApi.get<any[]>("/clients")).data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);
  useSSE(fetchClients);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`למחוק את "${name}"? הבוט ינותק והחיבור יימחק.`)) return;
    await wtaApi.del(`/clients/${id}`);
    if (selectedId === id) setSelectedId(null);
    fetchClients();
  };

  const openQR = async (c: any) => {
    setQrLoading(true);
    try {
      const res = await wtaApi.get<any>(`/clients/${c._id}/qr`);
      setQrModal({ id: c._id, qr: res.data.qr, name: c.name });
    } catch (e) {
      alert(e instanceof ApiError ? e.response.data.error || "QR לא זמין כרגע" : "QR לא זמין כרגע");
    } finally {
      setQrLoading(false);
    }
  };

  const selected = clients.find((c) => c._id === selectedId);

  return (
    <div className="flex h-full" style={{ direction: "ltr" }}>
      <ClientSidebar clients={clients} selectedId={selectedId} onSelect={setSelectedId} onAdd={() => setShowAdd(true)} />

      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50" style={{ direction: "rtl" }}>
        {selected ? (
          <ClientPanel
            key={selected._id}
            client={selected}
            onQR={() => openQR(selected)}
            qrLoading={qrLoading}
            onReconnect={() => wtaApi.post(`/clients/${selected._id}/reconnect`).then(fetchClients)}
            onDelete={() => handleDelete(selected._id, selected.name)}
            onEdit={() => setEditClient(selected)}
            onSaved={fetchClients}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none">
            <div className="w-20 h-20 rounded-2xl bg-slate-200 flex items-center justify-center mb-5 text-4xl">🛡️</div>
            <h3 className="text-xl font-semibold text-slate-700 mb-1.5">בחר לקוח</h3>
            <p className="text-sm text-slate-400 max-w-xs leading-relaxed">בחר לקוח מהרשימה כדי לנהל את הבוט, הקבוצות וחוקי המודרציה</p>
            {clients.length === 0 && (
              <button onClick={() => setShowAdd(true)} className="mt-6 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition shadow-sm">
                + הוסף לקוח ראשון
              </button>
            )}
          </div>
        )}
      </div>

      {showAdd && <AddClientModal onClose={() => setShowAdd(false)} onAdded={fetchClients} />}
      {editClient && <EditClientModal client={editClient} onClose={() => setEditClient(null)} onSaved={fetchClients} />}
      {qrModal && <QRModal qrModal={qrModal} onClose={() => setQrModal(null)} />}
    </div>
  );
}
