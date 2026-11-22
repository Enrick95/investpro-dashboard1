import asyncio
import json
import sqlite3
import threading
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer

import pytest
from telethon import errors

from fake_telegram import Msg, NOW, channel, chat, user
from telegram_followup import cli, dashboard

OLD_SCHEMA = """CREATE TABLE contacts (
    peer_id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, username TEXT, last_message_at TEXT NOT NULL,
    last_message_outgoing INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'a_verifier',
    suggested_folder TEXT NOT NULL DEFAULT 'manuel', last_seen_at TEXT NOT NULL, last_followup_at TEXT)"""


def iso(days_ago):
    return (NOW - timedelta(days=days_ago)).isoformat(timespec="seconds")


def insert(conn, peer_id, name, status="a_verifier", days=30, outgoing=1, **extra):
    columns = {"peer_id": peer_id, "display_name": name, "username": None, "last_message_at": iso(days),
               "last_message_outgoing": outgoing, "status": status, "suggested_folder": "manuel",
               "last_seen_at": iso(0), **extra}
    conn.execute(f"INSERT INTO contacts({', '.join(columns)}) VALUES({', '.join('?' for _ in columns)})", list(columns.values()))
    conn.commit()


def row(peer_id):
    conn = cli.db_connect()
    try:
        return conn.execute("SELECT * FROM contacts WHERE peer_id=?", (peer_id,)).fetchone()
    finally:
        conn.close()


