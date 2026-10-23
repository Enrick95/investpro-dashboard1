"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import MetaSyncPanel from "@/components/metasync/MetaSyncPanel";
import Link from "next/link";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Clock3,
  Edit3,
  Link2,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { pushNotif } from "@/lib/notifyStore";
import DisplayCurrencySelect from "@/components/currency/DisplayCurrencySelect";
import { convertCurrency, formatDisplayCurrency, rateDateLabel, useCurrencyRates, useDisplayCurrency } from "@/lib/currency";

/* =========================================================
   TYPES
========================================================= */

type AccountType =
  | "real"
  | "demo"
  | "prop";

type Platform =
  | "MT4"
  | "MT5"
  | "OTHER";

type TradingAccount = {
  id: number;

  user_id: string;

  name: string;

  account_type: AccountType;

  platform:
    | Platform
    | null;

  broker:
    | string
    | null;

  currency: string;

  initial_balance: number;

  current_balance: number;

  connection_type:
    | "manual"
    | "automatic";

  created_at: string;

  updated_at: string;
};

type CopierOrigin = "Master" | "Receveur" | "Copieur";

type HostedAccountReadState = "pending" | "error";

function unconfirmedHostedAccountStates(connections: unknown): Record<number, HostedAccountReadState> {
  const states: Record<number, HostedAccountReadState> = {};
  const confirmed = new Set<number>();
  if (!Array.isArray(connections)) return states;
  const hasTimestamp = (value: unknown) => typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
  for (const row of connections) {
    if (!row || typeof row !== "object" || row.active !== true) continue;
    const connection = Array.isArray(row.investpro_mt_connections) ? row.investpro_mt_connections[0] : row.investpro_mt_connections;
    if (!connection || typeof connection !== "object") continue;
    const rawId = connection.account_id;
    if ((typeof rawId !== "number" && typeof rawId !== "string") || String(rawId).trim() === "") continue;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    // A real zero is still a valid balance once the broker has supplied a read.
    if (hasTimestamp(connection.last_sync) || hasTimestamp(connection.observed_at)) {
      confirmed.add(id);
      delete states[id];
    } else if (!confirmed.has(id)) {
      states[id] = ["error", "failed", "disconnected"].includes(String(row.status).trim().toLowerCase()) ? "error" : "pending";
    }
  }
  return states;
}

type AccountForm = {
  name: string;

  account_type:
    AccountType;

  platform:
    Platform;

  broker: string;

  currency: string;

  initial_balance: string;

  current_balance: string;
};

const emptyForm: AccountForm = {
  name: "",

  account_type:
    "real",

  platform:
    "MT5",

  broker: "",

  currency:
    "EUR",

  initial_balance:
    "",

  current_balance:
    "",
};

/* =========================================================
   HELPERS
========================================================= */

function numberOrZero(
  value: string
) {
  const clean = value
    .trim()
    .replace(",", ".");

  if (!clean) {
    return 0;
  }

  const number =
    Number(clean);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}

function formatMoney(
  value: number,
  currency = "EUR"
) {
  try {
    return new Intl.NumberFormat(
      "fr-FR",
      {
        style:
          "currency",

        currency,

        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2,
      }
    ).format(value);
  } catch {
    return `${value.toFixed(
      2
    )} ${currency}`;
  }
}

function accountTypeLabel(
  type: AccountType
) {
  switch (type) {
    case "real":
      return "Réel";

    case "demo":
      return "Démo";

    case "prop":
      return "Prop Firm";

    default:
      return type;
  }
}

/* =========================================================
   PAGE
========================================================= */

