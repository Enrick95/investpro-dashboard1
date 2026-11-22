from __future__ import annotations

import asyncio
import json
import math
import os
import subprocess
import sys
import threading
import time
import webbrowser
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .cli import (
    AGE_BUCKETS, AGENT_VERSION, CONFIG_PATH, DAILY_SEND_LIMIT, FOLDER_BY_STATUS, MIN_SEND_INTERVAL,
    SCAN_VERSION, SESSION_PATH, STATUS_LABELS, STATUS_VALUES, SendFailed, SendRefused, build_draft,
    classify_contact, db_connect, log_event, meta_value, scan, send_batch, send_followup, sends_today,
)


HTML_PATH = Path(__file__).resolve().parent / "static" / "dashboard.html"
# Au lancement, la plateforme s’ouvre dans l’onglet Agent Telegram de l’admin (Chrome).
ADMIN_URL = os.getenv("TG_AGENT_ADMIN_URL", "https://investprotrading.fr/dashboard/admin?tool=telegram&view=agent")
# Une seule opération Telegram à la fois : l’analyse et les envois partagent la même session.
TELEGRAM_LOCK = threading.Lock()
# Pages autorisées à lire ce service depuis TON navigateur (panneau admin InvestPro).
# Les données restent sur ta machine : c’est ton navigateur qui lit 127.0.0.1, rien ne passe par le site.
ADMIN_ORIGINS = {
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "TG_AGENT_ADMIN_ORIGINS",
        "https://investprotrading.fr,https://www.investprotrading.fr,"
        "https://investpro-dashboard1-git-claude-admin-redesign-invest-pronos.vercel.app",
    ).split(",")
    if origin.strip()
}
SCAN_STATE = {"running": False, "error": None, "processed": 0, "phase": None}
SEND_STATE = {"running": False, "last_at": 0.0}
# « Tout envoyer » : un seul lot à la fois, lu par le panneau admin pendant l’envoi.
BATCH_STATE: dict = {"running": False}
BATCH_STOP = threading.Event()
CATEGORY_KEYS = ("chaud", "abonne", "tiede", "froid", "vip", "invite", "stop")


def _scan_worker() -> None:
    try:
        # Analyse complète : toutes les conversations privées, quelle que soit leur ancienneté.
        asyncio.run(scan(0, None, lambda count, phase: SCAN_STATE.update(processed=count, phase=phase), interactive=True))
        SCAN_STATE["error"] = None
    except Exception as exc:  # affiché sur la plateforme locale
        SCAN_STATE["error"] = str(exc) or type(exc).__name__
    finally:
        SCAN_STATE["running"] = False
        SCAN_STATE["phase"] = None
        TELEGRAM_LOCK.release()


