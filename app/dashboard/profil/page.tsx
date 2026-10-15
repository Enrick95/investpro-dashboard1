"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Cable,
  LockKeyhole,
  Crown,
  Check,
  CircleUserRound,
  Clock3,
  Coins,
  Globe2,
  Loader2,
  Save,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Target,
  TrendingUp,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Preferences = {
  preferred_currency: string;
  timezone: string;
  language: string;
  trading_style: string;
  experience_level: string;
  favorite_session: string;
  favorite_asset: string;
  notify_imports: boolean;
  notify_discipline: boolean;
  notify_reports: boolean;
};

const defaults: Preferences = {
  preferred_currency: "USD",
  timezone: "Europe/Paris",
  language: "fr",
  trading_style: "day_trading",
  experience_level: "intermediate",
  favorite_session: "London",
  favorite_asset: "XAUUSD",
  notify_imports: true,
  notify_discipline: true,
  notify_reports: true,
};

export default function ProfilePage() {
  const { t: translate, locale, setLocale } = useLocale();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [username, setUsername] = useState("Trader");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("free");
  const [xp, setXp] = useState(0);
  const [prefs, setPrefs] = useState<Preferences>(defaults);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
          return;
        }

        setEmail(user.email || "");

        const [profileResult, prefsResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("username, plan, xp")
            .eq("id", user.id)
            .maybeSingle(),

          supabase
            .from("trader_preferences")
            .select(
              "preferred_currency, timezone, language, trading_style, experience_level, favorite_session, favorite_asset, notify_imports, notify_discipline, notify_reports"
            )
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        setUsername(
          profileResult.data?.username ||
            user.user_metadata?.username ||
            user.email?.split("@")[0] ||
            "Trader"
        );
        setPlan(String(profileResult.data?.plan || "free").toLowerCase());
        setXp(Number(profileResult.data?.xp || 0));

        if (prefsResult.data) {
          setPrefs({
            preferred_currency:
              prefsResult.data.preferred_currency || defaults.preferred_currency,
            timezone: prefsResult.data.timezone || defaults.timezone,
            language: prefsResult.data.language || defaults.language,
            trading_style:
              prefsResult.data.trading_style || defaults.trading_style,
            experience_level:
              prefsResult.data.experience_level || defaults.experience_level,
            favorite_session:
              prefsResult.data.favorite_session || defaults.favorite_session,
            favorite_asset:
              prefsResult.data.favorite_asset || defaults.favorite_asset,
            notify_imports:
              prefsResult.data.notify_imports ?? defaults.notify_imports,
            notify_discipline:
              prefsResult.data.notify_discipline ?? defaults.notify_discipline,
            notify_reports:
              prefsResult.data.notify_reports ?? defaults.notify_reports,
          });
        }
      } catch (e) {
        console.error("Erreur profil :", e);
        setError("Impossible de charger tes paramètres.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [supabase]);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    if (key === "language" && (value === "fr" || value === "en")) setLocale(value);
    setSaved(false);
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    try {
      setSaving(true);
      setSaved(false);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const cleanUsername = username.trim().slice(0, 30) || "Trader";

      const [profileResult, prefsResult] = await Promise.all([
        supabase
          .from("profiles")
          .update({ username: cleanUsername })
          .eq("id", user.id),

        supabase.from("trader_preferences").upsert(
          {
            user_id: user.id,
            ...prefs,
            language: locale,
            favorite_asset: prefs.favorite_asset.trim().toUpperCase(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        ),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (prefsResult.error) throw prefsResult.error;

      setUsername(cleanUsername);
      setPrefs((prev) => ({
        ...prev,
        favorite_asset: prev.favorite_asset.trim().toUpperCase(),
      }));

      window.localStorage.setItem(
        "investpro_notification_preferences",
        JSON.stringify({
          imports: prefs.notify_imports,
          discipline: prefs.notify_discipline,
          reports: prefs.notify_reports,
        })
      );

      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
    } catch (e: any) {
      console.error("Erreur sauvegarde profil :", e);
      setError(e?.message || "Impossible d’enregistrer les paramètres.");
    } finally {
      setSaving(false);
    }
  }

  const initials =
    username
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "IP";

  const level =
    xp >= 3000
      ? "Pro Trader"
      : xp >= 1500
      ? "Confirmé"
      : xp >= 500
      ? "Trader"
      : "Rookie";

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 className="animate-spin text-[color:var(--gold)]" size={24} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[26px] border border-[color:var(--gold-border)] bg-[color:var(--panel)] p-5 md:p-6">
        <div className="pointer-events-none absolute -left-20 -top-20 h-52 w-52 rounded-full bg-[color:var(--gold)] opacity-[0.06] blur-[70px]" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-xl font-bold text-[color:var(--gold)] md:h-20 md:w-20 md:text-2xl">
              {initials}
            </div>

            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold)]">
                <CircleUserRound size={11} />
                {translate("Profil trader")}</div>

              <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
                {username}
              </h1>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted)]">
                <span>{email}</span>
                <span>•</span>
                <span>{translate("Plan")}{" "}{plan.toUpperCase()}</span>
                <span>•</span>
                <span>{level}</span>
                <span>•</span>
                <span>{xp.toLocaleString("fr-FR")} {translate("XP")}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--gold)] px-5 text-sm font-semibold text-black transition disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={15} />
            ) : saved ? (
              <Check size={15} />
            ) : (
              <Save size={15} />
            )}
            {saving
              ? translate("Enregistrement…")
              : saved
              ? translate("Enregistré")
              : translate("Enregistrer mes paramètres")}
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">
          {translate(error)}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <SettingsCard
            icon={<CircleUserRound size={17} />}
            title={translate("Mon identité InvestPro")}
            subtitle={translate("Les informations visibles dans ton espace trader.")}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={translate("Pseudo")}>
                <input
                  value={username}
                  onChange={(e) => {
                    setSaved(false);
                    setUsername(e.target.value);
                  }}
                  maxLength={30}
                  className="ip-profile-input"
                  placeholder={translate("Ton pseudo")}
                />
              </Field>

              <Field label={translate("Email")}>
                <input
                  value={email}
                  readOnly
                  className="ip-profile-input opacity-60"
                />
              </Field>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <InfoBox label={translate("Plan")} value={plan.toUpperCase()} />
              <InfoBox label={translate("Niveau")} value={level} />
              <InfoBox label={translate("XP")} value={xp.toLocaleString("fr-FR")} />
              <InfoBox label={translate("Langue")} value={locale.toUpperCase()} />
            </div>
          </SettingsCard>

          <SettingsCard
            icon={<TrendingUp size={17} />}
            title={translate("Profil de trading")}
            subtitle={translate("Personnalise ton environnement selon ta façon de trader.")}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={translate("Style de trading")}>
                <Select
                  value={prefs.trading_style}
                  onChange={(value) => update("trading_style", value)}
                  options={[
                    ["scalping", "Scalping"],
                    ["day_trading", "Day Trading"],
                    ["swing", "Swing Trading"],
                    ["position", "Position Trading"],
                  ]}
                />
              </Field>

              <Field label={translate("Niveau d’expérience")}>
                <Select
                  value={prefs.experience_level}
                  onChange={(value) => update("experience_level", value)}
                  options={[
                    ["beginner", "Débutant"],
                    ["intermediate", "Intermédiaire"],
                    ["advanced", "Avancé"],
                    ["professional", "Professionnel"],
                  ]}
                />
              </Field>

              <Field label={translate("Session préférée")}>
                <Select
                  value={prefs.favorite_session}
                  onChange={(value) => update("favorite_session", value)}
                  options={[
                    ["Asian", "Asian"],
                    ["London", "London"],
                    ["New York", "New York"],
                    ["London + New York", "London + New York"],
                  ]}
                />
              </Field>

              <Field label={translate("Actif favori")}>
                <input
                  value={prefs.favorite_asset}
                  onChange={(e) =>
                    update("favorite_asset", e.target.value.toUpperCase())
                  }
                  maxLength={20}
                  className="ip-profile-input"
                  placeholder={translate("Ex: XAUUSD")}
                />
              </Field>
            </div>
          </SettingsCard>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <SettingsCard
            icon={<Globe2 size={17} />}
            title={translate("Préférences générales")}
            subtitle={translate("Format d’affichage utilisé dans ton espace.")}
          >
            <div className="space-y-4">
              <Field icon={<Coins size={13} />} label={translate("Devise préférée")}>
                <Select
                  value={prefs.preferred_currency}
                  onChange={(value) => update("preferred_currency", value)}
                  options={[
                    ["USD", "USD — Dollar"],
                    ["EUR", "EUR — Euro"],
                    ["GBP", "GBP — Livre sterling"],
                    ["CHF", "CHF — Franc suisse"],
                  ]}
                />
              </Field>

              <Field icon={<Clock3 size={13} />} label={translate("Fuseau horaire")}>
                <Select
                  value={prefs.timezone}
                  onChange={(value) => update("timezone", value)}
                  options={[
                    ["Europe/Paris", "Paris (UTC+1/+2)"],
                    ["Europe/London", "Londres"],
                    ["America/New_York", "New York"],
                    ["Asia/Dubai", "Dubaï"],
                    ["Asia/Tokyo", "Tokyo"],
                  ]}
                />
              </Field>

              <Field icon={<Globe2 size={13} />} label={translate("Langue")}>
                <Select
                  value={locale}
                  onChange={(value) => update("language", value)}
                  options={[
                    ["fr", "Français"],
                    ["en", "English"],
                  ]}
                />
              </Field>
            </div>
          </SettingsCard>

          <SettingsCard
            icon={<Bell size={17} />}
            title={translate("Notifications")}
            subtitle={translate("Choisis les alertes que tu souhaites recevoir dans la cloche.")}
          >
            <div className="space-y-2">
              <Toggle
                title={translate("Imports & synchronisations")}
                text={translate("Compte synchronisé et nouveaux trades importés.")}
                checked={prefs.notify_imports}
                onChange={(value) => update("notify_imports", value)}
              />
              <Toggle
                title={translate("Discipline & hors plan")}
                text={translate("Alerte lorsqu’un trade enfreint une règle détectable.")}
                checked={prefs.notify_discipline}
                onChange={(value) => update("notify_discipline", value)}
              />
              <Toggle
                title={translate("Rapports")}
                text={translate("Bilan mensuel et rapports disponibles.")}
                checked={prefs.notify_reports}
                onChange={(value) => update("notify_reports", value)}
              />
            </div>
          </SettingsCard>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <BottomCard
          icon={<ShieldCheck size={17} />}
          title={translate("Plan & discipline")}
          text={translate("Tes règles restent gérées depuis ton Plan de trading.")}
          href="/dashboard/plan"
          cta="Voir mon plan"
        />
        <BottomCard
          icon={<Target size={17} />}
          title={translate("Mes comptes")}
          text={translate("Gère tes comptes et tes connexions de trading.")}
          href="/dashboard/comptes"
          cta="Gérer mes comptes"
        />
        <BottomCard
          icon={<Cable size={17} />}
          title={translate("Centre des connexions")}
          text={translate("Vérifie l’état de MT4, MT5, ProjectX et Tradovate.")}
          href="/dashboard/connexions"
          cta="Voir mes connexions"
        />
        <BottomCard
          icon={<LockKeyhole size={17} />}
          title={translate("Compte & sécurité")}
          text={translate("Mot de passe, sessions et actions sensibles.")}
          href="/dashboard/compte"
          cta="Sécuriser mon compte"
        />
        <BottomCard
          icon={<Crown size={17} />}
          title={translate("Abonnement & accès")}
          text={translate("Plan actuel, fonctionnalités et état de l’abonnement.")}
          href="/dashboard/abonnement"
          cta="Voir mon accès"
        />
        <BottomCard
          icon={<Sparkles size={17} />}
          title={translate("Bilan")}
          text={translate("Retrouve ton analyse mensuelle automatique.")}
          href="/dashboard/rapport-mensuel"
          cta="Voir mon bilan"
        />
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("investpro:open-install-guide"))}
          className="rounded-[18px] border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] p-4 text-left transition hover:border-[color:var(--gold)]"
        >
          <div className="text-[color:var(--gold)]"><Smartphone size={17} /></div>
          <div className="mt-3 text-xs font-semibold text-white">{translate("InvestPro Mobile")}</div>
          <div className="mt-1 text-[9px] leading-4 text-[color:var(--muted)]">
            {translate("Ajoute InvestPro à ton écran d’accueil et utilise-le comme une app.")}</div>
          <div className="mt-3 text-[10px] font-semibold text-[color:var(--gold)]">
            {translate("Installer l’application →")}</div>
        </button>
      </section>

      <style jsx global>{`
        .ip-profile-input,
        .ip-profile-select {
          width: 100%;
          height: 44px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: rgba(0,0,0,.22);
          color: white;
          padding: 0 13px;
          outline: none;
          font-size: 13px;
        }

        .ip-profile-input:focus,
        .ip-profile-select:focus {
          border-color: var(--gold-border);
          box-shadow: 0 0 0 3px rgba(218,177,75,.06);
        }

        @media (max-width: 900px) {
          body.ip-mobile-profile main,
          body.ip-mobile-profile [data-dashboard-main] {
            padding-top: 18px !important;
          }

          .ip-profile-input,
          .ip-profile-select {
            height: 46px;
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}

function SettingsCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { t: translate } = useLocale();
  return (
    <section className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">{translate(title)}</h2>
          <p className="mt-1 text-[10px] leading-4 text-[color:var(--muted)]">
            {translate(subtitle)}
          </p>
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t: translate } = useLocale();
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-white/45">
        {icon ? <span className="text-[color:var(--gold)]">{icon}</span> : null}
        {translate(label)}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  const { t: translate } = useLocale();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="ip-profile-select"
    >
      {options.map(([key, label]) => (
        <option key={key} value={key} className="bg-[#101210]">
          {translate(label)}
        </option>
      ))}
    </select>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  const { t: translate } = useLocale();
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="text-[8px] uppercase tracking-[0.08em] text-white/25">
        {translate(label)}
      </div>
      <div className="mt-1 truncate text-xs font-semibold text-white">{value}</div>
    </div>
  );
}

function Toggle({
  title,
  text,
  checked,
  onChange,
}: {
  title: string;
  text: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t: translate } = useLocale();
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-left"
    >
      <span
        className={[
          "relative h-6 w-11 shrink-0 rounded-full transition",
          checked ? "bg-[color:var(--gold)]" : "bg-white/10",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-1 h-4 w-4 rounded-full bg-white transition",
            checked ? "left-6" : "left-1",
          ].join(" ")}
        />
      </span>

      <span>
        <span className="block text-xs font-semibold text-white">{translate(title)}</span>
        <span className="mt-0.5 block text-[9px] leading-4 text-[color:var(--muted)]">
          {translate(text)}
        </span>
      </span>
    </button>
  );
}

function BottomCard({
  icon,
  title,
  text,
  href,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  href: string;
  cta: string;
}) {
  const { t: translate } = useLocale();
  return (
    <a
      href={href}
      className="rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 transition hover:border-[color:var(--gold-border)]"
    >
      <div className="text-[color:var(--gold)]">{icon}</div>
      <div className="mt-3 text-xs font-semibold text-white">{translate(title)}</div>
      <div className="mt-1 text-[9px] leading-4 text-[color:var(--muted)]">
        {translate(text)}
      </div>
      <div className="mt-3 text-[10px] font-semibold text-[color:var(--gold)]">
        {translate(cta)} →
      </div>
    </a>
  );
}