def test_the_database_kept_on_the_mac_is_upgraded_without_losing_anything(env):
    conn = sqlite3.connect(cli.DB_PATH)
    conn.execute(OLD_SCHEMA)
    conn.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    conn.execute("INSERT INTO contacts VALUES (1, 'Karim B', 'karimb', ?, 1, 'relance_envoyee', 'attente', ?, ?)", (iso(20), iso(17), iso(17)))
    conn.execute("INSERT INTO meta VALUES ('vip_membership_state', 'unverified')")
    conn.commit()
    conn.close()
    upgraded = cli.db_connect()
    columns = {r[1] for r in upgraded.execute("PRAGMA table_info(contacts)")}
    for name in ("invited_at", "vip_checked_manually_at", "last_snippet", "vip_check", "relevant", "last_incoming_at"):
        assert name in columns
    kept = upgraded.execute("SELECT status, last_followup_at FROM contacts WHERE peer_id=1").fetchone()
    assert kept["status"] == "relance_envoyee" and kept["last_followup_at"] == iso(17)
    assert "contact_events" in {r[0] for r in upgraded.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    upgraded.close()


def build_account(client):
    """Un compte support réaliste : vieux prospects, membres VIP, refus, bot, service Telegram."""
    main_vip = channel(9001, "InvestPro Trading VIP ™", count=427)
    chat_vip = chat(9002, "CHAT VIP - INVESTPRO TRADING", count=2)
    install = channel(9003, "INSTALLATION InvestPro Trading VIP ™️", count=None, megagroup=False)
    other_group = chat(9004, "Famille", count=5)
    client.visible[9001] = [102]                      # 200/427 visibles : liste incomplète
    client.visible[9002] = [103, 999]                 # liste complète du chat VIP
    client.participant[9001] = lambda pid: pid in {104}
    client.list_error[9003] = errors.ChatAdminRequiredError(request=None)

    def install_rule(pid):
        raise errors.ChatAdminRequiredError(request=None)
    client.participant[9003] = install_rule

    def flaky(pid):
        if pid == 107:
            raise errors.ChannelPrivateError(request=None)
        return pid in {104}
    client.participant[9001] = flaky
    for entity in (main_vip, chat_vip, install, other_group):
        client.add(entity, [Msg(False, "annonce", 1)])
    client.add(user(101, "jean-pierre", "Dupont", "jpd"), [Msg(True, "Tu veux que je t’envoie le lien du VIP ?", 400), Msg(False, "je regarde le trading", 401)])
    client.add(user(102, "Amina", username="amina"), [Msg(True, "Bienvenue dans le VIP", 60)])
    client.add(user(103, "Yanis"), [Msg(True, "Le chat VIP est ici", 90)])
    client.add(user(104, "Sofiane"), [Msg(True, "Tu as vu le signal gold ?", 200)])
    client.add(user(105, "Lucas"), [Msg(False, "ok", 50), Msg(True, "Je peux t’expliquer le VIP", 51), Msg(False, "non merci, pas pour moi", 52)])
    client.add(user(106, "Robot", bot=True), [Msg(False, "/start", 10)])
    client.add(user(107, "Nadia"), [Msg(True, "Voici les infos du compte démo", 120)])
    client.add(user(108, "Inès"), [Msg(True, "Coucou, on se voit samedi ?", 3)])
    client.add(user(109, "Marc"), [Msg(False, "merci pour ton aide, bonne soirée", 100), Msg(True, "Avec plaisir", 101)])
    client.add(user(110, "Bilal"), [Msg(False, "je suis intéressé, envoie le lien", 9), Msg(True, "Petite relance pour le VIP", 20)])
    client.add(user(111, "Ancien membre"), [Msg(True, "Ton accès VIP est actif", 300)])
    client.add(user(777000, "Telegram"), [Msg(False, "Code de connexion", 1)])


def test_full_checkup_reads_every_conversation_and_keeps_vip_members_out(env):
    client = env["client"]
    build_account(client)
    conn = cli.db_connect()
    insert(conn, 110, "Bilal", status="relance_envoyee", days=20, last_followup_at=iso(20))
    insert(conn, 111, "Ancien membre", status="actif", days=300)
    conn.close()

    found = asyncio.run(cli.scan(0, None, lambda count, phase: None, interactive=False))

    assert found == 10, "Bot, service Telegram et groupes ne sont jamais des prospects"
    assert row(106) is None and row(777000) is None
    old = row(101)
    assert old["status"] == "a_verifier" and old["vip_check"] == "non_membre" and old["relevant"] == 1
    info = cli.classify_contact(old, False)
    assert info["can_send"] and info["age_bucket"] == "1an" and info["category"] == "froid"
    assert row(102)["status"] == "actif", "visible dans la liste partielle du canal VIP"
    assert row(103)["status"] == "actif" and row(103)["vip_group"] == "CHAT VIP - INVESTPRO TRADING", "le chat VIP écarte aussi"
    assert row(104)["status"] == "actif" and row(104)["vip_check"] == "membre", "trouvé contact par contact"
    assert row(105)["status"] == "pas_interesse", "un refus dans les derniers messages ferme le contact"
    nadia = row(107)
    assert nadia["vip_check"] == "inconnu"
    assert cli.classify_contact(nadia, False)["needs_vip_check"]
    assert "Échange récent" in cli.classify_contact(row(108), False)["exclusion"]
    marc = cli.classify_contact(row(109), False)
    assert marc["can_send"] and marc["warning"] and marc["category"] == "tiede"
    assert row(110)["status"] == "vip_interesse", "sa réponse après la relance le rend chaud"
    assert row(111)["status"] == "actif", "un ancien statut VIP reste protégé"
    assert row(101)["last_snippet"] == "Tu veux que je t’envoie le lien du VIP ?" and row(101)["snippet_outgoing"] == 1
    conn = cli.db_connect()
    issues = json.loads(cli.meta_value(conn, "vip_membership_issues"))
    state = cli.meta_value(conn, "vip_membership_state")
    conn.close()
    assert state == "partial"
    assert not any("INSTALLATION" in issue for issue in issues), "le canal INSTALLATION n’est plus regardé"
    assert any("InvestPro Trading VIP ™ :" in issue and "1 contact" in issue for issue in issues)
    assert set(client.calls_by_channel) == {9001}, "seul InvestPro Trading VIP est interrogé"
    groups = json.loads(cli.meta_value(cli.db_connect(), "vip_membership_groups"))
    assert set(groups) == {"InvestPro Trading VIP ™", "CHAT VIP - INVESTPRO TRADING"}, "jamais INSTALLATION"


def test_a_single_failure_on_the_main_vip_channel_blocks_everyone_until_checked_by_hand(env):
    client = env["client"]
    main_vip = channel(9001, "InvestPro Trading VIP ™", count=427)
    client.add(main_vip, [Msg(False, "annonce", 1)])
    client.list_error[9001] = errors.ChatAdminRequiredError(request=None)

    def refuse(pid):
        raise errors.ChatAdminRequiredError(request=None)
    client.participant[9001] = refuse
    for uid in range(201, 207):
        client.add(user(uid, f"Prospect{uid}"), [Msg(True, "Tu veux voir le VIP ?", 40)])
    asyncio.run(cli.scan(0, None, lambda c, p: None, interactive=False))
    for uid in range(201, 207):
        assert row(uid)["vip_check"] == "inconnu"
        assert not cli.classify_contact(row(uid), False)["can_send"]
    assert client.participant_calls == 3


def test_the_session_is_never_reopened_interactively_from_a_send(env):
    env["client"].authorized = False
    conn = cli.db_connect()
    insert(conn, 301, "Karim", days=40, vip_check="non_membre")
    conn.close()
    with pytest.raises(RuntimeError, match="session Telegram"):
        asyncio.run(cli.send_followup(301, "Salut Karim"))


def ready_contact(peer_id=401, name="Karim Benali", username="karimb", client=None):
    conn = cli.db_connect()
    insert(conn, peer_id, name, username=username, days=150, vip_check="non_membre", relevant=1)
    conn.close()
    if client is not None:
        client.cached.add(peer_id)


@pytest.fixture(autouse=True)
def _cache_ready_contacts(request, monkeypatch):
    """Comme sur le Mac : une conversation analysée est connue de la session Telegram."""
    if "env" not in request.fixturenames:
        return
    env = request.getfixturevalue("env")
    original = ready_contact.__defaults__
    monkeypatch.setattr(globals()["ready_contact"], "__defaults__", original[:3] + (env["client"],))


def test_send_goes_out_from_the_support_account_and_is_recorded(env):
    ready_contact()
    result = asyncio.run(cli.send_followup(401, "  Salut Karim, petit message  "))
    assert env["client"].sent == [(("input", 401), "Salut Karim, petit message")]
    after = row(401)
    assert after["status"] == "reponse_attendue" and after["last_followup_at"]
    assert result["sent_today"] == 1
    conn = cli.db_connect()
    events = conn.execute("SELECT action, detail FROM contact_events WHERE peer_id=401").fetchall()
    conn.close()
    assert events[-1]["action"] == cli.SENT_ACTION
    assert "Salut" not in (events[-1]["detail"] or ""), "le journal ne garde pas le texte envoyé"
    with pytest.raises(cli.SendRefused, match="Déjà relancé"):
        asyncio.run(cli.send_followup(401, "Encore"))
    assert len(env["client"].sent) == 1


@pytest.mark.parametrize("status,extra", [
    ("actif", {}), ("pas_interesse", {}), ("deja_invite", {}),
    ("a_verifier", {"vip_check": "membre"}), ("a_verifier", {"vip_check": "inconnu"}), ("a_verifier", {"vip_check": None}),
])
def test_excluded_contacts_are_refused_before_telegram_is_even_opened(env, status, extra):
    conn = cli.db_connect()
    insert(conn, 501, "Exclu", status=status, days=90, **extra)
    conn.close()
    with pytest.raises(cli.SendRefused):
        asyncio.run(cli.send_followup(501, "Salut"))
    assert env["calls"]["clients"] == 0 and env["client"].sent == []


def test_a_contact_who_blocked_the_account_is_closed(env):
    ready_contact()
    env["client"].send_error = errors.UserIsBlockedError(request=None)
    with pytest.raises(cli.SendFailed, match="bloqué"):
        asyncio.run(cli.send_followup(401, "Salut"))
    assert row(401)["status"] == "pas_interesse"


def test_telegram_spam_protection_stops_the_send_without_touching_the_contact(env):
    ready_contact()
    env["client"].send_error = errors.PeerFloodError(request=None)
    with pytest.raises(cli.SendFailed, match="anti-spam"):
        asyncio.run(cli.send_followup(401, "Salut"))
    assert row(401)["status"] == "a_verifier" and row(401)["last_followup_at"] is None


def test_an_uncached_conversation_is_found_through_the_username(env):
    ready_contact()
    env["client"].cached.discard(401)
    env["client"].usernames["karimb"] = 401
    asyncio.run(cli.send_followup(401, "Salut"))
    assert env["client"].sent[0][0] == ("input", 401)


def test_an_unknown_conversation_gets_a_clear_message(env):
    ready_contact(username=None)
    env["client"].cached.discard(401)
    with pytest.raises(cli.SendFailed, match="ne retrouve pas cette conversation"):
        asyncio.run(cli.send_followup(401, "Salut"))
    assert row(401)["status"] == "a_verifier"


def test_daily_safety_limit(env, monkeypatch):
    ready_contact()
    monkeypatch.setattr(cli, "DAILY_SEND_LIMIT", 2)
    conn = cli.db_connect()
    for _ in range(2):
        cli.log_event(conn, 999, cli.SENT_ACTION, "x")
    conn.commit()
    conn.close()
    with pytest.raises(cli.SendRefused, match="Limite de 2"):
        asyncio.run(cli.send_followup(401, "Salut"))


def test_empty_or_oversized_messages_are_refused(env):
    ready_contact()
    for text in ("   ", "x" * 4001):
        with pytest.raises(cli.SendRefused):
            asyncio.run(cli.send_followup(401, text))


def draft_row(name, status="a_verifier", outgoing=1, days=120):
    return {"display_name": name, "status": status, "last_message_outgoing": outgoing, "last_message_at": iso(days),
            "username": None, "vip_check": "non_membre"}


def test_each_category_gets_a_message_that_pushes_to_join_through_whatsapp():
    now = datetime(2026, 11, 22, tzinfo=timezone.utc)
    cold = cli.build_draft(draft_row("JEAN-PIERRE Dupont"), now=now)
    assert cold.startswith("Salut Jean-Pierre, j’espère que tu vas bien !")
    # Les froids : court, la nouvelle infrastructure, WhatsApp puis un appel ; ni broker, ni dépôt, ni offre.
    for words in ("nouvelle infrastructure", "les signaux et mes analyses", "le journal de trading", "le copy", "https://investprotrading.fr/whatsapp", "petit appel"):
        assert words in cold, words
    assert cold.index("WhatsApp") < cold.index("petit appel")
    for words in ("broker", "dépôt", "abonnement", "-25", "gratuit"):
        assert words not in cold, words
    assert cold.endswith("je ne te relancerai plus.")
    warm = cli.build_draft(draft_row("Sarah", outgoing=0), now=now)
    assert warm.startswith("Salut Sarah, désolé pour le retour tardif !") and "rejoindre le VIP" in warm
    hot = cli.build_draft(draft_row("Karim", status="infos_broker_demandees"), now=now)
    assert hot.startswith("Salut Karim ! 👋") and "lien du broker" in hot and "Écris-moi sur WhatsApp : https://investprotrading.fr/whatsapp" in hot and "Ou réponds-moi directement ici" in hot
    assert "nouvelle infrastructure : les signaux, le copy, le journal de trading et plein d’autres choses" in hot
    assert "c’est le bon moment. On s’en occupe ensemble :" in hot and "je t’ai ouvert un WhatsApp" not in hot
    abo = cli.build_draft(draft_row("Lina", status="a_verifier") | {"join_hint": "abonnement"}, now=now)
    assert abo.startswith("Salut Lina, ça fait un moment !")
    assert "l’abonnement est à -25 %, jusqu’au 30 novembre" in abo and "le VIP est gratuit" in abo
    december = datetime(2026, 12, 1, 9, tzinfo=timezone.utc)
    later = cli.build_draft(draft_row("Lina", status="a_verifier", days=130) | {"join_hint": "abonnement"}, now=december)
    assert later.startswith("Salut Lina, ça fait un moment !") and "-25" not in later and "le VIP est gratuit" in later, "l’offre s’arrête le 30 novembre"
    for text in (warm, hot, abo):
        assert "Si besoin, on peut aussi se faire un petit appel pour en parler." in text and "minutes" not in text.split("petit appel")[1]
    for text in (cold, warm, hot, abo, later):
        assert "risque de perte" not in text, "pas de mention de risque dans les relances"
        assert "essai" not in text and "démo" not in text, "on pousse à rejoindre, pas à tester"
    assert hot.endswith("pour en parler.")
    # Le bonus de 100 % s’ajoute au dépôt, avec un exemple chiffré ; pas chez les froids (message court, sans offre).
    for text in (warm, hot, abo, later):
        assert "bonus de 100\u00a0% en plus de ton dépôt" in text and "si tu déposes 500\u00a0$" in text and "tu trades avec 1\u00a0000\u00a0$" in text
    for text in (warm, hot):
        assert text.index("bonus de 100") < text.index("Sinon, il y a aussi l’abonnement.") < text.index("petit appel")
    assert "bonus" not in cold
    # Les chauds et les froids sont invités sur la page du VIP ; le lien du site passe avant WhatsApp, pour l’aperçu Telegram.
    for text in (hot, cold):
        assert "https://investprotrading.fr/vip" in text
        assert text.index("investprotrading.fr/vip") < text.index("investprotrading.fr/whatsapp")
    for text in (warm, abo):
        assert "investprotrading.fr/vip" not in text
    assert cli.build_draft(draft_row("Telegram 12345")).startswith("Salut, j’espère")
    assert cli.first_name_from("🔥karim 95") == "Karim"
    assert cli.first_name_from("M.") is None
    assert cli.first_name_from("La Fouine") is None and cli.first_name_from("Trader Karim") is None
    assert cli.first_name_from("Lamine K") == "Lamine"
    assert cli.first_name_from("Sarah_fx") == "Sarah" and cli.first_name_from("karim.95") == "Karim" and cli.first_name_from("__Inès__") == "Inès"
    assert cli.DAILY_SEND_LIMIT == 100


def test_people_known_on_the_site_are_not_followed_up_by_mistake(env):
    import hashlib
    def h(name):
        return hashlib.sha256(name.encode()).hexdigest()
    (env["data"] / "site-checks.json").write_text(json.dumps({"handles": {
        h("enattente"): ["acces_pending"], h("essaiuser"): ["essai_new"], h("membresite"): ["acces_approved"], h("refuse"): ["acces_denied"],
    }}))
    conn = cli.db_connect()
    for peer, username in ((701, "EnAttente"), (702, "@essaiuser"), (703, "membresite"), (704, "refuse"), (705, "inconnu")):
        insert(conn, peer, f"Contact {peer}", username=username, days=60, vip_check="non_membre", relevant=1)
    conn.close()
    pending, trial, member, refused, other = (cli.classify_contact(row(p), False) for p in (701, 702, 703, 704, 705))
    assert not pending["can_send"] and "en attente sur le site" in pending["exclusion"]
    assert not trial["can_send"] and "essai VIP sur le site" in trial["exclusion"]
    assert member["category"] == "vip" and not member["can_send"]
    assert refused["can_send"] and "refusée sur le site" in refused["warning"]
    assert other["can_send"] and other["warning"] is None


def test_vip_rules_in_classification(env):
    conn = cli.db_connect()
    insert(conn, 601, "Legacy", days=90)
    insert(conn, 602, "Manuel", days=90, vip_checked_manually_at=iso(1))
    conn.close()
    assert cli.classify_contact(row(601), True)["can_send"], "ancienne vérification globale encore valable"
    assert cli.classify_contact(row(601), False)["needs_vip_check"]
    assert cli.classify_contact(row(602), False)["can_send"]


def test_age_buckets():
    assert [cli.age_bucket(d) for d in (0, 89, 90, 179, 180, 364, 365, 2000)] == ["recent", "recent", "3m", "3m", "6m", "6m", "1an", "1an"]


@pytest.fixture
def server(env):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), dashboard.DashboardHandler)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    yield srv
    srv.shutdown()
    srv.server_close()


