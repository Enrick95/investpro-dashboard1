"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Clock3,
  Database,
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
    loadAccounts();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAccounts() {
    try {
      setLoading(
        true
      );

      const {
        data: { user },
        error:
          userError,
      } =
        await supabase.auth.getUser();

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

      if (error) {
        console.error(
          "Erreur chargement comptes :",
          error
        );

        pushNotif({
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
    } finally {
      setLoading(
        false
      );
    }
  }

  /* =========================================================
     STATS
  ========================================================= */

  const stats =
    useMemo(() => {
      const totalBalance =
        accounts.reduce(
          (
            total,
            account
          ) =>
            total +
            Number(
              account.current_balance ||
                0
            ),
          0
        );

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

      return {
        total:
          accounts.length,

        totalBalance,

        realAccounts,

        propAccounts,
      };
    }, [accounts]);

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

  async function deleteAccount(
    account: TradingAccount
  ) {
    const confirmed =
      window.confirm(
        `Supprimer le compte "${account.name}" ?`
      );

    if (
      !confirmed
    ) {
      return;
    }

    const {
      error,
    } =
      await supabase
        .from(
          "trading_accounts"
        )
        .delete()
        .eq(
          "id",
          account.id
        );

    if (error) {
      console.error(
        "Erreur suppression compte :",
        error
      );

      pushNotif({
        kind:
          "error",

        title:
          "Mes comptes",

        message:
          "Impossible de supprimer ce compte.",

        ttlMs:
          8000,
      });

      return;
    }

    setAccounts(
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            account.id
        )
    );

    pushNotif({
      kind:
        "success",

      title:
        "Mes comptes",

      message:
        "Compte supprimé.",

      ttlMs:
        5000,
    });
  }

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-sm text-[color:var(--muted)]">
        Chargement de tes
        comptes…
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5 pb-10">
        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              Mes{" "}
              <span className="text-[color:var(--gold)]">
                comptes
              </span>
            </h1>

            <p className="mt-1 text-sm text-[color:var(--muted)]">
              Ajoute tes
              comptes de
              trading pour
              centraliser ton
              capital et
              alimenter ton
              journal.
            </p>
          </div>

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

            Ajouter un compte
          </button>
        </div>

        {/* =====================================================
            STATS
        ===================================================== */}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard
            icon={
              <WalletCards
                size={18}
              />
            }
            label="Mes comptes"
            value={String(
              stats.total
            )}
            sub={
              stats.total ===
              0
                ? "Aucun compte"
                : `${stats.realAccounts} réel • ${stats.propAccounts} prop firm`
            }
          />

          <StatCard
            icon={
              <WalletCards
                size={18}
              />
            }
            label="Capital total"
            value={formatMoney(
              stats.totalBalance,
              accounts[0]
                ?.currency ||
                "EUR"
            )}
            sub="Capital actuel déclaré"
          />

          <StatCard
            icon={
              <RefreshCw
                size={18}
              />
            }
            label="Synchronisation"
            value="Manuelle"
            sub="MT4 / MT5 auto bientôt"
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
              px-5 py-4
            "
          >
            <div>
              <h2 className="text-sm font-semibold text-white">
                Comptes de
                trading
              </h2>

              <p className="mt-1 text-[10px] text-[color:var(--muted)]">
                Ces comptes
                pourront être
                sélectionnés
                dans ton
                journal.
              </p>
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
              COMPTE
              {stats.total !==
              1
                ? "S"
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
                Aucun compte
                ajouté
              </div>

              <p className="mt-2 max-w-md text-xs leading-5 text-[color:var(--muted)]">
                Ajoute ton
                compte une
                seule fois.
                Son capital
                pourra ensuite
                être utilisé
                automatiquement
                dans ton
                journal.
              </p>

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

                Ajouter mon
                premier compte
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
              {accounts.map(
                (account) => (
                  <AccountCard
                    key={
                      account.id
                    }
                    account={
                      account
                    }
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
            METATRADER FUTURE
        ===================================================== */}

        <section
          className="
            relative
            overflow-hidden
            rounded-[24px]
            border border-[color:var(--gold-border)]
            bg-[color:var(--panel)]
            p-6
            md:p-7
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

                Prochaine étape
              </div>

              <h2 className="mt-4 text-xl font-semibold text-white md:text-2xl">
                Connexion
                automatique{" "}
                <span className="text-[color:var(--gold)]">
                  MetaTrader
                </span>
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                Pour le moment,
                tes comptes
                sont gérés
                manuellement.
                Plus tard,
                InvestPro pourra
                synchroniser
                automatiquement
                la balance et
                les trades MT4 /
                MT5.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <FeaturePill
                  text="MetaTrader 4"
                />

                <FeaturePill
                  text="MetaTrader 5"
                />

                <FeaturePill
                  text="Balance automatique"
                />

                <FeaturePill
                  text="Journal automatique"
                />
              </div>
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
                    Bridge
                    MetaTrader
                  </div>

                  <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                    En cours de
                    développement
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            FUTURE FEATURES
        ===================================================== */}

        <section
          className="
            overflow-hidden
            rounded-[22px]
            border border-[color:var(--border)]
            bg-[color:var(--panel)]
          "
        >
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <h2 className="text-sm font-semibold text-white">
              Synchronisation
              MetaTrader
            </h2>

            <p className="mt-1 text-[10px] text-[color:var(--muted)]">
              Fonctionnalités
              prévues lors de
              l’activation de
              la connexion.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-px bg-white/[0.04] md:grid-cols-2 xl:grid-cols-4">
            <FutureFeature
              icon={
                <Database
                  size={18}
                />
              }
              title="Historique automatique"
              text="Tes trades clôturés seront automatiquement ajoutés à ton journal."
            />

            <FutureFeature
              icon={
                <RefreshCw
                  size={18}
                />
              }
              title="Capital synchronisé"
              text="La balance et l’equity pourront être récupérées automatiquement."
            />

            <FutureFeature
              icon={
                <WalletCards
                  size={18}
                />
              }
              title="Plusieurs comptes"
              text="Regroupe tes brokers, comptes personnels et prop firms."
            />

            <FutureFeature
              icon={
                <ShieldCheck
                  size={18}
                />
              }
              title="Journal connecté"
              text="Tes trades pourront alimenter automatiquement tes statistiques."
            />
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
                  px-6 py-5
                "
              >
                <div>
                  <div className="text-base font-semibold text-white">
                    {editingAccount
                      ? "Modifier le compte"
                      : "Ajouter un compte"}
                  </div>

                  <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                    Connexion
                    manuelle
                  </div>
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
                      Compte manuel
                    </div>

                    <p className="mt-1 text-[10px] leading-5 text-[color:var(--muted)]">
                      Aucun mot de
                      passe MT4 ou
                      MT5 n’est
                      nécessaire.
                      Tu renseignes
                      simplement
                      les
                      informations
                      de ton
                      compte.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <InputField
                    label="Nom du compte"
                    placeholder="Compte principal"
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
                    label="Type de compte"
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
                    label="Plateforme"
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
                    label="Broker / Prop Firm"
                    placeholder="RaiseFX, FTMO, Tradeify..."
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
                    label="Devise"
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
                    label="Capital initial"
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

                  <div className="md:col-span-2">
                    <InputField
                      label="Capital actuel"
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
                      Tu pourras
                      modifier ce
                      montant plus
                      tard. Quand
                      la connexion
                      MetaTrader
                      sera prête,
                      cette valeur
                      pourra être
                      synchronisée
                      automatiquement.
                    </p>
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
                    Annuler
                  </button>

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
                      ? "Enregistrement..."
                      : editingAccount
                      ? "Enregistrer les modifications"
                      : "Ajouter le compte"}
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
  account,
  onEdit,
  onDelete,
}: {
  account:
    TradingAccount;

  onEdit:
    () => void;

  onDelete:
    () => void;
}) {
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
                {accountTypeLabel(
                  account.account_type
                )}
                {" • "}
                {account.platform ||
                  "AUTRE"}
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
            Manuel
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
              Capital actuel
            </div>

            <div className="mt-1 text-base font-semibold text-white">
              {formatMoney(
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
              Capital initial
            </div>

            <div className="mt-1 text-base font-semibold text-white">
              {formatMoney(
                Number(
                  account.initial_balance ||
                    0
                ),
                account.currency
              )}
            </div>
          </div>
        </div>

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
              Broker /
              Prop Firm
            </div>

            <div className="mt-1 text-xs text-white">
              {account.broker ||
                "Non renseigné"}
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
              title="Modifier"
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
              title="Supprimer"
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
            {label}
          </div>

          <div className="mt-1 text-lg font-semibold text-white">
            {value}
          </div>

          <div className="mt-1 text-[9px] text-white/35">
            {sub}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturePill({
  text,
}: {
  text: string;
}) {
  return (
    <span
      className="
        rounded-full
        border border-white/[0.07]
        bg-black/20
        px-3 py-1.5
        text-[10px]
        text-white/55
      "
    >
      {text}
    </span>
  );
}

function FutureFeature({
  icon,
  title,
  text,
}: {
  icon:
    React.ReactNode;

  title:
    string;

  text:
    string;
}) {
  return (
    <div className="bg-[color:var(--panel)] p-5">
      <div
        className="
          flex
          h-10
          w-10
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

      <div className="mt-4 text-xs font-semibold text-white">
        {title}
      </div>

      <p className="mt-2 text-[10px] leading-5 text-[color:var(--muted)]">
        {text}
      </p>
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
  return (
    <label className="block">
      <div className="mb-2 text-xs text-white/60">
        {label}
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
  return (
    <label className="block">
      <div className="mb-2 text-xs text-white/60">
        {label}
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
                option.label
              }
            </option>
          )
        )}
      </select>
    </label>
  );
}