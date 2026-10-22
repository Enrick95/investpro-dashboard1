"use client";

import { ArrowDown, CheckCircle2, Layers3, Link2, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
import {
  connectionStateLabel,
  linkStateLabel,
  networkMasters,
  persistedLinkedMasterIds,
  type ConnectionState,
  type ConnectionStateLabel,
  type NetworkMaster,
  type NetworkReceiver,
} from "@/lib/copier/connection-network";

type Props = {
  receivers: NetworkReceiver[];
  masters: NetworkMaster[];
  states: Record<string, ConnectionState>;
  selectedReceiverId: string | null;
  now: number;
  checkingAll: boolean;
  onSelectReceiver: (id: string) => void;
  onVerify: () => void;
  translate: (message: string) => string;
  locale?: "fr" | "en";
};

const toneClasses = {
  green: "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300",
  amber: "border-amber-500/20 bg-amber-500/[0.06] text-amber-200",
  neutral: "border-white/[0.09] bg-white/[0.025] text-white/60",
};

function StatusPill({
  state,
  translate,
}: {
  state: Pick<ConnectionStateLabel, "tone" | "labelFrench">;
  translate: Props["translate"];
}) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold leading-4 ${toneClasses[state.tone]}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${state.tone === "green" ? "bg-emerald-400" : state.tone === "amber" ? "bg-amber-300" : "bg-white/40"}`} />
      <span>{translate(state.labelFrench)}</span>
    </span>
  );
}

function ReceiverCard({
  receiver,
  state,
  masterId,
  selected,
  now,
  locale,
  translate,
  onSelect,
}: {
  receiver: NetworkReceiver;
  state: ConnectionState | undefined;
  masterId?: string;
  selected: boolean;
  now: number;
  locale: "fr" | "en";
  translate: Props["translate"];
  onSelect: () => void;
}) {
  const connection = connectionStateLabel(state, now);
  const link = masterId
    ? linkStateLabel(state, masterId, now)
    : {
        tone: connection.kind === "connected" || connection.kind === "disconnected" ? "neutral" as const : connection.tone,
        labelFrench: connection.kind === "connected" || connection.kind === "disconnected" ? "Liaison à configurer" : "Liaison à vérifier",
      };
  const checkedAt = state?.snapshot?.checkedAt;
  const checkedDate = typeof checkedAt === "number" && Number.isFinite(checkedAt) && checkedAt > 0 && checkedAt <= now
    ? new Date(checkedAt)
    : null;
  const dateLocale = locale === "en" ? "en-US" : "fr-FR";

  return (
    <article aria-label={receiver.alias} className={`min-w-0 rounded-2xl border p-4 ${selected ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]" : "border-white/[0.08] bg-black/15"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40">{translate("Compte receveur")}</div>
          <h4 className="mt-2 break-words text-base font-semibold leading-snug text-white">{receiver.alias}</h4>
        </div>
        {selected ? <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--gold-border)] bg-black/15 px-2 py-1 text-[9px] font-semibold text-[color:var(--gold)]"><CheckCircle2 size={11} aria-hidden="true" />{translate("Sélectionné")}</span> : null}
      </div>
      <p className="mt-1.5 break-words text-[11px] leading-5 text-white/50">#{receiver.login} · {receiver.platform} · {receiver.server}</p>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <StatusPill state={connection} translate={translate} />
        <StatusPill state={link} translate={translate} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
        <div className="min-w-0 text-[10px] leading-4 text-white/40">
          {checkedDate ? <><span>{translate("Vérifié le")}{" "}</span><time dateTime={checkedDate.toISOString()}>{checkedDate.toLocaleString(dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></> : translate("En attente de vérification")}
        </div>
        <button type="button" onClick={onSelect} aria-label={`${translate("Configurer")} ${receiver.alias}`} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 text-[11px] font-semibold text-[color:var(--gold)] transition hover:bg-[color:var(--gold-soft)]/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--gold)]">
          <Settings2 size={13} aria-hidden="true" />{translate("Configurer")}
        </button>
      </div>
    </article>
  );
}

