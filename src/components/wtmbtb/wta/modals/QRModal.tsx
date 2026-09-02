"use client";
import Modal from "@/components/wtmbtb/ui/Modal";

export default function QRModal({ qrModal, onClose }: { qrModal: { id: string; qr: string; name: string }; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="text-center">
        <p className="text-lg font-bold mb-1 text-[#111b21]">{qrModal.name}</p>
        <p className="text-sm text-[#8696a0] mb-5">סרוק עם וואטסאפ</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrModal.qr} alt="QR" className="mx-auto w-60 h-60 rounded-xl" />
        <p className="text-xs text-[#8696a0] mt-4">וואטסאפ ← מכשירים מקושרים ← קשר מכשיר</p>
      </div>
    </Modal>
  );
}
