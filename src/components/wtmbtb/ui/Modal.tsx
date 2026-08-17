"use client";
// Port of Whatsapp/client/src/components/ui/Modal.jsx
export default function Modal({
  onClose,
  children,
  className = "max-w-sm",
}: {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