export default function ComptesPage() {
  const { t: translate } = useLocale();
  const { rates, rateDate, rateLoading } = useCurrencyRates();
  const { displayCurrency } = useDisplayCurrency();
  const deletingRef = useRef(false);
  const mountedRef = useRef(false);
  const accountLoadRequestRef = useRef(0);
  const accountLoadBusyRef = useRef(false);
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null);
  const [syncPanelVersion, setSyncPanelVersion] = useState(0);

  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    );

  const [
    userId,
    setUserId,
  ] =
    useState<
      string | null
    >(null);

  const [
    accounts,
    setAccounts,
  ] =
    useState<
      TradingAccount[]
    >([]);

  const [copierOrigins, setCopierOrigins] = useState<Record<number, CopierOrigin>>({});
  const [accountReadStates, setAccountReadStates] = useState<Record<number, HostedAccountReadState>>({});

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    modalOpen,
    setModalOpen,
  ] =
    useState(false);

  const [
    editingAccount,
    setEditingAccount,
  ] =
    useState<
      TradingAccount | null
    >(null);

  const [
    form,
    setForm,
  ] =
    useState<AccountForm>({
      ...emptyForm,
    });

  /* =========================================================
     LOAD ACCOUNTS
  ========================================================= */

  useEffect(() => {
    mountedRef.current = true;
    void loadAccounts();
    return () => {
      mountedRef.current = false;
      accountLoadRequestRef.current += 1;
      accountLoadBusyRef.current = false;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasUnconfirmedAccounts = Object.keys(accountReadStates).length > 0;
  useEffect(() => {
    if (!hasUnconfirmedAccounts) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAccounts(true);
    }, 30000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnconfirmedAccounts]);

  async function loadAccounts(silent = false) {
    if (silent && (accountLoadBusyRef.current || deletingRef.current)) return;
    const request = ++accountLoadRequestRef.current;
    accountLoadBusyRef.current = true;
    const isCurrent = () => mountedRef.current && request === accountLoadRequestRef.current;
    try {
      if (!silent) setLoading(true);

      const {
        data: { user },
        error:
          userError,
      } =
        await supabase.auth.getUser();

      if (!isCurrent()) return;

      if (
        userError ||
        !user
      ) {
        window.location.href =
          "/login";

        return;
      }

      setUserId(
        user.id
      );

      // Read synchronization metadata before the balances it confirms.
      // A first snapshot must not validate an older placeholder zero.
      const [hostedResponse, receiverResult, masterResponse] = await Promise.all([
        fetch("/api/metasync/hosted", { cache: "no-store" })
          .then(async (response) => response.ok ? response.json() : null)
          .catch(() => null),
        supabase.from("copier_receivers")
          .select("login,server,platform")
          .eq("user_id", user.id),
        fetch("/api/copier/request", { cache: "no-store" })
          .then(async (response) => response.ok ? response.json() : null)
          .catch(() => null),
      ]);
      if (!isCurrent()) return;

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "trading_accounts"
          )
          .select("*")
          .order(
            "created_at",
            {
              ascending:
                false,
            }
          );

      if (!isCurrent()) return;
      if (error) {
        console.error(
          "Erreur chargement comptes :",
          error
        );

        if (!silent) pushNotif({
          kind:
            "error",

          title:
            "Mes comptes",

          message:
            "Impossible de charger tes comptes.",

          ttlMs:
            8000,
        });

        return;
      }

      setAccounts(
        (data as TradingAccount[]) ||
          []
      );


      // Failed metadata reads must not turn an unconfirmed zero into a balance.
      if (Array.isArray(hostedResponse?.connections)) {
        setAccountReadStates(unconfirmedHostedAccountStates(hostedResponse.connections));
      }
      const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
      const copierLogins = [
        ...(receiverResult.data || []).map((row: any) => ({ ...row, kind: "Receveur" as const })),
        ...((masterResponse?.requests || []) as any[])
          .filter((row) => row.status === "activated")
          .map((row) => ({ ...row, kind: "Master" as const })),
      ];
      const origins: Record<number, CopierOrigin> = {};
      const metaConnections = ((hostedResponse?.connections || []) as any[]).map((row) => {
        const nested = Array.isArray(row.investpro_mt_connections)
          ? row.investpro_mt_connections[0]
          : row.investpro_mt_connections;
        return nested || null;
      }).filter((row): row is NonNullable<typeof row> => Boolean(row));
      for (const connection of metaConnections) {
        const matches = copierLogins.filter((item) =>
          normalize(item.login) === normalize(connection.login) &&
          normalize(item.platform) === normalize(connection.platform) &&
          normalize(item.server) === normalize(connection.server)
        );
        if (matches.length && Number.isFinite(Number(connection.account_id))) {
          const hasMaster = matches.some((item) => item.kind === "Master");
          const hasReceiver = matches.some((item) => item.kind === "Receveur");
          origins[Number(connection.account_id)] = hasMaster && hasReceiver ? "Copieur" : hasMaster ? "Master" : "Receveur";
        }
      }
      if (Array.isArray(hostedResponse?.connections)) setCopierOrigins(origins);
    } catch (error: unknown) {
      if (isCurrent()) {
        console.error("Erreur chargement comptes :", error);
        if (!silent) pushNotif({ kind: "error", title: "Mes comptes", message: "Impossible de charger tes comptes.", ttlMs: 8000 });
      }
    } finally {
      if (isCurrent()) {
        accountLoadBusyRef.current = false;
        if (!silent) setLoading(false);
      }
    }
  }

  /* =========================================================
     STATS
  ========================================================= */

  const stats =
    useMemo(() => {
      const realAccounts =
        accounts.filter(
          (account) =>
            account.account_type ===
            "real"
        ).length;

      const propAccounts =
        accounts.filter(
          (account) =>
            account.account_type ===
            "prop"
        ).length;

      const automaticAccounts =
        accounts.filter(
          (account) =>
            account.connection_type ===
            "automatic"
        ).length;

      return {
        total:
          accounts.length,

        realAccounts,

        propAccounts,

        automaticAccounts,
      };
    }, [accounts]);

  const capitalTotal = useMemo(() => {
    const converted = accounts.map((account) =>
      convertCurrency(Number(account.current_balance || 0), account.currency, displayCurrency, rates)
    );
    return converted.some((value) => value === null)
      ? null
      : converted.reduce<number>((sum, value) => sum + Number(value), 0);
  }, [accounts, displayCurrency, rates]);

  /* =========================================================
     MODALS
  ========================================================= */

  function openNewAccount() {
    setEditingAccount(
      null
    );

    setForm({
      ...emptyForm,
    });

    setModalOpen(
      true
    );
  }

  function openEditAccount(
    account: TradingAccount
  ) {
    setEditingAccount(
      account
    );

    setForm({
      name:
        account.name,

      account_type:
        account.account_type,

      platform:
        account.platform ||
        "MT5",

      broker:
        account.broker ||
        "",

      currency:
        account.currency ||
        "EUR",

      initial_balance:
        String(
          account.initial_balance ??
            0
        ),

      current_balance:
        String(
          account.current_balance ??
            0
        ),
    });

    setModalOpen(
      true
    );
  }

  /* =========================================================
     SAVE
  ========================================================= */

  async function saveAccount() {
    if (!userId) {
      return;
    }

    const name =
      form.name.trim();

    if (!name) {
      pushNotif({
        kind:
          "warning",

        title:
          "Mes comptes",

        message:
          "Donne un nom à ton compte.",

        ttlMs:
          6000,
      });

      return;
    }

    const initialBalance =
      numberOrZero(
        form.initial_balance
      );

    const currentBalance =
      form.current_balance.trim()
        ? numberOrZero(
            form.current_balance
          )
        : initialBalance;

    if (
      initialBalance <
        0 ||
      currentBalance <
        0
    ) {
      pushNotif({
        kind:
          "warning",

        title:
          "Mes comptes",

        message:
          "Le capital ne peut pas être négatif.",

        ttlMs:
          6000,
      });

      return;
    }

    try {
      setSaving(
        true
      );

      const payload = {
        user_id:
          userId,

        name,

        account_type:
          form.account_type,

        platform:
          form.platform,

        broker:
          form.broker.trim() ||
          null,

        currency:
          form.currency
            .trim()
            .toUpperCase() ||
          "EUR",

        initial_balance:
          initialBalance,

        current_balance:
          currentBalance,

        connection_type:
          "manual",

        updated_at:
          new Date().toISOString(),
      };

      if (
        editingAccount
      ) {
        const {
          error,
        } =
          await supabase
            .from(
              "trading_accounts"
            )
            .update(
              payload
            )
            .eq(
              "id",
              editingAccount.id
            );

        if (error) {
          throw error;
        }

        pushNotif({
          kind:
            "success",

          title:
            "Mes comptes",

          message:
            "Compte modifié avec succès.",

          ttlMs:
            6000,
        });
      } else {
        const {
          error,
        } =
          await supabase
            .from(
              "trading_accounts"
            )
            .insert(
              payload
            );

        if (error) {
          throw error;
        }

        pushNotif({
          kind:
            "success",

          title:
            "Mes comptes",

          message:
            "Compte ajouté avec succès.",

          ttlMs:
            6000,
        });
      }

      setModalOpen(
        false
      );

      await loadAccounts();
    } catch (
      error: any
    ) {
      console.error(
        "Erreur sauvegarde compte :",
        error
      );

      pushNotif({
        kind:
          "error",

        title:
          "Mes comptes",

        message:
          error?.message ||
          "Impossible d’enregistrer ce compte.",

        ttlMs:
          10000,
      });
    } finally {
      setSaving(
        false
      );
    }
  }

  /* =========================================================
     DELETE
  ========================================================= */

  async function deleteAccount(account: TradingAccount) {
    if (deletingRef.current) return;
    const confirmed = window.confirm(
      `${translate("Supprimer le compte")} "${account.name}" ${translate("du site ?")}\n\n` +
      translate("Sa connexion et tous les trades de son journal sur InvestPro seront supprimés, y compris leurs notes. ") +
      translate("Ton compte chez le broker ne sera pas supprimé.\n\n") +
      translate("En le reconnectant, l’historique encore disponible chez le broker pourra être réimporté. ") +
      translate("Les notes et saisies manuelles ne seront pas récupérées.")
    );
    if (!confirmed) return;
    accountLoadRequestRef.current += 1;
    accountLoadBusyRef.current = false;
    deletingRef.current = true;
    setDeletingAccountId(account.id);
    try {
      const { data, error } = await supabase.rpc("investpro_delete_trading_account", {
        p_account_id: account.id,
      });
      if (error) throw error;
      if (String(data) !== String(account.id)) {
        throw new Error("La suppression n’a pas été confirmée. Actualise la page avant de réessayer.");
      }
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setSyncPanelVersion((version) => version + 1);
      pushNotif({
        kind: "success",
        title: "Mes comptes",
        message: "Compte et historique supprimés du site. Synchronisation retirée.",
        ttlMs: 6000,
      });
    } catch (error: unknown) {
      console.error("Erreur suppression compte :", error);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      const message = code === "PGRST202" || code === "42883"
        ? "Le correctif de suppression doit d’abord être installé dans Supabase."
        : code === "42501"
        ? "Compte inaccessible. Actualise la page et vérifie ta connexion."
        : code === "0A000"
        ? "Ce connecteur nécessite une procédure de déconnexion dédiée avant suppression."
        : "Suppression non confirmée. Actualise la page ; si le compte est toujours présent, réessaie ou contacte le support.";
      pushNotif({ kind: "error", title: "Mes comptes", message, ttlMs: 10000 });
    } finally {
      deletingRef.current = false;
      setDeletingAccountId(null);
    }
  }

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-sm text-[color:var(--muted)]">
        {translate("Chargement de tes comptes…")}</div>
    );
  }

  return (
    <>
      <div className="investpro-mobile-page space-y-4 pb-4 lg:space-y-5 lg:pb-10">
        <MetaSyncPanel key={syncPanelVersion} />
        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {translate("Mes")}{" "}
              <span className="text-[color:var(--gold)]">
                {translate("comptes")}</span>
            </h1>

            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {translate("Ajoute tes comptes de trading pour centraliser ton capital et alimenter ton journal.")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DisplayCurrencySelect />
            <button
              type="button"
              onClick={
                openNewAccount
              }
              className="
              inline-flex
              h-11
              items-center
              justify-center
              gap-2
              rounded-xl
              bg-[color:var(--gold)]
              px-4
              text-sm
              font-semibold
              text-black
              transition
              hover:bg-[color:var(--gold-2)]
            "
            >
              <Plus
                size={16}
              />

              {translate("Ajouter un compte")}</button>
          </div>
        </div>

        {/* =====================================================
            STATS
        ===================================================== */}

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <StatCard
            icon={
              <WalletCards
                size={18}
              />
            }
            label={translate("Mes comptes")}
            value={String(
              stats.total
            )}
            sub={
              stats.total ===
              0
                ? translate("Aucun compte")
                : `${stats.realAccounts} ${translate("réel")} • ${stats.propAccounts} prop firm`
            }
          />

          <StatCard
            icon={
              <WalletCards
                size={18}
              />
            }
            label={translate("Capital total")}
            value={
              stats.total === 0
                ? formatDisplayCurrency(0, displayCurrency)
                : capitalTotal === null
                  ? rateLoading ? translate("Chargement…") : "—"
                  : formatDisplayCurrency(capitalTotal, displayCurrency)
            }
            sub={stats.total === 0
              ? translate("Capital actuel déclaré")
              : capitalTotal === null
                ? rateLoading ? translate("Récupération du taux de change") : `${translate("Conversion")} ${displayCurrency} ${translate("indisponible pour une devise")}`
                : rateDateLabel(rateDate, displayCurrency)}
          />

          <StatCard
            icon={
              <RefreshCw
                size={18}
              />
            }
            label={translate("Synchronisation")}
            value={stats.automaticAccounts > 0 ? `${stats.automaticAccounts} auto` : translate("Manuelle")}
            sub={stats.automaticAccounts > 0 ? `${stats.automaticAccounts} ${translate(stats.automaticAccounts > 1 ? "comptes synchronisés" : "compte synchronisé")}` : translate("Connecte ProjectX ou MetaTrader")}
          />
        </section>

        {/* =====================================================
            ACCOUNTS
        ===================================================== */}

        <section
          className="
            overflow-hidden
            rounded-[22px]
            border border-[color:var(--border)]
            bg-[color:var(--panel)]
          "
        >
          <div
            className="
              flex
              items-center
              justify-between
              gap-4
              border-b border-[color:var(--border)]
              px-4 py-4 lg:px-5
            "
          >
            <div>
              <h2 className="text-sm font-semibold text-white">
                {translate("Comptes de trading")}</h2>

              <p className="mt-1 text-[10px] text-[color:var(--muted)]">
                {translate("Ces comptes peuvent être sélectionnés dans ton journal.")}</p>
            </div>

            <span
              className="
                rounded-full
                border border-[color:var(--gold-border)]
                bg-[color:var(--gold-soft)]
                px-3 py-1
                text-[9px]
                font-semibold
                text-[color:var(--gold)]
              "
            >
              {stats.total}{" "}
              {translate("COMPTE")}{stats.total !==
              1
                ? translate("S")
                : ""}
            </span>
          </div>

          {accounts.length ===
          0 ? (
            <div
              className="
                m-5
                flex
                min-h-[210px]
                flex-col
                items-center
                justify-center
                rounded-2xl
                border border-dashed border-white/[0.08]
                bg-black/20
                px-6
                text-center
              "
            >
              <div
                className="
                  flex
                  h-12
                  w-12
                  items-center
                  justify-center
                  rounded-xl
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                "
              >
                <WalletCards
                  size={20}
                  className="text-[color:var(--gold)]"
                />
              </div>

              <div className="mt-4 text-sm font-semibold text-white">
                {translate("Aucun compte ajouté")}</div>

              <p className="mt-2 max-w-md text-xs leading-5 text-[color:var(--muted)]">
                {translate("Ajoute ton compte une seule fois. Son capital pourra ensuite être utilisé automatiquement dans ton journal.")}</p>

              <button
                type="button"
                onClick={
                  openNewAccount
                }
                className="
                  mt-5
                  inline-flex
                  h-10
                  items-center
                  gap-2
                  rounded-xl
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  px-4
                  text-xs
                  font-semibold
                  text-[color:var(--gold)]
                  transition
                  hover:bg-white/[0.05]
                "
              >
                <Plus
                  size={14}
                />

                {translate("Ajouter mon premier compte")}</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
              {accounts.map(
                (account) => (
                  <AccountCard
                    deleting={deletingAccountId === account.id}
                    deleteDisabled={deletingAccountId !== null}
                    key={
                      account.id
                    }
                    account={
                      account
                    }
                    copierOrigin={copierOrigins[account.id]}
                    readState={accountReadStates[account.id]}
                    onEdit={() =>
                      openEditAccount(
                        account
                      )
                    }
                    onDelete={() =>
                      deleteAccount(
                        account
                      )
                    }
                  />
                )
              )}
            </div>
          )}
        </section>

        {/* =====================================================
            PLATFORM CONNECTIONS
        ===================================================== */}

        <section
          className="
            relative
            overflow-hidden
            rounded-[24px]
            border border-[color:var(--gold-border)]
            bg-[color:var(--panel)]
            p-4 lg:p-6
            lg:p-4 lg:p-7
          "
        >
          <div
            className="
              pointer-events-none
              absolute
              right-[-100px]
              top-[-150px]
              h-[360px]
              w-[420px]
              rounded-full
              bg-[color:var(--gold)]
              opacity-[0.07]
              blur-[100px]
            "
          />

          <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-8">
              <div
                className="
                  inline-flex
                  items-center
                  gap-2
                  rounded-full
                  border border-[color:var(--gold-border)]
                  bg-[color:var(--gold-soft)]
                  px-3 py-1
                  text-[10px]
                  font-semibold
                  uppercase
                  tracking-[0.12em]
                  text-[color:var(--gold)]
                "
              >
                <Clock3
                  size={12}
                />

                {stats.automaticAccounts > 0 ? translate("CONNEXIONS ACTIVES") : translate("TES PLATEFORMES")}
              </div>

              <h2 className="mt-4 text-xl font-semibold text-white lg:text-2xl">
                {translate("Gère tes")}{" "}
                <span className="text-[color:var(--gold)]">{translate("connexions")}</span>
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                {stats.automaticAccounts > 0
                  ? `${translate("Tu as")} ${stats.automaticAccounts} ${translate(stats.automaticAccounts > 1 ? "comptes synchronisés" : "compte synchronisé")}. ${translate("Consulte tes connecteurs et leur état dans l’espace Connexions. Les comptes manuels restent gérés ici.")}`
                    : translate("Ajoute et gère tes comptes manuellement ici, ou ouvre Connexions pour relier une plateforme compatible et suivre sa synchronisation.")}
              </p>

              <Link
                href="/dashboard/connexions"
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--gold)] no-underline transition hover:bg-[color:var(--gold)]/15"
              >
                <Link2 size={16} />
                {translate("Gérer mes connexions")}</Link>
            </div>

            <div className="lg:col-span-4">
              <div
                className="
                  rounded-2xl
                  border border-white/[0.06]
                  bg-black/25
                  p-5
                "
              >
                <div
                  className="
                    mx-auto
                    flex
                    h-16
                    w-16
                    items-center
                    justify-center
                    rounded-2xl
                    border border-[color:var(--gold-border)]
                    bg-[color:var(--gold-soft)]
                  "
                >
                  <Server
                    size={27}
                    className="text-[color:var(--gold)]"
                  />
                </div>

                <div className="mt-4 text-center">
                  <div className="text-sm font-semibold text-white">
                    {stats.automaticAccounts > 0
                      ? translate("Synchronisation active")
                      : translate("Plateformes compatibles")}
                  </div>

                  <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                    {stats.automaticAccounts > 0
                      ? `${stats.automaticAccounts} ${translate(stats.automaticAccounts > 1 ? "comptes synchronisés" : "compte synchronisé")}`
                      : translate("Consulte les connecteurs disponibles")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* =====================================================
          ACCOUNT MODAL
      ===================================================== */}

      {modalOpen ? (
        <div
          className="
            fixed
            inset-0
            z-[999999]
            flex
            items-center
            justify-center
            bg-black/75
            p-4
            backdrop-blur-sm
          "
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setModalOpen(
                false
              );
            }
          }}
        >
          <div
            className="
              relative
              max-h-[92vh]
              w-full
              max-w-[650px]
              overflow-y-auto
              rounded-[24px]
              border border-[color:var(--gold-border)]
              bg-[#0d0e11]
              shadow-2xl
            "
          >
            <div
              className="
                pointer-events-none
                absolute
                left-1/2
                top-[-170px]
                h-[350px]
                w-[350px]
                -translate-x-1/2
                rounded-full
                bg-[color:var(--gold)]
                opacity-[0.08]
                blur-[100px]
              "
            />

            <div className="relative z-10">
              {/* HEADER */}

              <div
                className="
                  flex
                  items-center
                  justify-between
                  border-b border-white/[0.06]
                  px-4 py-4 lg:px-6 lg:py-5
                "
              >
                <div>
                  <div className="text-base font-semibold text-white">
                    {editingAccount
                      ? translate("Modifier le compte")
                      : translate("Ajouter un compte")}
                  </div>

                  <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                    {translate("Connexion manuelle")}</div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setModalOpen(
                      false
                    )
                  }
                  className="
                    flex
                    h-9
                    w-9
                    items-center
                    justify-center
                    rounded-xl
                    border border-white/[0.08]
                    bg-black/20
                    text-white/50
                    transition
                    hover:bg-white/[0.05]
                    hover:text-white
                  "
                >
                  <X
                    size={16}
                  />
                </button>
              </div>

              {/* BODY */}

              <div className="p-6">
                <div
                  className="
                    mb-5
                    flex
                    items-start
                    gap-3
                    rounded-2xl
                    border border-[color:var(--gold-border)]
                    bg-[color:var(--gold-soft)]
                    p-4
                  "
                >
                  <ShieldCheck
                    size={17}
                    className="mt-0.5 shrink-0 text-[color:var(--gold)]"
                  />

                  <div>
                    <div className="text-xs font-semibold text-white">
                      {translate("Compte manuel")}</div>

                    <p className="mt-1 text-[10px] leading-5 text-[color:var(--muted)]">
                      {translate("Aucun mot de passe MT4 ou MT5 n’est nécessaire. Tu renseignes simplement les informations de ton compte.")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <InputField
                    label={translate("Nom du compte")}
                    placeholder={translate("Compte principal")}
                    value={
                      form.name
                    }
                    onChange={(
                      value
                    ) =>
                      setForm({
                        ...form,

                        name:
                          value,
                      })
                    }
                  />

                  <SelectField
                    label={translate("Type de compte")}
                    value={
                      form.account_type
                    }
                    onChange={(
                      value
                    ) =>
                      setForm({
                        ...form,

                        account_type:
                          value as AccountType,
                      })
                    }
                    options={[
                      {
                        value:
                          "real",

                        label:
                          "Compte réel",
                      },

                      {
                        value:
                          "demo",

                        label:
                          "Compte démo",
                      },

                      {
                        value:
                          "prop",

                        label:
                          "Prop Firm",
                      },
                    ]}
                  />

                  <SelectField
                    label={translate("Plateforme")}
                    value={
                      form.platform
                    }
                    onChange={(
                      value
                    ) =>
                      setForm({
                        ...form,

                        platform:
                          value as Platform,
                      })
                    }
                    options={[
                      {
                        value:
                          "MT5",

                        label:
                          "MetaTrader 5",
                      },

                      {
                        value:
                          "MT4",

                        label:
                          "MetaTrader 4",
                      },

                      {
                        value:
                          "OTHER",

                        label:
                          "Autre",
                      },
                    ]}
                  />

                  <InputField
                    label={translate("Broker / Prop Firm")}
                    placeholder={translate("RaiseFX, FTMO, Tradeify...")}
                    value={
                      form.broker
                    }
                    onChange={(
                      value
                    ) =>
                      setForm({
                        ...form,

                        broker:
                          value,
                      })
                    }
                  />

                  <SelectField
                    label={translate("Devise")}
                    value={
                      form.currency
                    }
                    onChange={(
                      value
                    ) =>
                      setForm({
                        ...form,

                        currency:
                          value,
                      })
                    }
                    options={[
                      {
                        value:
                          "EUR",

                        label:
                          "EUR (€)",
                      },

                      {
                        value:
                          "USD",

                        label:
                          "USD ($)",
                      },

                      {
                        value:
                          "GBP",

                        label:
                          "GBP (£)",
                      },

                      {
                        value:
                          "CHF",

                        label:
                          "CHF",
                      },
                    ]}
                  />

                  <InputField
                    label={translate("Capital initial")}
                    placeholder="10000"
                    value={
                      form.initial_balance
                    }
                    onChange={(
                      value
                    ) =>
                      setForm({
                        ...form,

                        initial_balance:
                          value,

                        current_balance:
                          editingAccount
                            ? form.current_balance
                            : value,
                      })
                    }
                  />

                  <div className="lg:col-span-2">
                    <InputField
                      label={translate("Capital actuel")}
                      placeholder="10000"
                      value={
                        form.current_balance
                      }
                      onChange={(
                        value
                      ) =>
                        setForm({
                          ...form,

                          current_balance:
                            value,
                        })
                      }
                    />

                    <p className="mt-2 text-[9px] leading-4 text-[color:var(--muted)]">
                      {translate("Tu pourras modifier ce montant plus tard. Quand la connexion MetaTrader sera prête, cette valeur pourra être synchronisée automatiquement.")}</p>
                  </div>
                </div>

                {/* BUTTONS */}

                <div
                  className="
                    mt-6
                    flex
                    flex-col-reverse
                    gap-3
                    border-t border-white/[0.06]
                    pt-5
                    sm:flex-row
                    sm:justify-end
                  "
                >
                  <button
                    type="button"
                    onClick={() =>
                      setModalOpen(
                        false
                      )
                    }
                    className="
                      h-11
                      rounded-xl
                      border border-[color:var(--border)]
                      bg-black/20
                      px-5
                      text-sm
                      text-white/70
                    "
                  >
                    {translate("Annuler")}</button>

                  <button
                    type="button"
                    onClick={
                      saveAccount
                    }
                    disabled={
                      saving
                    }
                    className="
                      h-11
                      rounded-xl
                      bg-[color:var(--gold)]
                      px-6
                      text-sm
                      font-semibold
                      text-black
                      transition
                      hover:bg-[color:var(--gold-2)]
                      disabled:opacity-50
                    "
                  >
                    {saving
                      ? translate("Enregistrement...")
                      : editingAccount
                      ? translate("Enregistrer les modifications")
                      : translate("Ajouter le compte")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* =========================================================
   ACCOUNT CARD
========================================================= */

function AccountCard({
  deleting,
  deleteDisabled,
  account,
  copierOrigin,
  readState,
  onEdit,
  onDelete,
}: {
  deleting: boolean;
  deleteDisabled: boolean;
  account:
    TradingAccount;

  copierOrigin?: CopierOrigin;
  readState?: HostedAccountReadState;

  onEdit:
    () => void;

  onDelete:
    () => void;
}) {
  const { t: translate } = useLocale();
  return (
    <div
      className="
        relative
        overflow-hidden
        rounded-[20px]
        border border-white/[0.07]
        bg-black/20
        p-5
      "
    >
      <div
        className="
          pointer-events-none
          absolute
          right-[-50px]
          top-[-70px]
          h-[160px]
          w-[160px]
          rounded-full
          bg-[color:var(--gold)]
          opacity-[0.05]
          blur-[55px]
        "
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="
                flex
                h-11
                w-11
                items-center
                justify-center
                rounded-xl
                border border-[color:var(--gold-border)]
                bg-[color:var(--gold-soft)]
                text-[color:var(--gold)]
              "
            >
              <WalletCards
                size={19}
              />
            </div>

            <div>
              <div className="text-sm font-semibold text-white">
                {
                  account.name
                }
              </div>

              <div className="mt-1 text-[9px] uppercase tracking-[0.08em] text-[color:var(--muted)]">
                {translate(accountTypeLabel(
                  account.account_type
                ))}
                {" • "}
                {account.platform ||
                  translate("AUTRE")}
              </div>
            </div>
          </div>

          <span
            className="
              rounded-full
              border border-[color:var(--gold-border)]
              bg-[color:var(--gold-soft)]
              px-2.5 py-1
              text-[8px]
              font-bold
              uppercase
              text-[color:var(--gold)]
            "
          >
            {copierOrigin
              ? copierOrigin === "Copieur" ? translate("Copieur") : `${translate("Copieur")} · ${copierOrigin}`
              : account.connection_type === "automatic" ? translate("Auto-sync") : translate("Manuel")}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div
            className="
              rounded-xl
              border border-white/[0.05]
              bg-black/20
              p-3
            "
          >
            <div className="text-[9px] text-[color:var(--muted)]">
              {translate("Capital actuel")}</div>

            <div className="mt-1 text-base font-semibold text-white">
              {readState ? "—" : formatMoney(
                Number(
                  account.current_balance ||
                    0
                ),
                account.currency
              )}
            </div>
          </div>

          <div
            className="
              rounded-xl
              border border-white/[0.05]
              bg-black/20
              p-3
            "
          >
            <div className="text-[9px] text-[color:var(--muted)]">
              {translate("Capital initial")}</div>

            <div className="mt-1 text-base font-semibold text-white">
              {readState ? "—" : formatMoney(
                Number(
                  account.initial_balance ||
                    0
                ),
                account.currency
              )}
            </div>
          </div>
        </div>

        {readState ? (
          <p role="status" className={readState === "error" ? "mt-3 text-[10px] leading-5 text-red-300" : "mt-3 text-[10px] leading-5 text-amber-200"}>
            {readState === "error"
              ? translate("Premier relevé MetaTrader indisponible. Vérifie la connexion dans Connexions MetaTrader.")
              : translate("En attente du premier relevé MetaTrader.")}
          </p>
        ) : null}

        <div
          className="
            mt-4
            flex
            items-center
            justify-between
            gap-3
            border-t border-white/[0.05]
            pt-4
          "
        >
          <div>
            <div className="text-[9px] text-[color:var(--muted)]">
              {translate("Broker / Prop Firm")}</div>

            <div className="mt-1 text-xs text-white">
              {account.broker ||
                translate("Non renseigné")}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                onEdit
              }
              className="
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-xl
                border border-white/[0.08]
                bg-white/[0.03]
                text-white/50
                transition
                hover:text-[color:var(--gold)]
              "
              title={translate("Modifier")}
            >
              <Edit3
                size={14}
              />
            </button>

            <button
              type="button"
              onClick={
                onDelete
              }
              className="
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-xl
                border border-red-500/20
                bg-red-500/[0.04]
                text-red-400/70
                transition
                hover:bg-red-500/10
                hover:text-red-400
              "
              disabled={deleteDisabled}
              aria-busy={deleting}
              title={deleting ? translate("Suppression en cours…") : translate("Supprimer")}
            >
              <Trash2
                size={14}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon:
    React.ReactNode;

  label:
    string;

  value:
    string;

  sub:
    string;
}) {
  const { t: translate } = useLocale();
  return (
    <div
      className="
        min-h-[100px]
        rounded-2xl
        border border-[color:var(--border)]
        bg-[color:var(--panel)]
        p-4
      "
    >
      <div className="flex h-full items-center gap-3">
        <div
          className="
            flex
            h-10
            w-10
            shrink-0
            items-center
            justify-center
            rounded-xl
            border border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            text-[color:var(--gold)]
          "
        >
          {icon}
        </div>

        <div>
          <div className="text-[10px] text-[color:var(--muted)]">
            {translate(label)}
          </div>

          <div className="mt-1 text-lg font-semibold text-white">
            {value}
          </div>

          <div className="mt-1 text-[9px] text-white/35">
            {translate(sub)}
          </div>
        </div>
      </div>
    </div>
  );
}


/* =========================================================
   INPUT
========================================================= */

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label:
    string;

  value:
    string;

  onChange: (
    value: string
  ) => void;

  placeholder?:
    string;
}) {
  const { t: translate } = useLocale();
  return (
    <label className="block">
      <div className="mb-2 text-xs text-white/60">
        {translate(label)}
      </div>

      <input
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        placeholder={
          placeholder
        }
        className="
          h-11
          w-full
          rounded-xl
          border border-[color:var(--border)]
          bg-black/20
          px-4
          text-sm
          text-white
          outline-none
          placeholder:text-white/20
          focus:border-[color:var(--gold-border)]
        "
      />
    </label>
  );
}

/* =========================================================
   SELECT
========================================================= */

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label:
    string;

  value:
    string;

  onChange: (
    value: string
  ) => void;

  options: {
    value:
      string;

    label:
      string;
  }[];
}) {
  const { t: translate } = useLocale();
  return (
    <label className="block">
      <div className="mb-2 text-xs text-white/60">
        {translate(label)}
      </div>

      <select
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className="
          h-11
          w-full
          rounded-xl
          border border-[color:var(--border)]
          bg-black/20
          px-4
          text-sm
          text-white
          outline-none
          focus:border-[color:var(--gold-border)]
        "
      >
        {options.map(
          (
            option
          ) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {
                translate(option.label)
              }
            </option>
          )
        )}
      </select>
    </label>
  );
}