def call(srv, path, body=None, origin=None, host=None):
    url = f"http://127.0.0.1:{srv.server_port}{path}"
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="GET" if body is None else "POST")
    req.add_header("Host", host or f"127.0.0.1:{srv.server_port}")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if origin:
        req.add_header("Origin", origin)
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read() or b"{}"), dict(res.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}"), dict(exc.headers)


def test_platform_send_endpoint(server, env):
    ready_contact(401)
    ready_contact(402, "Sarah", "sarah")
    status, body, headers = call(server, "/api/contacts/401/send", {"text": "Salut Karim"}, origin="https://investprotrading.fr")
    assert status == 200 and body["sent_today"] == 1
    assert headers.get("Access-Control-Allow-Origin") == "https://investprotrading.fr"
    status, body, _ = call(server, "/api/contacts/402/send", {"text": "Salut Sarah"})
    assert status == 429, "pas deux envois en moins de 3 secondes"
    dashboard.SEND_STATE["last_at"] = 0.0
    status, body, _ = call(server, "/api/contacts/402/send", {"text": "Salut Sarah"}, origin="https://evil.example")
    assert status == 403
    status, body, _ = call(server, "/api/contacts/402/send", {"text": "Salut Sarah"}, host="evil.example:8765")
    assert status == 403
    assert dashboard.TELEGRAM_LOCK.acquire(blocking=False)
    try:
        status, body, _ = call(server, "/api/contacts/402/send", {"text": "Salut Sarah"})
        assert status == 409 and "en cours" in body["error"]
    finally:
        dashboard.TELEGRAM_LOCK.release()
    status, body, _ = call(server, "/api/contacts/401/send", {"text": "Encore"})
    assert status == 409 and "Déjà relancé" in body["error"]
    assert [text for _, text in env["client"].sent] == ["Salut Karim"]


