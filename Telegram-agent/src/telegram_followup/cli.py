from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import sqlite3
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterable

AGENT_VERSION = "2"


def _find_app_dir() -> Path:
    """Resolve the checkout root even when this package is installed in .venv."""
    for parent in Path(__file__).resolve().parents:
        if (parent / "pyproject.toml").is_file():
            return parent
    return Path(__file__).resolve().parents[2]


APP_DIR = _find_app_dir()
SESSION_PATH = APP_DIR / "data" / "support_account"
DB_PATH = APP_DIR / "data" / "followups.sqlite3"
CONFIG_PATH = APP_DIR / "data" / "telegram_api.json"
# Pseudos Telegram (hachés) des demandes VIP, essais et membres enregistrés sur le site.
SITE_CHECKS_PATH = APP_DIR / "data" / "site-checks.json"

DEFAULT_SITE = "https://investprotrading.fr/vip"
# Lien du site qui ouvre le WhatsApp d’Enrick avec un message déjà écrit (« je viens de Telegram »).
WHATSAPP_LINK = os.getenv("TG_AGENT_WHATSAPP_LINK", "https://investprotrading.fr/whatsapp")
# L’essai VIP gratuit sur compte démo s’arrête le 30 novembre 2026 à minuit (heure de Paris).
ESSAI_END = datetime(2026, 11, 30, 23, 59, 59, tzinfo=timezone(timedelta(hours=1)))
# Notifications officielles de Telegram : jamais des prospects.
TELEGRAM_SERVICE_IDS = {777000, 42777}
DAILY_SEND_LIMIT = 100
MIN_SEND_INTERVAL = 3.0
SENT_ACTION = "Relance envoyée depuis l’agent"
SNIPPET_MAX = 280

RELEVANT_TERMS = (
    "vip", "copy", "trading", "trade", "trader", "broker", "signal", "investpro", "invest pro",
    "compte demo", "compte démo", "affiliation", "bonus", "depot", "dépôt", "forex", "gold", "xauusd",
    "crypto", "bitcoin", "indice", "nasdaq", "formation", "lek invest", "metatrader", "mt4", "mt5",
    "ftmo", "prop firm", "challenge", "essai", "abonnement", "vt markets", "vtmarkets", "pu prime",
    "puprime", "bullwaves", "raise fx", "raisefx", "enrick",
)
INTEREST_TERMS = (
    "je suis interesse", "je suis intéressé", "ca m'interesse", "ça m'intéresse",
    "comment rejoindre", "rejoindre le vip", "lien vip", "je veux rejoindre",
    "je veux voir le vip", "envoie le lien",
)
CALL_TERMS = ("appel", "telephone", "téléphone", "appeler", "rappelle-moi", "rappeler")
BROKER_TERMS = ("broker", "courtier", "bonus", "depot", "dépôt", "inscription", "ouvrir un compte")
OPT_OUT_TERMS = (
    "ne me contacte plus", "ne me relance plus", "arrete de m'ecrire", "arrête de m'écrire",
    "je ne veux plus recevoir", "pas interesse", "pas intéressé", "plus interesse", "plus intéressé",
    "non merci", "pas pour moi", "laisse moi tranquille", "laisse-moi tranquille", "desabonne",
    "désabonne", "unsubscribe",
)
STATUS_VALUES = {
    "a_verifier", "vip_interesse", "appel_demande", "infos_broker_demandees",
    "pas_interesse", "actif", "relance_envoyee", "reponse_attendue", "deja_invite",
}
HOT_STATUSES = {"vip_interesse", "appel_demande", "infos_broker_demandees"}
FOLLOWUP_STATUSES = {"relance_envoyee", "reponse_attendue"}
STATUS_LABELS = {
    "a_verifier": "À vérifier", "vip_interesse": "VIP intéressé", "appel_demande": "Appel demandé",
    "infos_broker_demandees": "Infos broker demandées", "pas_interesse": "Ne plus contacter",
    "actif": "Déjà membre VIP", "relance_envoyee": "Relance envoyée", "reponse_attendue": "Réponse attendue",
    "deja_invite": "Lien déjà envoyé",
}
FOLDER_BY_STATUS = {
    "pas_interesse": "fermes",
    "actif": "actifs",
    "reponse_attendue": "attente",
    "relance_envoyee": "attente",
    "a_verifier": "relance",
    "vip_interesse": "manuel",
    "appel_demande": "manuel",
    "infos_broker_demandees": "manuel",
    "deja_invite": "attente",
}
AGE_BUCKETS = (
    ("recent", "Moins de 3 mois", 0, 90),
    ("3m", "3 à 6 mois", 90, 180),
    ("6m", "6 à 12 mois", 180, 365),
    ("1an", "Plus d’un an", 365, None),
)


def normalize(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value.casefold())
    return "".join(ch for ch in folded if not unicodedata.combining(ch)).replace("’", "'")


def has_any(text: str, terms: Iterable[str]) -> bool:
    normalized = normalize(text)
    return any(normalize(term) in normalized for term in terms)


def is_opt_out(text: str) -> bool:
    return normalize(text).strip(" .,!?:;\n\t") == "stop" or has_any(text, OPT_OUT_TERMS)


def explicit_intent(text: str) -> str | None:
    """Statut chaud suggéré par le dernier message reçu, ou None s’il ne dit rien de clair."""
    if not text:
        return None
    if has_any(text, CALL_TERMS):
        return "appel_demande"
    if has_any(text, BROKER_TERMS):
        return "infos_broker_demandees"
    if has_any(text, INTEREST_TERMS):
        return "vip_interesse"
    return None


def classify_incoming(text: str) -> tuple[str, str]:
    if is_opt_out(text):
        return "pas_interesse", "fermes"
    status = explicit_intent(text) or "a_verifier"
    return status, "manuel"