def _batch_worker(peer_ids: list[int]) -> None:
    try:
        asyncio.run(send_batch(peer_ids, BATCH_STATE, BATCH_STOP))
    except Exception as exc:  # affiché dans le panneau admin
        BATCH_STATE["stopped_reason"] = str(exc) or type(exc).__name__
    finally:
        BATCH_STATE.update(running=False, current=None, next_at=None, phase=None, finished_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
        TELEGRAM_LOCK.release()


def cli_pause() -> tuple:
    from . import cli
    return cli.BATCH_PAUSE_SECONDS


def batch_view() -> dict:
    """État du « Tout envoyer » pour le panneau : compteurs, contact en cours, secondes avant le prochain envoi."""
    view = {key: value for key, value in BATCH_STATE.items() if key != "next_at"}
    next_at = BATCH_STATE.get("next_at")
    view["next_in"] = max(0, round(next_at - time.time())) if next_at else None
    return view


def start_scan_thread() -> bool:
    """Lance l’analyse en arrière-plan ; False si une analyse ou un envoi occupe déjà Telegram."""
    if not TELEGRAM_LOCK.acquire(blocking=False):
        return False
    SCAN_STATE.update(running=True, error=None, processed=0, phase="connexion")
    threading.Thread(target=_scan_worker, daemon=True).start()
    return True


def auto_scan_due(now: datetime | None = None) -> bool:
    """Au lancement, une analyse part toute seule si la dernière date de plus de 12 heures ou d’une ancienne version."""
    if not CONFIG_PATH.exists() or not Path(f"{SESSION_PATH}.session").exists():
        return False
    conn = db_connect()
    try:
        last = meta_value(conn, "last_scan_at")
        version = meta_value(conn, "scan_version")
    finally:
        conn.close()
    if not last or version != SCAN_VERSION:
        return True
    try:
        moment = datetime.fromisoformat(last)
    except ValueError:
        return True
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return (now or datetime.now(timezone.utc)) - moment > timedelta(hours=12)


def _peer_id(path: str, index: int) -> int:
    try:
        return int(path.split("/")[index])
    except (IndexError, ValueError):
        raise ValueError("Identifiant de conversation invalide.")


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "InvestProAgentRelance/2"

    def log_message(self, fmt: str, *args: object) -> None:
        # Le terminal ne garde ni contenu de message ni donnée de contact.
        return

    def _send(self, body: bytes, content_type: str = "application/json; charset=utf-8", status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _json(self, value: object, status: int = 200) -> None:
        self._send(json.dumps(value, ensure_ascii=False).encode("utf-8"), status=status)

    def _admin_origin(self) -> str | None:
        origin = (self.headers.get("Origin") or "").rstrip("/")
        return origin if origin in ADMIN_ORIGINS else None

    def _cors_headers(self) -> None:
        origin = self._admin_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")

    def _local_request(self) -> bool:
        expected_host = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        if host not in expected_host:
            return False
        if origin:
            return urlparse(origin).netloc in expected_host or self._admin_origin() is not None
        return True

    def do_OPTIONS(self) -> None:
        if not self._local_request() or not self._admin_origin():
            self.send_response(403)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(204)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _vip_verified(self, conn) -> bool:
        return meta_value(conn, "vip_membership_state") == "verified"

    def _contact_json(self, row, vip_verified: bool) -> dict:
        info = classify_contact(row, vip_verified)
        keys = row.keys()
        return {
            "peer_id": row["peer_id"],
            "display_name": row["display_name"],
            "username": row["username"],
            "last_message_at": row["last_message_at"],
            "last_message_outgoing": bool(row["last_message_outgoing"]),
            "last_followup_at": row["last_followup_at"],
            "invited_at": row["invited_at"],
            "vip_checked_manually_at": row["vip_checked_manually_at"],
            "status": row["status"],
            "suggested_folder": row["suggested_folder"],
            "snippet": row["last_snippet"] if "last_snippet" in keys else None,
            "snippet_outgoing": bool(row["snippet_outgoing"]) if "snippet_outgoing" in keys and row["snippet_outgoing"] is not None else None,
            "last_incoming_at": row["last_incoming_at"] if "last_incoming_at" in keys else None,
            "vip_check": row["vip_check"] if "vip_check" in keys else None,
            "vip_group": row["vip_group"] if "vip_group" in keys else None,
            "vip_checked_at": row["vip_checked_at"] if "vip_checked_at" in keys else None,
            **info,
        }

    def _body_json(self) -> dict:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length > 16_384:
            raise ValueError("Requête trop volumineuse.")
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            raise ValueError("Content-Type attendu : application/json.")
        value = json.loads(self.rfile.read(content_length).decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("Objet JSON attendu.")
        return value

    def do_GET(self) -> None:
        if not self._local_request():
            self._json({"error": "Requête locale uniquement."}, 403)
            return
        parsed = urlparse(self.path)
        if parsed.path == "/":
            try:
                self._send(HTML_PATH.read_bytes(), "text/html; charset=utf-8")
            except OSError:
                self._json({"error": "Fichier de la plateforme introuvable."}, 500)
            return
        if parsed.path == "/api/summary":
            self._summary()
            return
        if parsed.path == "/api/contacts":
            self._contacts(parse_qs(parsed.query))
            return
        if parsed.path.startswith("/api/contacts/") and parsed.path.endswith("/draft"):
            self._draft(parsed.path)
            return
        if parsed.path == "/api/agent/overview":
            self._agent_overview()
            return
        if parsed.path.startswith("/api/agent/contacts/"):
            self._agent_contact(parsed.path)
            return
        if parsed.path == "/api/send-batch":
            self._json(batch_view())
            return
        self._json({"error": "Route inconnue."}, 404)

    def _agent_overview(self) -> None:
        conn = db_connect()
        try:
            vip_verified = self._vip_verified(conn)
            rows = conn.execute("SELECT * FROM contacts ORDER BY last_message_at DESC").fetchall()
            meta = {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM meta")}
            sent_today = sends_today(conn)
        finally:
            conn.close()
        contacts = [self._contact_json(row, vip_verified) for row in rows]
        categories = {key: 0 for key in CATEGORY_KEYS}
        ages = {key: 0 for key, *_ in AGE_BUCKETS}
        ready_ages = {key: 0 for key, *_ in AGE_BUCKETS}
        for contact in contacts:
            categories[contact["category"]] += 1
            if contact["age_bucket"]:
                ages[contact["age_bucket"]] += 1
                if contact["can_send"]:
                    ready_ages[contact["age_bucket"]] += 1
        self._json({
            "agent_version": AGENT_VERSION,
            "total": len(contacts),
            "categories": categories,
            "ready": sum(1 for c in contacts if c["can_send"]),
            "age_buckets": ages,
            "ready_age_buckets": ready_ages,
            "age_bucket_labels": {key: label for key, label, *_ in AGE_BUCKETS},
            "replies": sum(1 for c in contacts if not c["last_message_outgoing"] and c["category"] in {"chaud", "tiede"}),
            "to_review": sum(1 for c in contacts if c["needs_vip_check"]),
            "pending_tasks": categories["chaud"],
            "sent_today": sent_today,
            "daily_send_limit": DAILY_SEND_LIMIT,
            "last_scan_at": meta.get("last_scan_at"),
            "vip_membership_state": meta.get("vip_membership_state", "unverified"),
            "vip_membership_checked_at": meta.get("vip_membership_checked_at"),
            "vip_membership_groups": json.loads(meta.get("vip_membership_groups", "[]")),
            "vip_membership_issues": json.loads(meta.get("vip_membership_issues", "[]")),
            "scan_running": SCAN_STATE["running"],
            "scan_error": SCAN_STATE["error"],
            "scan_processed": SCAN_STATE["processed"],
            "scan_phase": SCAN_STATE["phase"],
            "send_running": SEND_STATE["running"] or bool(BATCH_STATE.get("running")),
            "batch": batch_view(),
            "status_labels": STATUS_LABELS,
            "contacts": contacts,
        })

    def _agent_contact(self, path: str) -> None:
        try:
            peer_id = _peer_id(path, 4)
        except ValueError as exc:
            self._json({"error": str(exc)}, 400)
            return
        conn = db_connect()
        try:
            row = conn.execute("SELECT * FROM contacts WHERE peer_id=?", (peer_id,)).fetchone()
            vip_verified = self._vip_verified(conn)
            events = [dict(event) for event in conn.execute(
                "SELECT at, action, detail FROM contact_events WHERE peer_id=? ORDER BY at DESC, id DESC LIMIT 50", (peer_id,)
            )]
        finally:
            conn.close()
        if not row:
            self._json({"error": "Contact introuvable."}, 404)
            return
        contact = self._contact_json(row, vip_verified)
        show = contact["can_send"] or (contact["exclusion"] or "").startswith("Déjà relancé")
        self._json({"contact": contact, "events": events, "draft": build_draft(row) if show else None})

    def _summary(self) -> None:
        conn = db_connect()
        try:
            counts = {status: 0 for status in sorted(STATUS_VALUES)}
            for row in conn.execute("SELECT status, COUNT(*) AS n FROM contacts GROUP BY status"):
                counts[row["status"]] = row["n"]
            total = conn.execute("SELECT COUNT(*) FROM contacts").fetchone()[0]
            meta = {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM meta")}
        finally:
            conn.close()
        self._json({
            "total": total,
            "counts": counts,
            "last_scan_at": meta.get("last_scan_at"),
            "vip_membership_state": meta.get("vip_membership_state", "unverified"),
            "vip_membership_checked_at": meta.get("vip_membership_checked_at"),
            "vip_membership_groups": json.loads(meta.get("vip_membership_groups", "[]")),
            "vip_membership_issues": json.loads(meta.get("vip_membership_issues", "[]")),
            "scan_running": SCAN_STATE["running"],
            "scan_error": SCAN_STATE["error"],
            "scan_processed": SCAN_STATE["processed"],
        })

    def _contacts(self, query: dict[str, list[str]]) -> None:
        status = query.get("status", [""])[0]
        search = query.get("q", [""])[0].strip().casefold()
        conn = db_connect()
        try:
            if status and status in STATUS_VALUES:
                rows = conn.execute("SELECT * FROM contacts WHERE status=? ORDER BY last_message_at DESC", (status,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM contacts ORDER BY last_message_at DESC").fetchall()
            verified = self._vip_verified(conn)
        finally:
            conn.close()
        contacts = []
        for row in rows:
            if search and search not in row["display_name"].casefold() and search not in (row["username"] or "").casefold():
                continue
            contacts.append({
                "peer_id": row["peer_id"],
                "display_name": row["display_name"],
                "username": row["username"],
                "last_message_at": row["last_message_at"],
                "last_followup_at": row["last_followup_at"],
                "status": row["status"],
                "suggested_folder": row["suggested_folder"],
            })
        self._json({"contacts": contacts, "drafts_enabled": verified})

    def _draft(self, path: str) -> None:
        try:
            peer_id = _peer_id(path, 3)
        except ValueError as exc:
            self._json({"error": str(exc)}, 400)
            return
        conn = db_connect()
        try:
            row = conn.execute("SELECT * FROM contacts WHERE peer_id=?", (peer_id,)).fetchone()
            verified = self._vip_verified(conn)
        finally:
            conn.close()
        if not row:
            self._json({"error": "Contact introuvable dans la file."}, 404)
            return
        info = classify_contact(row, verified)
        if info["exclusion"] and not info["exclusion"].startswith("Déjà relancé"):
            self._json({"error": "Brouillon bloqué : " + info["exclusion"] + "."}, 409)
            return
        self._json({"draft": build_draft(row)})

    def do_POST(self) -> None:
        if not self._local_request():
            self._json({"error": "Requête locale uniquement."}, 403)
            return
        parsed = urlparse(self.path)
        try:
            payload = self._body_json()
            if parsed.path == "/api/scan":
                self._start_scan()
                return
            if parsed.path == "/api/send-batch":
                self._start_batch(payload)
                return
            if parsed.path == "/api/send-batch/stop":
                BATCH_STOP.set()
                self._json({"ok": True, "message": "Arrêt demandé : le message en cours se termine, puis plus rien ne part."})
                return
            if parsed.path.startswith("/api/contacts/") and parsed.path.endswith("/send"):
                self._send_followup(parsed.path, payload)
                return
            if parsed.path.startswith("/api/contacts/") and parsed.path.endswith("/status"):
                self._set_contact_status(parsed.path, payload)
                return
            if parsed.path.startswith("/api/contacts/") and parsed.path.endswith("/mark-followup"):
                self._mark_followup(parsed.path)
                return
            if parsed.path.startswith("/api/contacts/") and parsed.path.endswith("/invited"):
                self._flag(parsed.path, "invited")
                return
            if parsed.path.startswith("/api/contacts/") and parsed.path.endswith("/vip-checked"):
                self._flag(parsed.path, "vip-checked")
                return
            if parsed.path.startswith("/api/contacts/") and parsed.path.endswith("/do-not-contact"):
                self._flag(parsed.path, "do-not-contact")
                return
            self._json({"error": "Route inconnue."}, 404)
        except (ValueError, json.JSONDecodeError) as exc:
            self._json({"error": str(exc)}, 400)

    def _start_scan(self) -> None:
        if not CONFIG_PATH.exists():
            self._json({
                "started": False,
                "error": "Première étape : dans Terminal, lance `.venv/bin/tg-followup configure`, puis saisis tes identifiants sur ton ordinateur.",
            }, 409)
            return
        if not Path(f"{SESSION_PATH}.session").exists():
            self._json({
                "started": False,
                "error": "Première connexion : lance `.venv/bin/tg-followup scan` dans Terminal pour saisir le code Telegram et le 2FA sur ton Mac. Ensuite, ce bouton pourra analyser les conversations.",
            }, 409)
            return
        if not start_scan_thread():
            self._json({"started": False, "error": "Une analyse ou un envoi est déjà en cours."}, 409)
            return
        self._json({"started": True, "message": "Analyse démarrée. Si Telegram demande ton numéro ou un code, réponds dans la fenêtre du Terminal."})

    def _start_batch(self, payload: dict) -> None:
        """Lance le « Tout envoyer » sur la liste qu’Enrick a sous les yeux (identifiants dans l’ordre affiché)."""
        peer_ids = payload.get("peer_ids")
        if not isinstance(peer_ids, list) or not peer_ids or not all(isinstance(value, int) and not isinstance(value, bool) for value in peer_ids):
            raise ValueError("Liste de contacts invalide.")
        if len(peer_ids) > DAILY_SEND_LIMIT or len(set(peer_ids)) != len(peer_ids):
            raise ValueError(f"Liste invalide : {DAILY_SEND_LIMIT} contacts différents au maximum.")
        conn = db_connect()
        try:
            verified = self._vip_verified(conn)
            remaining = DAILY_SEND_LIMIT - sends_today(conn)
            ready = []
            for peer_id in peer_ids:
                row = conn.execute("SELECT * FROM contacts WHERE peer_id=?", (peer_id,)).fetchone()
                if row and classify_contact(row, verified)["can_send"]:
                    ready.append(peer_id)
        finally:
            conn.close()
        if remaining <= 0:
            self._json({"error": f"Limite de {DAILY_SEND_LIMIT} relances par jour atteinte : reprends demain."}, 409)
            return
        ready = ready[:remaining]
        if not ready:
            self._json({"error": "Aucun contact de cette liste n’est prêt à être relancé."}, 409)
            return
        if not TELEGRAM_LOCK.acquire(blocking=False):
            self._json({"error": "Une analyse ou un envoi est déjà en cours."}, 409)
            return
        BATCH_STOP.clear()
        BATCH_STATE.clear()
        BATCH_STATE.update(
            running=True, total=len(ready), sent=0, skipped=0, members=0, failed=0, current=None, next_at=None,
            phase="connexion", stopped_reason=None, started_at=datetime.now(timezone.utc).isoformat(timespec="seconds"), finished_at=None,
        )
        threading.Thread(target=_batch_worker, args=(ready,), daemon=True).start()
        minutes = math.ceil(len(ready) * sum(cli_pause()) / 2 / 60)
        self._json({"started": True, "total": len(ready), "minutes": minutes})

    def _send_followup(self, path: str, payload: dict) -> None:
        peer_id = _peer_id(path, 3)
        text = payload.get("text")
        if not isinstance(text, str):
            raise ValueError("Le texte du message est manquant.")
        if not TELEGRAM_LOCK.acquire(blocking=False):
            self._json({"error": "Une analyse ou un autre envoi est en cours : attends quelques secondes."}, 409)
            return
        SEND_STATE["running"] = True
        try:
            wait = MIN_SEND_INTERVAL - (time.monotonic() - SEND_STATE["last_at"])
            if wait > 0:
                self._json({"error": f"Patiente {math.ceil(wait)} s entre deux envois."}, 429)
                return
            try:
                result = asyncio.run(send_followup(peer_id, text))
            except SendRefused as exc:
                self._json({"error": str(exc)}, 409)
                return
            except SendFailed as exc:
                self._json({"error": str(exc)}, 502)
                return
            except RuntimeError as exc:
                self._json({"error": str(exc)}, 503)
                return
            SEND_STATE["last_at"] = time.monotonic()
            self._json(result)
        finally:
            SEND_STATE["running"] = False
            TELEGRAM_LOCK.release()

    def _set_contact_status(self, path: str, payload: dict) -> None:
        peer_id = _peer_id(path, 3)
        status = payload.get("status")
        if status not in STATUS_VALUES:
            raise ValueError("Statut invalide.")
        folder = FOLDER_BY_STATUS.get(status, "manuel")
        conn = db_connect()
        try:
            current = conn.execute("SELECT status FROM contacts WHERE peer_id=?", (peer_id,)).fetchone()
            if current and current["status"] in {"actif", "pas_interesse"} and status != "pas_interesse":
                self._json({"error": "Statut protégé : ce contact actif ou fermé reste exclu des relances."}, 409)
                return
            changed = conn.execute(
                "UPDATE contacts SET status=?, suggested_folder=? WHERE peer_id=?",
                (status, folder, peer_id),
            ).rowcount
            if changed:
                log_event(conn, peer_id, "Statut changé", STATUS_LABELS.get(status, status))
            conn.commit()
        finally:
            conn.close()
        if not changed:
            self._json({"error": "Contact introuvable."}, 404)
            return
        self._json({"ok": True})

    def _flag(self, path: str, kind: str) -> None:
        peer_id = _peer_id(path, 3)
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        conn = db_connect()
        try:
            current = conn.execute("SELECT status FROM contacts WHERE peer_id=?", (peer_id,)).fetchone()
            if not current:
                self._json({"error": "Contact introuvable."}, 404)
                return
            if kind == "do-not-contact":
                conn.execute("UPDATE contacts SET status='pas_interesse', suggested_folder='fermes' WHERE peer_id=?", (peer_id,))
                log_event(conn, peer_id, "Marqué « ne plus contacter »")
            elif kind == "invited":
                if current["status"] in {"actif", "pas_interesse"}:
                    self._json({"error": "Ce contact est déjà membre ou fermé."}, 409)
                    return
                conn.execute("UPDATE contacts SET status='deja_invite', suggested_folder='attente', invited_at=? WHERE peer_id=?", (now, peer_id))
                log_event(conn, peer_id, "Lien d’invitation noté comme envoyé")
            else:
                conn.execute("UPDATE contacts SET vip_checked_manually_at=? WHERE peer_id=?", (now, peer_id))
                log_event(conn, peer_id, "Vérifié à la main : pas membre VIP")
            conn.commit()
        finally:
            conn.close()
        self._json({"ok": True})

    def _mark_followup(self, path: str) -> None:
        peer_id = _peer_id(path, 3)
        conn = db_connect()
        try:
            current = conn.execute("SELECT status FROM contacts WHERE peer_id=?", (peer_id,)).fetchone()
            if current and current["status"] in {"actif", "pas_interesse"}:
                self._json({"error": "Relance bloquée : ce contact est actif ou fermé."}, 409)
                return
            changed = conn.execute(
                "UPDATE contacts SET status='reponse_attendue', suggested_folder='attente', last_followup_at=? WHERE peer_id=?",
                (datetime.now(timezone.utc).isoformat(timespec="seconds"), peer_id),
            ).rowcount
            if changed:
                log_event(conn, peer_id, "Relance envoyée à la main", "Envoyée depuis Telegram puis notée ici")
            conn.commit()
        finally:
            conn.close()
        if not changed:
            self._json({"error": "Contact introuvable."}, 404)
            return
        self._json({"ok": True})


def open_platform(local_url: str) -> str:
    """Ouvre l’onglet Agent Telegram de l’admin dans Chrome ou Brave ; à défaut, la plateforme locale."""
    if sys.platform == "darwin" and os.getenv("TG_AGENT_OPEN", "admin") != "local":
        for browser in ("Google Chrome", "Brave Browser"):
            try:
                if subprocess.run(["open", "-a", browser, ADMIN_URL], capture_output=True, timeout=15).returncode == 0:
                    return ADMIN_URL
            except (OSError, subprocess.SubprocessError):
                pass
    webbrowser.open(local_url)
    return local_url


def serve(port: int = 8765, open_browser: bool = True, auto_scan: bool = True) -> None:
    url = f"http://127.0.0.1:{port}"
    db_connect().close()
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), DashboardHandler)
    except OSError:
        print("L’agent tourne déjà sur ce Mac : ouvre l’onglet Agent Telegram de ton admin.")
        if open_browser:
            open_platform(url)
        return
    print("Plateforme de relance : onglet « Agent Telegram » de ton admin, dans ton navigateur.")
    print(f"Elle est aussi disponible ici, sur ce Mac : {url}")
    print("Garde cette fenêtre ouverte pendant que tu utilises la plateforme. Pour arrêter : ferme-la.")
    if auto_scan and auto_scan_due() and start_scan_thread():
        print("Analyse de ton Telegram lancée automatiquement (rien n’est envoyé).")
        print("Si Telegram demande ton numéro, un code ou ton mot de passe 2FA, tape-les ici, dans cette fenêtre.")
    if open_browser:
        threading.Timer(0.8, lambda: open_platform(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Arrêt de la plateforme de relance.")
    finally:
        server.server_close()