def test_platform_overview_and_detail(server, env):
    ready_contact(401)
    conn = cli.db_connect()
    insert(conn, 403, "Membre", status="actif", days=500, vip_check="membre", vip_group="InvestPro Trading VIP ™")
    conn.execute("UPDATE contacts SET last_snippet='Tu veux le lien ?', snippet_outgoing=1 WHERE peer_id=401")
    conn.commit()
    conn.close()
    status, body, _ = call(server, "/api/agent/overview")
    assert status == 200 and body["agent_version"] == "2"
    assert body["ready"] == 1 and body["categories"]["vip"] == 1
    assert set(body["categories"]) == {"chaud", "abonne", "tiede", "froid", "vip", "invite", "stop"}
    assert body["age_buckets"]["3m"] == 1 and body["age_buckets"]["1an"] == 1 and body["ready_age_buckets"]["3m"] == 1
    karim = next(c for c in body["contacts"] if c["peer_id"] == 401)
    assert karim["can_send"] and karim["snippet"] == "Tu veux le lien ?" and karim["snippet_outgoing"] is True
    status, detail, _ = call(server, "/api/agent/contacts/401")
    assert detail["draft"].startswith("Salut Karim")
    status, detail, _ = call(server, "/api/agent/contacts/403")
    assert detail["draft"] is None and detail["contact"]["exclusion"] == "Déjà membre VIP"
    status, page, _ = 200, None, None
    req = urllib.request.Request(f"http://127.0.0.1:{server.server_port}/")
    with urllib.request.urlopen(req) as res:
        html = res.read().decode()
    assert "Agent de relance · InvestPro Support" in html and "/api/contacts/${id}/send" in html


