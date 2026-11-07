import Link from "next/link";
import s from "./acces.module.css";

export default function AccessLanding() {
  return (
    <div className={s.page}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap"
      />
      <div className={s.banner}>Page de test · cette page n’accorde aucun accès, elle ouvre l’espace VIP existant</div>

      <header className={s.header}>
        <b className={s.brand}>investpro</b>
        <span className={s.headerNote}>Espace membre</span>
      </header>

      <section className={s.hero}>
        <div className={s.heroText}>
          <span className={s.kicker}>Accès VIP · membres</span>
          <h1 className={s.title}>
            Bienvenue dans le VIP.
            <br />
            <span className={s.accent}>Tes trades et ton journal, au même endroit.</span>
          </h1>
          <p className={s.lead}>
            Tu as déjà rejoint le groupe. Ton espace VIP te donne les trades en direct, une notification à chaque entrée et
            chaque mise à jour, et ton journal pour suivre tes résultats.
          </p>
          <div className={s.actions}>
            <Link href="/dashboard/vip" className={s.btnPrimary}>
              Ouvrir mon espace VIP
            </Link>
          </div>
        </div>

        <div className={s.channels}>
          <div className={`${s.item} ${s.itemGold}`}>
            <div className={s.itemRow}>
              <b className={s.symbol}>VIP</b>
              <span className={s.tagGold}>Ton accès</span>
            </div>
            <p className={s.itemText}>Trades en direct, notifications et journal.</p>
          </div>
          <div className={s.item}>
            <div className={s.itemRow}>
              <b className={s.symbol}>Telegram</b>
              <span className={s.tagBlue}>Ouvert</span>
            </div>
            <p className={s.itemText}>Ton canal actuel. Rien ne change pour l’instant.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
