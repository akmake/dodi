"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { wtaApi, ApiError } from "@/lib/wtmbtb/api";
import Modal from "@/components/wtmbtb/ui/Modal";
import Field from "@/components/wtmbtb/ui/Field";

export default function EditClientModal({ client, onClose, onSaved }: { client: any; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(client.name || "");
  const [phone, setPhone] = useState(client.phone || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await wtaApi.put(`/clients/${client._id}`, { action: "info", name, phone });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.response.data.error || "שגיאה" : "שגיאה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="text-lg font-bold mb-1 text-[#111b21]">עריכת לקוח</h3>
      <p className="text-sm text-[#8696a0] mb-5">עדכון שם ומספר וואטסאפ</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="שם הלקוח">
          <input className="input-base" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="מספר וואטסאפ">
          <input className="input-base" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </Field>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={loading} className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 transition text-sm">
            {loading ? "..." : "שמור"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-200 transition text-sm">
            ביטול
          </button>
        </div>
      </form>
    </Modal>
  );
}