def test_scan_cannot_start_while_a_send_holds_telegram(server, env):
    (env["data"] / "telegram_api.json").write_text("{}")
    (env["data"] / "support_account.session").write_text("")
    assert dashboard.TELEGRAM_LOCK.acquire(blocking=False)
    try:
        status, body, _ = call(server, "/api/scan", {})
        assert status == 409
    finally:
        dashboard.TELEGRAM_LOCK.release()


def test_launching_the_agent_starts_an_analysis_when_the_last_one_is_old(env):
    (env["data"] / "telegram_api.json").write_text("{}")
    (env["data"] / "support_account.session").write_text("")
    assert dashboard.auto_scan_due(), "jamais analysé"
    conn = cli.db_connect()
    cli.set_meta(conn, {"last_scan_at": iso(0)})
    conn.commit()
    conn.close()
    assert dashboard.auto_scan_due(), "analyse faite avec d’anciennes règles : on refait tout"
    conn = cli.db_connect()
    cli.set_meta(conn, {"scan_version": cli.SCAN_VERSION})
    conn.commit()
    conn.close()
    assert not dashboard.auto_scan_due(), "analyse récente : pas de nouvelle analyse au lancement"
    assert dashboard.auto_scan_due(NOW + timedelta(hours=13))


def test_the_background_analysis_runs_and_frees_telegram_for_sending(env):
    env["client"].add(user(801, "Prospect", username="prospect"), [Msg(True, "Tu veux voir le VIP ?", 40)])
    assert dashboard.start_scan_thread()
    for _ in range(100):
        if not dashboard.SCAN_STATE["running"]:
            break
        threading.Event().wait(0.05)
    assert not dashboard.SCAN_STATE["running"] and dashboard.SCAN_STATE["error"] is None
    assert dashboard.TELEGRAM_LOCK.acquire(blocking=False)
    dashboard.TELEGRAM_LOCK.release()
    assert row(801)["vip_check"] == "inconnu", "aucun groupe VIP sur ce faux compte : contrôle manuel exigé"