export default function CopierConnectionNetwork({
  receivers,
  masters,
  states,
  selectedReceiverId,
  now,
  checkingAll,
  onSelectReceiver,
  onVerify,
  translate,
  locale = "fr",
}: Props) {
  const sources = networkMasters(masters, states);
  const connectedCount = receivers.filter((receiver) => connectionStateLabel(states[receiver.id], now).kind === "connected").length;
  const otherReceivers = receivers.filter((receiver) => persistedLinkedMasterIds(states[receiver.id]).length === 0);

  const renderReceiver = (receiver: NetworkReceiver, masterId?: string) => (
    <ReceiverCard
      key={receiver.id}
      receiver={receiver}
      state={states[receiver.id]}
      masterId={masterId}
      selected={selectedReceiverId === receiver.id}
      now={now}
      locale={locale}
      translate={translate}
      onSelect={() => onSelectReceiver(receiver.id)}
    />
  );

  return (
    <section aria-label={translate("Votre réseau de copie")} className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]"><Link2 size={13} aria-hidden="true" />{translate("Vos comptes reliés")}</div>
          <h2 className="mt-2 text-lg font-semibold text-white md:text-xl">{translate("Votre réseau de copie")}</h2>
          <p className="mt-1.5 max-w-2xl text-[11px] leading-5 text-white/45">{translate("Retrouve tes Masters et les comptes receveurs qui leur sont reliés.")}</p>
        </div>
        <button type="button" disabled={checkingAll || receivers.length === 0} onClick={onVerify} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 text-[11px] font-semibold text-[color:var(--gold)] transition hover:bg-[color:var(--gold-soft)]/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--gold)] disabled:cursor-wait disabled:opacity-45">
          <RefreshCw size={14} aria-hidden="true" className={checkingAll ? "animate-spin motion-reduce:animate-none" : ""} />{checkingAll ? translate("Vérification…") : translate("Vérifier les connexions")}
        </button>
      </div>

      <p role="status" aria-live="polite" aria-atomic="true" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5 text-[11px] leading-5 text-white/55">
        {checkingAll ? translate("Vérification des comptes en cours…") : translate("{connected} / {total} receveurs connectés").replace("{connected}", String(connectedCount)).replace("{total}", String(receivers.length))}
        <span aria-hidden="true" className="text-white/20">·</span>
        <span>{translate("Les états correspondent à la dernière vérification du moteur.")}</span>
      </p>

      <div className="mt-5 space-y-5">
        {sources.map((master) => {
          const linkedReceivers = receivers.filter((receiver) => persistedLinkedMasterIds(states[receiver.id]).includes(master.id));
          const identity = [master.login ? `#${master.login}` : "", master.platform, master.server].filter(Boolean).join(" · ");
          return (
            <section key={master.id} aria-label={`${translate("Compte Master · source")} ${master.name}`}>
              <div className="rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-black/15 text-[color:var(--gold)]"><Layers3 size={18} /></span>
                    <div className="min-w-0">
                      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">{translate("Compte Master · source")}</div>
                      <h3 className="mt-1.5 break-words text-lg font-semibold leading-snug text-white">{master.name}</h3>
                      {identity ? <p className="mt-1 break-words text-[11px] leading-5 text-white/50">{identity}</p> : null}
                    </div>
                  </div>
                  {master.approved ? <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--gold-border)] bg-black/15 px-2.5 py-1 text-[10px] font-semibold text-[color:var(--gold)]"><ShieldCheck size={12} aria-hidden="true" />{translate("Master validé")}</span> : null}
                </div>
              </div>

              <div className="ml-5 border-l border-[color:var(--gold-border)] pb-1 pl-4 md:ml-7 md:pl-6">
                <div className="flex items-center gap-2 py-3 text-[10px] font-semibold text-white/50"><ArrowDown size={13} aria-hidden="true" />{translate("Comptes receveurs reliés")}<span className="rounded-md border border-white/[0.08] bg-black/15 px-1.5 py-0.5 text-[9px] tabular-nums text-white/65">{linkedReceivers.length}</span></div>
                {linkedReceivers.length > 0 ? <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">{linkedReceivers.map((receiver) => renderReceiver(receiver, master.id))}</div> : <p className="rounded-xl border border-dashed border-white/[0.09] px-4 py-3 text-[11px] leading-5 text-white/40">{translate("Aucune liaison confirmée pour ce Master.")}</p>}
              </div>
            </section>
          );
        })}

        {otherReceivers.length > 0 ? (
          <section className={sources.length > 0 ? "border-t border-white/[0.07] pt-5" : ""} aria-label={translate("Comptes à relier ou à vérifier")}>
            <h3 className="text-sm font-semibold text-white/85">{translate("Comptes à relier ou à vérifier")}</h3>
            <p className="mt-1 text-[11px] leading-5 text-white/45">{translate("Sélectionne un compte pour choisir son Master et régler la copie.")}</p>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">{otherReceivers.map((receiver) => renderReceiver(receiver))}</div>
          </section>
        ) : null}

        {sources.length === 0 && receivers.length === 0 ? <div className="rounded-2xl border border-dashed border-white/[0.1] bg-black/10 px-5 py-6 text-center"><Layers3 size={24} aria-hidden="true" className="mx-auto text-[color:var(--gold)]" /><p className="mt-3 text-sm font-semibold text-white/80">{translate("Ton réseau de copie se construit ici.")}</p><p className="mx-auto mt-2 max-w-md text-[11px] leading-5 text-white/45">{translate("Ajoute ton compte Master et tes comptes receveurs pour retrouver leurs liaisons sur cette page.")}</p></div> : null}
      </div>
    </section>
  );
}