def age_bucket(days: int | None) -> str | None:
    if days is None:
        return None
    for key, _label, low, high in AGE_BUCKETS:
        if days >= low and (high is None or days < high):
            return key
    return None


def snippet_of(text: str | None) -> str:
    compact = " ".join((text or "").split())
    return compact if len(compact) <= SNIPPET_MAX else compact[: SNIPPET_MAX - 1].rstrip() + "…"


# Débuts de noms affichés qui ne sont pas des prénoms (« La Fouine », « Trader Karim »…).
NOT_FIRST_NAMES = {
    "la", "le", "les", "mr", "mme", "mlle", "mrs", "ms", "dr", "the", "trader", "trading", "invest",
    "crypto", "forex", "official", "officiel", "vip", "support", "team", "equipe",
}


def first_name_from(display_name: str | None) -> str | None:
    """Prénom présentable pour le brouillon, ou None quand le nom affiché n’en contient pas."""
    name = (display_name or "").strip()
    if not name or (name.startswith("Telegram ") and name[9:].isdigit()):
        return None
    token = name.split()[0]
    cleaned = "".join(ch for ch in token if ch.isalpha() or ch in "-'’").strip("-'’")
    if len(cleaned) < 2 or normalize(cleaned) in NOT_FIRST_NAMES:
        return None
    if cleaned.isupper() or cleaned.islower():
        cleaned = "-".join(part[:1].upper() + part[1:].lower() for part in cleaned.split("-"))
    return cleaned