def test_only_the_investpro_trading_vip_group_is_the_reference():
    assert cli.is_reference_vip("InvestPro Trading VIP ™")
    assert cli.is_reference_vip("INVESTPRO TRADING VIP")
    assert not cli.is_reference_vip("INSTALLATION InvestPro Trading VIP ™️")
    assert not cli.is_reference_vip("CHAT VIP - INVESTPRO TRADING")
    assert not cli.is_reference_vip("Chat ~ VIP InvestPro")
    assert not cli.is_reference_vip("Trading VIP gratuit")


def test_without_the_vip_group_nobody_can_be_sent_to(env):
    env["client"].add(chat(9002, "CHAT VIP - INVESTPRO TRADING", count=2), [Msg(False, "annonce", 1)])
    env["client"].visible[9002] = [902]
    env["client"].add(user(901, "Prospect"), [Msg(True, "Tu veux voir le VIP ?", 40)])
    asyncio.run(cli.scan(0, None, lambda c, p: None, interactive=False))
    assert row(901)["vip_check"] == "inconnu"
    conn = cli.db_connect()
    issues = json.loads(cli.meta_value(conn, "vip_membership_issues"))
    conn.close()
    assert any("introuvable" in issue for issue in issues)


def test_launch_opens_the_admin_tab_in_chrome_and_falls_back_to_the_local_page(monkeypatch):
    opened = []
    monkeypatch.setattr(dashboard.sys, "platform", "darwin")
    monkeypatch.setattr(dashboard.webbrowser, "open", lambda url: opened.append(("navigateur", url)))

    class Done:
        def __init__(self, code): self.returncode = code
    monkeypatch.setattr(dashboard.subprocess, "run", lambda cmd, **kw: opened.append(tuple(cmd)) or Done(0))
    assert dashboard.open_platform("http://127.0.0.1:8765") == "https://investprotrading.fr/dashboard/admin?tool=telegram&view=agent"
    assert opened == [("open", "-a", "Google Chrome", "https://investprotrading.fr/dashboard/admin?tool=telegram&view=agent")]
    opened.clear()
    monkeypatch.setattr(dashboard.subprocess, "run", lambda cmd, **kw: opened.append(tuple(cmd)) or Done(0 if cmd[2] == "Brave Browser" else 1))
    assert dashboard.open_platform("http://127.0.0.1:8765").startswith("https://investprotrading.fr/dashboard/admin")
    assert opened[-1][:3] == ("open", "-a", "Brave Browser"), "sans Chrome, Brave prend le relais"
    opened.clear()
    monkeypatch.setattr(dashboard.subprocess, "run", lambda cmd, **kw: Done(1))
    assert dashboard.open_platform("http://127.0.0.1:8765") == "http://127.0.0.1:8765"
    assert opened == [("navigateur", "http://127.0.0.1:8765")]


