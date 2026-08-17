"use client";

import { useCallback, useEffect, useState } from "react";
import { wreApi } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";
import WreRadar from "@/components/wtmbtb/wre/WreRadar";
import AddClientModal from "@/components/wtmbtb/wre/modals/AddClientModal";
import QRModal from "@/components/wtmbtb/wre/modals/QRModal";

export default function WrePage() {
  const [clients, setClients] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [qr, setQr] = useState<{ id: string; name: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = (await wreApi.get<any[]>("/clients")).data; // eslint-disable-line @typescript-eslint/no-explicit-any
      setClients(next);
      setSelectedId((current) => current && next.some((c) => c._id === current) ? current : next[0]?._id ?? null);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useSSE(refresh);

  const selected = clients.find((client) => client._id === selectedId) ?? null;

  return (
    <>
      <WreRadar
        clients={clients}
        client={selected}
        onSelect={setSelectedId}
        onAdd={() => setShowAdd(true)}
        onQR={() => selected && setQr({ id: selected._id, name: selected.name })}
        onSaved={refresh}
      />
      {showAdd && <AddClientModal onClose={() => setShowAdd(false)} onAdded={refresh} />}
      {qr && <QRModal clientId={qr.id} name={qr.name} onClose={() => setQr(null)} onConnected={refresh} />}
    </>
  );
}