def db_connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        DB_PATH.parent.chmod(0o700)
    except OSError:
        pass
    connection = sqlite3.connect(DB_PATH, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS contacts (
            peer_id INTEGER PRIMARY KEY,
            display_name TEXT NOT NULL,
            username TEXT,
            last_message_at TEXT NOT NULL,
            last_message_outgoing INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'a_verifier',
            suggested_folder TEXT NOT NULL DEFAULT 'manuel',
            last_seen_at TEXT NOT NULL
        )"""
    )
    connection.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    columns = {row[1] for row in connection.execute("PRAGMA table_info(contacts)")}
    # Colonnes ajoutées au fil des versions : une base existante est complétée sans rien perdre.
    for name, kind in (
        ("last_followup_at", "TEXT"),
        ("invited_at", "TEXT"),
        ("vip_checked_manually_at", "TEXT"),
        ("last_snippet", "TEXT"),
        ("snippet_outgoing", "INTEGER"),
        ("last_incoming_at", "TEXT"),
        ("relevant", "INTEGER"),
        ("vip_check", "TEXT"),
        ("vip_checked_at", "TEXT"),
        ("vip_group", "TEXT"),
    ):
        if name not in columns:
            connection.execute(f"ALTER TABLE contacts ADD COLUMN {name} {kind}")
    # Journal local des actions (sans le contenu des messages).
    connection.execute(
        """CREATE TABLE IF NOT EXISTS contact_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            peer_id INTEGER NOT NULL,
            at TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT
        )"""
    )
    connection.execute("CREATE INDEX IF NOT EXISTS contact_events_peer ON contact_events(peer_id, at)")
    connection.execute("CREATE INDEX IF NOT EXISTS contact_events_action ON contact_events(action, at)")
    connection.commit()
    try:
        DB_PATH.chmod(0o600)
    except OSError:
        pass
    return connection


def log_event(conn: sqlite3.Connection, peer_id: int, action: str, detail: str | None = None) -> None:
    conn.execute(
        "INSERT INTO contact_events(peer_id, at, action, detail) VALUES(?, ?, ?, ?)",
        (peer_id, datetime.now(timezone.utc).isoformat(timespec="seconds"), action, detail),
    )


def meta_value(conn: sqlite3.Connection, key: str, default: str | None = None) -> str | None:
    row = conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return row[0] if row else default


def set_meta(conn: sqlite3.Connection, values: dict[str, str]) -> None:
    conn.executemany(
        "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        list(values.items()),
    )


def sends_today(conn: sqlite3.Connection, now: datetime | None = None) -> int:
    """Relances envoyées par l’agent depuis minuit, heure de l’ordinateur."""
    local_now = (now or datetime.now(timezone.utc)).astimezone()
    start = local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    row = conn.execute(
        "SELECT COUNT(*) FROM contact_events WHERE action=? AND at>=?",
        (SENT_ACTION, start.isoformat(timespec="seconds")),
    ).fetchone()
    return int(row[0])


def _days_since(value: str | None, now: datetime) -> int | None:
    if not value:
        return None
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return max(0, (now - moment).days)


SITE_MEMBER_SOURCES = {"acces_approved", "candidature_approved", "candidature_claimed", "paiement_stripe"}
_SITE_CACHE: dict = {"mtime": None, "path": None, "handles": {}}


def site_checks() -> dict:
    """Empreintes des pseudos connus du site, relues seulement quand le fichier change."""
    try:
        mtime = SITE_CHECKS_PATH.stat().st_mtime
    except OSError:
        return {}
    if _SITE_CACHE["mtime"] != mtime or _SITE_CACHE["path"] != str(SITE_CHECKS_PATH):
        try:
            data = json.loads(SITE_CHECKS_PATH.read_text(encoding="utf-8"))
            handles = {str(key): [str(item) for item in value] for key, value in (data.get("handles") or {}).items()}
        except (OSError, ValueError, AttributeError, TypeError):
            handles = {}
        _SITE_CACHE.update(mtime=mtime, path=str(SITE_CHECKS_PATH), handles=handles)
    return _SITE_CACHE["handles"]


def site_sources(username: str | None) -> set:
    handle = (username or "").strip().lstrip("@").lower()
    if not handle:
        return set()
    return set(site_checks().get(hashlib.sha256(handle.encode("utf-8")).hexdigest(), []))


def _column(row: sqlite3.Row, name: str):
    return row[name] if name in row.keys() else None


def classify_contact(row: sqlite3.Row, vip_verified: bool, now: datetime | None = None) -> dict:
    """Catégorie lisible, raison du classement, motif d’exclusion et alerte éventuelle.

    Ce sont des suggestions : les mots-clés ne prouvent ni l’intérêt ni le consentement.
    """
    now = now or datetime.now(timezone.utc)
    status = row["status"]
    incoming_last = not row["last_message_outgoing"]
    days = _days_since(row["last_message_at"], now)
    followup_days = _days_since(_column(row, "last_followup_at"), now)
    invited_at = _column(row, "invited_at")
    manual_vip = _column(row, "vip_checked_manually_at")
    vip_check = _column(row, "vip_check")
    vip_group = _column(row, "vip_group")
    relevant = _column(row, "relevant")
    ago = "aujourd’hui" if days == 0 else f"il y a {days} j" if days is not None else "date inconnue"
    sources = site_sources(_column(row, "username"))

    if status == "actif" or vip_check == "membre":
        category = "vip"
        reason = f"Membre du groupe VIP « {vip_group} »." if vip_group else "Présent dans un groupe VIP vérifié."
    elif status == "pas_interesse":
        category, reason = "stop", "A refusé d’autres messages, t’a bloqué ou a été marqué « ne plus contacter »."
    elif sources & SITE_MEMBER_SOURCES:
        category, reason = "vip", "Sa demande d’accès au VIP a été acceptée sur le site."
    elif status == "deja_invite" or invited_at:
        category = "invite"
        reason = "Lien d’invitation déjà envoyé" + (f" (il y a {_days_since(invited_at, now)} j)" if invited_at else "") + "."
    elif status in HOT_STATUSES:
        category = "chaud"
        reason = {
            "vip_interesse": "A montré de l’intérêt pour le VIP ou demandé le lien",
            "appel_demande": "A parlé d’un appel",
            "infos_broker_demandees": "A demandé des infos broker ou dépôt",
        }[status] + " : relis la conversation pour confirmer."
    elif incoming_last:
        category, reason = "tiede", f"T’a écrit en dernier ({ago}), sans décision claire."
    elif status in FOLLOWUP_STATUSES:
        category = "froid"
        reason = "Déjà relancé" + (f" il y a {followup_days} j" if followup_days is not None else "") + ", pas de réponse depuis."
    else:
        category = "froid"
        reason = (f"Ton dernier message date de {days} j" if days else "Ancien échange") + ", sans réponse de sa part."

    needs_vip_check = False
    exclusion = None
    if category == "vip":
        exclusion = "Déjà membre VIP"
    elif category == "stop":
        exclusion = "Ne veut plus être contacté"
    elif category == "invite":
        exclusion = "Lien VIP déjà envoyé"
    elif "acces_pending" in sources:
        exclusion = "Demande d’accès VIP en attente sur le site : valide-la dans ton admin plutôt que de le relancer"
    elif any(source.startswith("essai_") for source in sources):
        exclusion = "A déjà demandé l’essai VIP sur le site : traite sa demande dans ton admin"
    elif incoming_last and days is not None and days < 2:
        exclusion = "T’a écrit il y a moins de 2 jours : réponds d’abord dans Telegram"
    elif days is not None and days < 7:
        exclusion = f"Échange récent ({ago}) : attends un peu avant de relancer"
    elif not manual_vip and vip_check != "non_membre" and not (vip_check is None and vip_verified):
        needs_vip_check = True
        exclusion = (
            "Contrôle VIP impossible pour ce contact : vérifie à la main avant de relancer"
            if vip_check == "inconnu"
            else "Pas encore contrôlé dans les groupes VIP : lance « Analyser Telegram »"
        )
    elif followup_days is not None and followup_days < 7:
        exclusion = f"Déjà relancé il y a {followup_days} j"

    warning = None
    if any(source.endswith("_denied") for source in sources) and category not in {"vip", "stop"}:
        warning = "Sa demande VIP a été refusée sur le site : vérifie avant de relancer."
    elif relevant == 0 and category in {"froid", "tiede"}:
        warning = "Aucun mot lié au trading dans ses derniers messages : vérifie que c’est bien un prospect."
    return {
        "category": category,
        "reason": reason,
        "exclusion": exclusion,
        "warning": warning,
        "needs_vip_check": needs_vip_check,
        "can_send": exclusion is None,
        "age_days": days,
        "age_bucket": age_bucket(days),
        "status_label": STATUS_LABELS.get(status, status),
    }


def decide_status(previous: str | None, last_out: bool, latest_incoming: str, opted_out: bool) -> str:
    """Statut après une nouvelle analyse, sans jamais réouvrir un contact protégé."""
    if previous == "pas_interesse" or opted_out:
        return "pas_interesse"
    if previous in {"actif", "deja_invite"}:
        return previous
    intent = explicit_intent(latest_incoming)
    if previous in FOLLOWUP_STATUSES:
        # Il a répondu après la relance : son message décide du nouveau statut.
        return (intent or "a_verifier") if not last_out else previous
    if intent:
        return intent
    if previous in HOT_STATUSES:
        return previous
    return "a_verifier"


def telegram_client():
    try:
        from telethon import TelegramClient
    except ImportError as exc:
        raise RuntimeError("Dépendance manquante. Installe le projet avec `python -m pip install -e .`.") from exc
    settings = {}
    if CONFIG_PATH.exists():
        try:
            settings = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError("Le fichier local des identifiants Telegram est illisible. Lance `tg-followup configure` à nouveau.") from exc
    api_id = os.getenv("TELEGRAM_API_ID", str(settings.get("api_id", ""))).strip()
    api_hash = os.getenv("TELEGRAM_API_HASH", str(settings.get("api_hash", ""))).strip()
    if not api_id or not api_hash:
        raise RuntimeError(
            "Définis TELEGRAM_API_ID et TELEGRAM_API_HASH dans ton terminal. "
            "Ne partage jamais ces valeurs ni le code Telegram dans le chat."
        )
    SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        SESSION_PATH.parent.chmod(0o700)
    except OSError:
        pass
    client = TelegramClient(str(SESSION_PATH), int(api_id), api_hash)
    # Les courtes pauses demandées par Telegram sont respectées automatiquement.
    client.flood_sleep_threshold = 90
    return client


async def connect_client(client, interactive: bool) -> None:
    if interactive:
        # Le numéro, le code et le 2FA éventuels se tapent dans la fenêtre du Terminal, jamais ailleurs.
        await client.start()
        return
    await client.connect()
    if not await client.is_user_authorized():
        await client.disconnect()
        raise RuntimeError(
            "Ta session Telegram n’est plus active : clique sur « Analyser Telegram » et reconnecte-toi "
            "dans la fenêtre du Terminal (numéro, code et 2FA restent sur ton Mac)."
        )


def configure() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        DB_PATH.parent.chmod(0o700)
    except OSError:
        pass
    api_id = input("Telegram API ID (my.telegram.org/apps) : ").strip()
    try:
        int(api_id)
    except ValueError as exc:
        raise ValueError("L’API ID doit être un nombre.") from exc
    api_hash = getpass.getpass("Telegram API hash (saisie masquée) : ").strip()
    if not api_hash:
        raise ValueError("L’API hash ne peut pas être vide.")
    CONFIG_PATH.write_text(json.dumps({"api_id": api_id, "api_hash": api_hash}), encoding="utf-8")
    try:
        CONFIG_PATH.chmod(0o600)
    except OSError:
        pass
    print("Identifiants enregistrés localement dans data/telegram_api.json (ignoré par Git).")


def _is_prospect_dialog(entity, user_type) -> bool:
    return (
        isinstance(entity, user_type)
        and not getattr(entity, "bot", False)
        and not getattr(entity, "deleted", False)
        and not getattr(entity, "is_self", False)
        and not getattr(entity, "support", False)
        and entity.id not in TELEGRAM_SERVICE_IDS
    )


def _message_text(message) -> str:
    text = getattr(message, "message", None) or ""
    if text:
        return text
    return "[photo, vidéo ou fichier]" if getattr(message, "media", None) else ""


async def scan(
    min_days: int = 0,
    max_days: int | None = None,
    progress_callback: Callable[[int, str], None] | None = None,
    interactive: bool = True,
) -> int:
    """Check-up de toutes les conversations privées, puis contrôle VIP contact par contact."""
    from telethon.tl.types import User

    def progress(count: int, phase: str) -> None:
        if progress_callback:
            progress_callback(count, phase)
        elif count and count % 10 == 0:
            print(f"{phase.capitalize()} : {count}", end="\r", flush=True)

    progress(0, "connexion")
    client = telegram_client()
    await connect_client(client, interactive)
    now = datetime.now(timezone.utc)
    lower_bound = now - timedelta(days=max_days) if max_days else None
    upper_bound = now - timedelta(days=min_days) if min_days else None
    conn = db_connect()
    found = 0
    processed = 0
    seen: dict[int, object] = {}
    try:
        groups = await load_vip_groups(client)
        async for dialog in client.iter_dialogs():
            processed += 1
            progress(processed, "conversations")
            entity = dialog.entity
            if not _is_prospect_dialog(entity, User):
                continue
            last = dialog.message
            if last is None:
                continue
            last_at = last.date.replace(tzinfo=timezone.utc) if last.date.tzinfo is None else last.date.astimezone(timezone.utc)
            if (lower_bound and last_at < lower_bound) or (upper_bound and last_at > upper_bound):
                continue
            recent = [message async for message in client.iter_messages(entity, limit=8)]
            if not recent:
                continue
            incoming = [message for message in recent if not message.out]
            incoming_texts = [message.message for message in incoming if message.message]
            latest_incoming = incoming_texts[0] if incoming_texts else ""
            opted_out = any(is_opt_out(text) for text in incoming_texts)
            context_text = "\n".join(message.message or "" for message in recent if message.message)
            existing = conn.execute("SELECT * FROM contacts WHERE peer_id=?", (entity.id,)).fetchone()
            previous = existing["status"] if existing else None
            status = decide_status(previous, bool(last.out), latest_incoming, opted_out)
            folder = FOLDER_BY_STATUS.get(status, "manuel")
            if previous is None:
                log_event(conn, entity.id, "Ajouté par l’analyse", STATUS_LABELS.get(status, status))
            elif previous != status:
                log_event(conn, entity.id, "Statut mis à jour par l’analyse", f"{STATUS_LABELS.get(previous, previous)} → {STATUS_LABELS.get(status, status)}")
            name = " ".join(part for part in (getattr(entity, "first_name", None), getattr(entity, "last_name", None)) if part)
            name = name or f"Telegram {entity.id}"
            last_incoming_at = None
            if incoming:
                moment = incoming[0].date
                last_incoming_at = (moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment.astimezone(timezone.utc)).isoformat(timespec="seconds")
            conn.execute(
                """INSERT INTO contacts(peer_id, display_name, username, last_message_at, last_message_outgoing,
                       status, suggested_folder, last_seen_at, last_snippet, snippet_outgoing, last_incoming_at, relevant)
                   VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(peer_id) DO UPDATE SET
                       display_name=excluded.display_name,
                       username=excluded.username,
                       last_message_at=excluded.last_message_at,
                       last_message_outgoing=excluded.last_message_outgoing,
                       status=excluded.status,
                       suggested_folder=excluded.suggested_folder,
                       last_seen_at=excluded.last_seen_at,
                       last_snippet=excluded.last_snippet,
                       snippet_outgoing=excluded.snippet_outgoing,
                       last_incoming_at=excluded.last_incoming_at,
                       relevant=excluded.relevant""",
                (
                    entity.id, name, getattr(entity, "username", None), last_at.isoformat(timespec="seconds"),
                    int(bool(last.out)), status, folder, now.isoformat(timespec="seconds"),
                    snippet_of(_message_text(recent[0])), int(bool(recent[0].out)), last_incoming_at,
                    int(has_any(context_text, RELEVANT_TERMS)),
                ),
            )
            seen[entity.id] = entity
            found += 1
            if found % 20 == 0:
                conn.commit()
        conn.commit()
        summary = await check_vip_members(client, conn, groups, seen, lambda count: progress(count, "contrôle VIP"))
        set_meta(conn, {"last_scan_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "scan_scope": "toutes les conversations privées"})
        conn.commit()
    finally:
        conn.close()
        await client.disconnect()
    if not progress_callback:
        print()
        print(f"Analyse terminée : {processed} conversation(s) parcourue(s), {found} contact(s) suivi(s).")
        print(f"Contrôle VIP : {summary['members']} membre(s) exclu(s), {summary['unknown']} à vérifier à la main.")
        for issue in summary["issues"]:
            print(f"  · {issue}")
        print("Aucun message n’a été envoyé et aucun dossier Telegram n’a été modifié.")
    return found


def is_reference_vip(title: str) -> bool:
    """Le groupe « InvestPro Trading VIP », celui que les membres rejoignent. Ni INSTALLATION ni les chats."""
    words = normalize(title)
    return all(word in words for word in ("investpro", "trading", "vip")) and not any(
        word in words for word in ("installation", "chat")
    )


async def load_vip_groups(client) -> list[dict]:
    """Le groupe VIP de référence, avec la liste de membres que Telegram laisse voir."""
    from telethon.tl.types import Channel, Chat

    groups: list[dict] = []
    async for dialog in client.iter_dialogs():
        entity = dialog.entity
        title = getattr(entity, "title", "") or ""
        if not (isinstance(entity, (Channel, Chat)) and is_reference_vip(title)):
            continue
        group = {
            "entity": entity, "title": title, "ids": set(), "complete": False,
            "channel": isinstance(entity, Channel), "error": None,
        }
        try:
            async for participant in client.iter_participants(entity):
                group["ids"].add(participant.id)
            expected = getattr(entity, "participants_count", None)
            group["complete"] = expected is not None and len(group["ids"]) >= expected
            group["visible"] = len(group["ids"])
            group["expected"] = expected
        except Exception as exc:  # droits insuffisants : on tentera le contrôle contact par contact
            group["error"] = "droits administrateur requis" if type(exc).__name__ == "ChatAdminRequiredError" else type(exc).__name__
        groups.append(group)
    return groups


async def check_vip_members(client, conn: sqlite3.Connection, groups: list[dict], seen: dict, progress: Callable[[int], None] | None = None) -> dict:
    """Range « déjà membre » tout contact présent dans InvestPro Trading VIP ; « inconnu » si le contrôle échoue."""
    from telethon import errors
    from telethon.tl.functions.channels import GetParticipantRequest

    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = conn.execute("SELECT peer_id FROM contacts WHERE status NOT IN ('actif', 'pas_interesse')").fetchall()
    # Seuls les contacts vus pendant cette analyse sont contrôlés : Telegram connaît leur conversation.
    peer_ids = [row["peer_id"] for row in rows if row["peer_id"] in seen]
    member_of: dict[int, str] = {}
    unknown: dict[int, set[str]] = {peer_id: set() for peer_id in peer_ids}
    issues: list[str] = []
    stopped = False
    checked = 0
    if not groups:
        issues.append("Groupe « InvestPro Trading VIP » introuvable sur ce compte : impossible de savoir qui est déjà membre, vérifie chaque contact à la main")
    for group in groups:
        attempts = errors_count = 0
        given_up = False
        for peer_id in peer_ids:
            if peer_id in member_of:
                continue
            if peer_id in group["ids"]:
                member_of[peer_id] = group["title"]
                continue
            if group["complete"]:
                continue
            if stopped or given_up or not group["channel"]:
                unknown[peer_id].add(group["title"])
                continue
            # Trois refus d’affilée dès le début : le compte n’a pas les droits, inutile d’insister.
            if attempts >= 3 and errors_count == attempts:
                given_up = True
                unknown[peer_id].add(group["title"])
                continue
            attempts += 1
            try:
                await client(GetParticipantRequest(channel=group["entity"], participant=seen.get(peer_id, peer_id)))
                member_of[peer_id] = group["title"]
            except errors.UserNotParticipantError:
                pass
            except errors.FloodWaitError:
                stopped = True
                unknown[peer_id].add(group["title"])
            except Exception as exc:
                errors_count += 1
                unknown[peer_id].add(group["title"])
                group["error"] = group["error"] or type(exc).__name__
            checked += 1
            if progress:
                progress(checked)
        impossible = given_up or (attempts and errors_count == attempts) or (not group["channel"] and not group["complete"])
        if impossible:
            issues.append(f"{group['title']} : contrôle impossible ({group['error'] or 'liste incomplète'}) : vérifie ces contacts à la main")
        elif attempts and errors_count:
            issues.append(f"{group['title']} : {errors_count} contact(s) non vérifiable(s) ({group['error']})")
    if stopped:
        issues.append("Telegram a demandé une longue pause : relance l’analyse plus tard pour finir le contrôle VIP")

    members = unknowns = 0
    for peer_id in peer_ids:
        if peer_id in member_of:
            members += 1
            conn.execute(
                "UPDATE contacts SET status='actif', suggested_folder='actifs', vip_check='membre', vip_group=?, vip_checked_at=? WHERE peer_id=?",
                (member_of[peer_id], now_iso, peer_id),
            )
            log_event(conn, peer_id, "Trouvé dans un groupe VIP", member_of[peer_id])
            continue
        blocking = unknown[peer_id]
        if blocking or not groups:
            unknowns += 1
        conn.execute(
            "UPDATE contacts SET vip_check=?, vip_group=NULL, vip_checked_at=? WHERE peer_id=?",
            ("inconnu" if blocking or not groups else "non_membre", now_iso, peer_id),
        )
    state = "verified" if groups and not unknowns and not stopped else "partial" if groups else "unverified"
    set_meta(conn, {
        "vip_membership_checked_at": now_iso,
        "vip_membership_state": state,
        "vip_membership_groups": json.dumps([group["title"] for group in groups], ensure_ascii=False),
        "vip_membership_issues": json.dumps(issues, ensure_ascii=False),
    })
    conn.commit()
    return {"members": members, "unknown": unknowns, "issues": issues, "state": state}


class SendRefused(ValueError):
    """Envoi refusé avant tout appel à Telegram (contact exclu, message vide, limite du jour)."""


class SendFailed(RuntimeError):
    """Telegram a refusé l’envoi ; le message dit quoi faire."""


def _send_failure(exc: Exception) -> tuple[str, str | None]:
    """Message lisible et éventuel statut à poser après un refus de Telegram."""
    name = type(exc).__name__
    if name == "FloodWaitError":
        return f"Telegram demande une pause de {getattr(exc, 'seconds', '?')} s avant le prochain envoi. Réessaie après.", None
    if name == "PeerFloodError":
        return "Telegram limite les envois de ton compte pour le moment (protection anti-spam). Arrête les relances pour aujourd’hui et reprends demain.", None
    if name == "UserIsBlockedError":
        return "Ce contact t’a bloqué sur Telegram : il est passé en « ne plus contacter ».", "pas_interesse"
    if name in {"InputUserDeactivatedError", "UserDeactivatedError", "UserDeactivatedBanError"}:
        return "Ce compte Telegram a été supprimé : le contact est passé en « ne plus contacter ».", "pas_interesse"
    if name == "YouBlockedUserError":
        return "Tu as bloqué ce contact sur Telegram : débloque-le si tu veux lui écrire.", None
    if name == "PrivacyPremiumRequiredError":
        return "Ce contact n’accepte les messages que des comptes Telegram Premium.", None
    if name == "ChatWriteForbiddenError":
        return "Telegram n’autorise pas l’envoi dans cette conversation.", None
    return f"Envoi impossible ({name}). Réessaie, ou envoie le message à la main dans Telegram.", None


async def _resolve_contact(client, peer_id: int, username: str | None):
    """Retrouve la conversation par son identifiant (mémorisé à l’analyse), sinon par son @pseudo."""
    try:
        return await client.get_input_entity(peer_id)
    except (ValueError, TypeError):
        pass
    if username:
        try:
            return await client.get_input_entity(username)
        except Exception as exc:
            if type(exc).__name__ == "FloodWaitError":
                raise
    raise SendFailed("Telegram ne retrouve pas cette conversation : relance « Analyser Telegram » puis réessaie.")


async def send_followup(peer_id: int, text: str, now: datetime | None = None) -> dict:
    """Envoie la relance relue et validée par Enrick, depuis le compte support, puis la note."""
    message = (text or "").strip()
    if not message:
        raise SendRefused("Le message est vide.")
    if len(message) > 4000:
        raise SendRefused("Message trop long : 4 000 caractères au maximum.")
    conn = db_connect()
    try:
        row = conn.execute("SELECT * FROM contacts WHERE peer_id=?", (peer_id,)).fetchone()
        if not row:
            raise SendRefused("Contact introuvable dans la file.")
        info = classify_contact(row, meta_value(conn, "vip_membership_state") == "verified", now)
        if info["exclusion"]:
            raise SendRefused("Envoi bloqué : " + info["exclusion"] + ".")
        if sends_today(conn, now) >= DAILY_SEND_LIMIT:
            raise SendRefused(f"Limite de {DAILY_SEND_LIMIT} relances par jour atteinte : reprends demain pour protéger ton compte.")
        username = row["username"]
    finally:
        conn.close()

    client = telegram_client()
    await connect_client(client, interactive=False)
    new_status = None
    try:
        try:
            entity = await _resolve_contact(client, peer_id, username)
            await client.send_message(entity, message)
        except SendFailed:
            raise
        except Exception as exc:
            reason, new_status = _send_failure(exc)
            raise SendFailed(reason) from exc
    except SendFailed:
        if new_status:
            conn = db_connect()
            try:
                conn.execute(
                    "UPDATE contacts SET status=?, suggested_folder=? WHERE peer_id=?",
                    (new_status, FOLDER_BY_STATUS[new_status], peer_id),
                )
                log_event(conn, peer_id, "Envoi refusé par Telegram", "Passé en « ne plus contacter »")
                conn.commit()
            finally:
                conn.close()
        raise
    finally:
        await client.disconnect()

    conn = db_connect()
    try:
        conn.execute(
            "UPDATE contacts SET status='reponse_attendue', suggested_folder='attente', last_followup_at=? WHERE peer_id=?",
            ((now or datetime.now(timezone.utc)).isoformat(timespec="seconds"), peer_id),
        )
        log_event(conn, peer_id, SENT_ACTION, f"{len(message)} caractères, relus et validés avant envoi")
        conn.commit()
        count = sends_today(conn, now)
    finally:
        conn.close()
    return {"ok": True, "sent_today": count, "daily_limit": DAILY_SEND_LIMIT}


async def sync_folders(apply: bool) -> None:
    from telethon import functions

    client = telegram_client()
    await client.start()
    conn = db_connect()
    try:
        membership_state = meta_value(conn, "vip_membership_state")
        rows = conn.execute(
            "SELECT peer_id, display_name, status, suggested_folder, vip_check, vip_checked_manually_at FROM contacts "
            "WHERE suggested_folder IN ('relance', 'attente', 'manuel', 'actifs', 'fermes') "
            "ORDER BY suggested_folder, display_name"
        ).fetchall()
        if membership_state != "verified" and any(
            row["suggested_folder"] == "relance" and row["vip_check"] != "non_membre" and not row["vip_checked_manually_at"]
            for row in rows
        ):
            print("Classement des relances suspendu : certains contacts n’ont pas pu être contrôlés dans les groupes VIP. Lance `tg-followup scan`.")
            return
        filters_result = await client(functions.messages.GetDialogFiltersRequest())
        filters = {}
        for dialog_filter in filters_result.filters:
            raw_title = getattr(dialog_filter, "title", None)
            if raw_title is None or not hasattr(dialog_filter, "include_peers"):
                continue
            title = getattr(raw_title, "text", str(raw_title))
            key = normalize(title)
            if key in {"relance", "attente", "manuel", "actifs", "fermes"}:
                filters[key] = dialog_filter

        grouped: dict[str, list[sqlite3.Row]] = {
            name: [] for name in ("relance", "attente", "manuel", "actifs", "fermes")
        }
        for row in rows:
            grouped[normalize(row["suggested_folder"])].append(row)

        updates = []
        for name, candidates in grouped.items():
            if not candidates:
                continue
            target_filter = filters.get(name)
            if target_filter is None:
                print(f"Dossier Telegram « {name} » introuvable : {len(candidates)} contact(s) non classé(s).")
                continue
            included = list(target_filter.include_peers)
            excluded = list(getattr(target_filter, "exclude_peers", []))
            added = []
            for row in candidates:
                peer = await client.get_input_entity(row["peer_id"])
                if peer in excluded:
                    print(f"Ignoré (exclu manuellement du dossier {name}) : {row['display_name']}.")
                    continue
                if peer not in included:
                    added.append((peer, row["display_name"]))
            print(f"Dossier {name} : {len(added)} ajout(s) à appliquer, {len(candidates) - len(added)} déjà classé(s) ou ignoré(s).")
            if apply and added:
                target_filter.include_peers = included + [peer for peer, _ in added]
                await client(functions.messages.UpdateDialogFilterRequest(id=target_filter.id, filter=target_filter))
                updates.extend(name_display for _, name_display in added)
        if apply:
            print(f"Classement Telegram mis à jour pour {len(updates)} conversation(s).")
        else:
            print("Aucune modification faite. Relance avec `folder-sync --apply` pour confirmer les déplacements affichés.")
    finally:
        conn.close()
        await client.disconnect()


def list_contacts(status: str | None = None) -> None:
    conn = db_connect()
    try:
        if status:
            rows = conn.execute("SELECT * FROM contacts WHERE status=? ORDER BY last_message_at", (status,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM contacts ORDER BY last_message_at").fetchall()
    finally:
        conn.close()
    if not rows:
        print("Aucun contact dans la file. Lance d’abord `tg-followup scan`.")
        return
    for row in rows:
        when = datetime.fromisoformat(row["last_message_at"]).astimezone().strftime("%Y-%m-%d")
        username = f" @{row['username']}" if row["username"] else ""
        print(f"{row['peer_id']} | {row['display_name']}{username} | dernier message : {when} | {row['status']} | dossier suggéré : {row['suggested_folder']}")


def set_status(peer_id: int, status: str) -> None:
    if status not in STATUS_VALUES:
        raise ValueError(f"Statut inconnu. Valeurs possibles : {', '.join(sorted(STATUS_VALUES))}")
    folder = FOLDER_BY_STATUS.get(status, "manuel")
    conn = db_connect()
    try:
        current = conn.execute("SELECT status FROM contacts WHERE peer_id=?", (peer_id,)).fetchone()
        if current and current["status"] in {"actif", "pas_interesse"} and status != current["status"] and status != "pas_interesse":
            raise ValueError("Statut protégé : un contact actif ou fermé ne peut pas être remis dans la file de relance.")
        updated = conn.execute(
            "UPDATE contacts SET status=?, suggested_folder=? WHERE peer_id=?",
            (status, folder, peer_id),
        ).rowcount
        if updated:
            log_event(conn, peer_id, "Statut changé (terminal)", STATUS_LABELS.get(status, status))
        conn.commit()
    finally:
        conn.close()
    if not updated:
        raise ValueError(f"Contact {peer_id} introuvable dans la file.")
    print(f"Statut du contact {peer_id} mis à jour : {status}.")


def mark_followup(peer_id: int) -> None:
    conn = db_connect()
    try:
        current = conn.execute("SELECT status FROM contacts WHERE peer_id=?", (peer_id,)).fetchone()
        if current and current["status"] in {"actif", "pas_interesse"}:
            raise ValueError("Relance bloquée : ce contact est actif ou fermé.")
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        updated = conn.execute(
            "UPDATE contacts SET status='reponse_attendue', suggested_folder='attente', last_followup_at=? WHERE peer_id=?",
            (now, peer_id),
        ).rowcount
        if updated:
            log_event(conn, peer_id, "Relance envoyée à la main (terminal)")
        conn.commit()
    finally:
        conn.close()
    if not updated:
        raise ValueError(f"Contact {peer_id} introuvable dans la file.")
    print(f"Relance manuelle enregistrée pour {peer_id}; aucune action Telegram n’a été effectuée.")


def show_draft(peer_id: int, name: str | None = None) -> None:
    conn = db_connect()
    try:
        row = conn.execute("SELECT * FROM contacts WHERE peer_id=?", (peer_id,)).fetchone()
        verified = meta_value(conn, "vip_membership_state") == "verified"
    finally:
        conn.close()
    if not row:
        raise ValueError(f"Contact {peer_id} introuvable dans la file.")
    info = classify_contact(row, verified)
    if info["exclusion"] and not info["exclusion"].startswith("Déjà relancé"):
        raise ValueError("Brouillon bloqué : " + info["exclusion"] + ".")
    print(build_draft(row, name))
    print("\nBrouillon uniquement : vérifie le contexte avant tout envoi.")


def build_draft(row: sqlite3.Row, name: str | None = None, now: datetime | None = None) -> str:
    """Message proposé selon la catégorie : chauds, tièdes ou froids. Toujours modifiable avant l’envoi."""
    now = now or datetime.now(timezone.utc)
    try:
        category = classify_contact(row, True, now)["category"]
    except (KeyError, IndexError, TypeError):
        category = "froid"
    first = name or first_name_from(row["display_name"])
    trial = now <= ESSAI_END
    trial_line = "jusqu’au 30 novembre, tu peux tester le VIP gratuitement sur un compte démo, sans dépôt."
    if category == "chaud":
        parts = [
            f"Salut {first} ! 👋" if first else "Salut ! 👋",
            "Tu m’avais demandé des infos pour rejoindre le VIP. Pour aller plus vite, je t’ai ouvert un WhatsApp : "
            "c’est là que je réponds en priorité, et je t’explique tout en 2 minutes (broker, dépôt, accès au VIP).",
            f"👉 Écris-moi ici : {WHATSAPP_LINK}",
        ]
        if trial:
            parts.append("Petit plus : " + trial_line)
    elif category == "tiede":
        parts = [
            f"Salut {first}, désolé pour le retour tardif ! 🙏" if first else "Salut, désolé pour le retour tardif ! 🙏",
            "J’ai bien vu ton message et je ne veux pas te laisser sans réponse. Le plus simple maintenant : "
            "écris-moi sur WhatsApp, je te réponds directement là-bas.",
            f"👉 {WHATSAPP_LINK}",
        ]
        if trial:
            parts.append("Et bonne nouvelle : " + trial_line)
    else:
        parts = [f"Salut {first}, j’espère que tu vas bien !" if first else "Salut, j’espère que tu vas bien !"]
        if trial:
            parts += [
                "On avait échangé il y a quelque temps sur le trading. Petite nouvelle : " + trial_line,
                f"Si ça te tente, écris-moi sur WhatsApp, je t’explique tout et je t’ouvre l’accès 👉 {WHATSAPP_LINK}",
            ]
        else:
            parts += [
                "On avait échangé il y a quelque temps sur le trading, je me permets de revenir vers toi. "
                "Si le VIP t’intéresse toujours, écris-moi sur WhatsApp : je t’explique tout et je réponds à tes questions.",
                f"👉 {WHATSAPP_LINK}",
            ]
        parts.append("Et si ce n’est plus d’actualité, dis-le-moi simplement, je ne te relancerai plus.")
    parts.append("(Le trading comporte un risque de perte.)")
    return "\n\n".join(parts)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Agent local de relance Telegram InvestPro.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("configure", help="Saisir les identifiants API Telegram dans le terminal local.")
    scan_parser = sub.add_parser("scan", help="Check-up de toutes les conversations privées et contrôle VIP.")
    scan_parser.add_argument("--min-days", type=int, default=0, help="Ignorer les échanges plus récents que N jours (défaut : 0, tout).")
    scan_parser.add_argument("--max-days", type=int, default=0, help="Ignorer les échanges plus vieux que N jours (défaut : 0, aucune limite).")
    list_parser = sub.add_parser("list", help="Afficher la file locale de suivi.")
    list_parser.add_argument("--status", choices=sorted(STATUS_VALUES))
    status_parser = sub.add_parser("status", help="Changer le statut d’un contact dans la file locale.")
    status_parser.add_argument("peer_id", type=int)
    status_parser.add_argument("value", choices=sorted(STATUS_VALUES))
    sent_parser = sub.add_parser("mark-followup", help="Enregistrer une relance envoyée manuellement.")
    sent_parser.add_argument("peer_id", type=int)
    folders_parser = sub.add_parser("folder-sync", help="Prévisualiser ou appliquer le classement aux dossiers Telegram existants.")
    folders_parser.add_argument("--apply", action="store_true", help="Appliquer les ajouts aux dossiers existants.")
    dashboard_parser = sub.add_parser("dashboard", help="Lancer la plateforme locale dans ton navigateur.")
    dashboard_parser.add_argument("--port", type=int, default=8765)
    dashboard_parser.add_argument("--no-browser", action="store_true", help="Ne pas ouvrir le navigateur automatiquement.")
    draft_parser = sub.add_parser("draft", help="Afficher un brouillon sans l’envoyer.")
    draft_parser.add_argument("peer_id", type=int)
    draft_parser.add_argument("--name", help="Prénom à utiliser dans le brouillon.")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        if args.command == "configure":
            configure()
        elif args.command == "scan":
            if args.min_days < 0 or args.max_days < 0 or (args.max_days and args.max_days < args.min_days):
                raise ValueError("Choisis min-days >= 0, et max-days = 0 (aucune limite) ou >= min-days.")
            import asyncio
            asyncio.run(scan(args.min_days, args.max_days or None))
        elif args.command == "list":
            list_contacts(args.status)
        elif args.command == "status":
            set_status(args.peer_id, args.value)
        elif args.command == "mark-followup":
            mark_followup(args.peer_id)
        elif args.command == "folder-sync":
            import asyncio
            asyncio.run(sync_folders(args.apply))
        elif args.command == "draft":
            show_draft(args.peer_id, args.name)
        elif args.command == "dashboard":
            from .dashboard import serve
            serve(args.port, open_browser=not args.no_browser)
    except (RuntimeError, ValueError) as exc:
        print(f"Erreur : {exc}", file=sys.stderr)
        raise SystemExit(2) from exc


if __name__ == "__main__":
    main()