def test_vip_chat_titles_are_extra_safety_only():
    assert cli.is_vip_chat("CHAT VIP - INVESTPRO TRADING") and cli.is_vip_chat("Chat ~ VIP InvestPro")
    assert not cli.is_vip_chat("INSTALLATION InvestPro Trading VIP ™️") and not cli.is_vip_chat("InvestPro Trading VIP ™")


def test_subscription_or_affiliation_is_read_from_the_conversation():
    assert cli.join_hint_of("Merci pour ton paiement, ton abonnement est activé") == "abonnement"
    assert cli.join_hint_of("Ton abonnement a expiré hier, tu veux renouveler ?") == "abonnement"
    assert cli.join_hint_of("C’est bon, ton compte est rattaché avec mon lien") == "affiliation"
    assert cli.join_hint_of("C’est combien l’abonnement par mois ?") is None, "demander le prix ne fait pas un ancien abonné"
    assert cli.join_hint_of("ton abonnement expire, sinon passe par l’affiliation") == "mixte"


def test_former_subscribers_get_their_own_category_and_message(env):
    client = env["client"]
    main_vip = channel(9001, "InvestPro Trading VIP ™", count=2)
    client.add(main_vip, [Msg(False, "annonce", 1)])
    client.visible[9001] = [1002, 999]
    old_sub = [Msg(True, "Tu veux revenir ?", 60)] + [Msg(False, "ok", 61 + i) for i in range(20)] + [Msg(True, "Merci pour ton paiement, ton abonnement est activé", 200)]
    client.add(user(1001, "Thomas"), old_sub)
    client.add(user(1002, "Lina"), [Msg(True, "Ton compte est bien rattaché, bienvenue", 30)])
    asyncio.run(cli.scan(0, None, lambda c, p: None, interactive=False))
    thomas = cli.classify_contact(row(1001), False)
    assert thomas["category"] == "abonne" and thomas["can_send"], "le paiement est 22 messages plus haut : lu quand même"
    assert cli.build_draft(row(1001)).startswith("Salut Thomas, ça fait un moment !")
    assert "rejoindre sans abonnement" in cli.build_draft(row(1001)) and "essai" not in cli.build_draft(row(1001))
    lina = cli.classify_contact(row(1002), False)
    assert lina["category"] == "vip" and "Venu par affiliation" in lina["reason"]
