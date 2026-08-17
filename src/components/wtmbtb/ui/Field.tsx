// Port of Whatsapp/client/src/components/ui/Field.jsx
export default function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#111b21] mb-1">{label}</label>
      {hint && <p className="text-xs text-[#8696a0] mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}
