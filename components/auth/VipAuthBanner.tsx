export default function VipAuthBanner() {
  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-2.5 rounded-2xl border border-[#F0C575]/35 bg-[#F0C575]/[0.08] px-3.5 py-3 text-[11px] leading-5 text-[#F3EFE6] sm:px-4"
    >
      <span aria-hidden="true" className="pt-px text-base">👑</span>
      <p><strong className="font-semibold text-[#F0C575]">Rattachement VIP · étape 1 sur 3</strong>{" — Créez votre compte (ou connectez-vous), puis vous revenez automatiquement à votre adhésion VIP."}</p>
    </div>
  );
}
