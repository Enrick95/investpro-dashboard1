"use client";

import Link from "next/link";
import {
  Activity,
  Apple,
  BarChart3,
  Check,
  LineChart,
  LockKeyhole,
  MonitorSmartphone,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";

const SOCIAL_PROOF = "+400 traders";

export default function AuthExperienceShell({
  children,
  mode,
}: {
  children: ReactNode;
  mode: "login" | "register" | "reset";
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050605] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#d9ac43]/[0.08] blur-[130px]" />
        <div className="absolute -bottom-56 right-[-140px] h-[620px] w-[620px] rounded-full bg-[#d9ac43]/[0.05] blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.025)_0,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1540px] items-stretch p-3 md:p-5 lg:p-7">
        <div className="grid w-full overflow-hidden rounded-[30px] border border-white/[0.07] bg-[#080a08]/90 shadow-[0_40px_120px_rgba(0,0,0,.48)] lg:grid-cols-[1.1fr_.9fr]">
          <section className="relative hidden overflow-hidden border-r border-white/[0.06] p-9 lg:flex lg:flex-col lg:justify-between xl:p-12">
            <div className="pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-[#d9ac43]/[0.08] blur-[100px]" />

            <div className="relative">
              <Brand />

              <div className="mt-12 max-w-[690px]">
                <LiveCommunity />

                <h1 className="mt-6 text-[46px] font-semibold leading-[1.02] tracking-[-0.045em] xl:text-[58px]">
                  Ton trading mérite plus qu&apos;un simple historique.
                </h1>

                <p className="mt-5 max-w-[620px] text-[15px] leading-7 text-white/48">
                  Centralise tes comptes CFD & Futures, ton journal, ton plan et tes rapports, puis réplique tes trades sur plusieurs comptes depuis un seul espace.
                </p>

                <div className="mt-7 grid max-w-[650px] grid-cols-2 gap-2.5 xl:grid-cols-3">
                  <Benefit icon={<Activity size={15} />} text="Journal intelligent" />
                  <Benefit icon={<BarChart3 size={15} />} text="Rapports avancés" />
                  <Benefit icon={<ShieldCheck size={15} />} text="Discipline & risque" />
                  <Benefit icon={<WalletCards size={15} />} text="CFD & Futures" />
                  <Benefit icon={<Repeat2 size={15} />} text="Copy multi-comptes" />
                  <Benefit icon={<TrendingUp size={15} />} text="Classement & défis" />
                  <Benefit icon={<MonitorSmartphone size={15} />} text="App mobile" />
                </div>
              </div>
            </div>

            <div className="relative mt-10 grid grid-cols-[1.2fr_.8fr] gap-3">
              <DashboardPreview />

              <div className="space-y-3">
                <TrustCard
                  icon={<LockKeyhole size={17} />}
                  title="Connexion sécurisée"
                  text="E-mail / mot de passe ou connexion Google."
                />
                <TrustCard
                  icon={<MonitorSmartphone size={17} />}
                  title="Comme une vraie app"
                  text="Ajoute InvestPro sur iPhone ou Android en quelques secondes."
                />
              </div>
            </div>
          </section>

          <section className="relative flex min-h-[calc(100vh-24px)] items-center justify-center p-4 sm:p-7 lg:min-h-0 lg:p-10 xl:p-14">
            <div className="w-full max-w-[500px]">
              <div className="mb-7 lg:hidden">
                <Brand />
                <div className="mt-5">
                  <LiveCommunity compact />
                </div>
              </div>

              {children}

              <div className="mt-6 grid grid-cols-3 gap-2 text-center lg:hidden">
                <MobileTrust icon={<ShieldCheck size={13} />} text="Sécurisé" />
                <MobileTrust icon={<BarChart3 size={13} />} text="Analytics" />
                <MobileTrust icon={<MonitorSmartphone size={13} />} text="App mobile" />
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[9px] text-white/28">
                <span>© InvestPro Trading</span>
                <span>•</span>
                <span>Données privées</span>
                <span>•</span>
                <span>Aucun ordre envoyé</span>
              </div>

              {mode !== "reset" ? (
                <div className="mt-4 text-center text-[9px] text-white/22">
                  Le trading comporte un risque de perte en capital.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-3 no-underline">
      <div className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#d9ac43]/25 bg-[#d9ac43]/[0.08] shadow-[0_0_30px_rgba(217,172,67,.07)]">
        <LineChart size={21} className="text-[#e5b94d]" />
      </div>
      <div className="leading-none">
        <div className="text-[21px] font-bold tracking-[-0.03em] text-white">
          invest<span className="text-[#e5b94d]">pro</span>
        </div>
        <div className="mt-1.5 text-[8px] font-semibold tracking-[0.34em] text-white/45">
          TRADING
        </div>
      </div>
    </Link>
  );
}

function LiveCommunity({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "inline-flex items-center gap-2.5" : "inline-flex items-center gap-3 rounded-full border border-emerald-500/15 bg-emerald-500/[0.045] px-3.5 py-2"}>
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-45" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </span>
      <span className="text-[10px] font-semibold text-emerald-300">
        {SOCIAL_PROOF} dans la communauté InvestPro
      </span>
    </div>
  );
}

function Benefit({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.055] bg-white/[0.025] px-3 py-2.5 text-[10px] font-medium text-white/64">
      <span className="text-[#d9ac43]">{icon}</span>
      {text}
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-[#d9ac43]/17 bg-[#0d100d] p-4 shadow-[0_30px_80px_rgba(0,0,0,.24)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#d9ac43]">
            Aperçu InvestPro
          </div>
          <div className="mt-1 text-[12px] font-semibold text-white">Vue d&apos;ensemble</div>
        </div>
        <span className="rounded-full border border-emerald-500/15 bg-emerald-500/[0.05] px-2 py-1 text-[7px] font-bold uppercase text-emerald-400">
          Connecté
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <PreviewMetric label="Trades" value="24" />
        <PreviewMetric label="Winrate" value="67%" />
        <PreviewMetric label="Discipline" value="86%" />
      </div>

      <div className="mt-3 rounded-xl border border-white/[0.05] bg-black/25 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[8px] text-white/32">Évolution</span>
          <span className="text-[8px] font-semibold text-emerald-400">+5.8R</span>
        </div>
        <div className="mt-3 flex h-12 items-end gap-1">
          {[28, 38, 31, 48, 43, 61, 56, 73, 68, 82, 77, 92].map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-t-[3px] bg-[#d9ac43]/65"
              style={{ height: `${height}%`, opacity: 0.35 + index * 0.045 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/20 p-2.5">
      <div className="text-[7px] text-white/26">{label}</div>
      <div className="mt-1 text-[12px] font-semibold text-white">{value}</div>
    </div>
  );
}

function TrustCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-[18px] border border-white/[0.055] bg-white/[0.025] p-4">
      <div className="text-[#d9ac43]">{icon}</div>
      <div className="mt-3 text-[10px] font-semibold text-white">{title}</div>
      <div className="mt-1 text-[8px] leading-4 text-white/34">{text}</div>
    </div>
  );
}

function MobileTrust({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.05] bg-white/[0.025] px-2 py-2.5 text-[8px] font-medium text-white/42">
      <span className="text-[#d9ac43]">{icon}</span>
      {text}
    </div>
  );
}

export function AuthCardHeader({
  badge,
  title,
  highlight,
  description,
}: {
  badge: string;
  title: string;
  highlight: string;
  description: string;
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-full border border-[#d9ac43]/20 bg-[#d9ac43]/[0.055] px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#d9ac43]">
        <Sparkles size={11} />
        {badge}
      </div>
      <h2 className="mt-4 text-[28px] font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-[33px]">
        {title} <span className="text-[#e4b94e]">{highlight}</span>
      </h2>
      <p className="mt-2.5 text-[11px] leading-5 text-white/42">{description}</p>
    </div>
  );
}

export function GoogleButton({
  onClick,
  busy,
  label,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-[14px] border border-white/[0.09] bg-white/[0.045] text-[11px] font-semibold text-white transition hover:bg-white/[0.075] disabled:opacity-50"
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[11px] font-extrabold text-[#4285F4]">G</span>
      {label}
    </button>
  );
}

export function AppleButton({
  onClick,
  busy,
  label,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-[14px] border border-white/[0.09] bg-white text-[11px] font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
    >
      <Apple size={18} fill="currentColor" />
      {label}
    </button>
  );
}

export function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-white/[0.07]" />
      <span className="text-[8px] uppercase tracking-[0.16em] text-white/25">ou</span>
      <span className="h-px flex-1 bg-white/[0.07]" />
    </div>
  );
}

export function AuthMessage({ kind, text }: { kind: "success" | "error" | "info"; text: string }) {
  const cls =
    kind === "success"
      ? "border-emerald-500/20 bg-emerald-500/[0.055] text-emerald-300"
      : kind === "error"
      ? "border-red-500/20 bg-red-500/[0.055] text-red-300"
      : "border-[#d9ac43]/20 bg-[#d9ac43]/[0.055] text-[#e4b94e]";

  return <div className={`rounded-xl border px-3.5 py-3 text-[10px] leading-5 ${cls}`}>{text}</div>;
}

export function AuthFeatureStrip() {
  return (
    <div className="mt-5 grid grid-cols-3 gap-2">
      <SmallFeature icon={<Target size={12} />} text="Discipline" />
      <SmallFeature icon={<BarChart3 size={12} />} text="Analytics" />
      <SmallFeature icon={<UsersRound size={12} />} text="Communauté" />
    </div>
  );
}

function SmallFeature({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.05] bg-white/[0.02] px-2 py-2.5 text-[8px] font-medium text-white/38">
      <span className="text-[#d9ac43]">{icon}</span>
      {text}
    </div>
  );
}

export function SecurityNote() {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03] px-3 py-2.5 text-[8px] leading-4 text-white/32">
      <Check size={12} className="mt-0.5 shrink-0 text-emerald-400" />
      Connexion sécurisée. Tes identifiants de brokers et prop firms ne sont jamais demandés ici.
    </div>
  );
}
