import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "libs"))
sys.path.insert(0, str(ROOT / "pkg" / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from telegram_followup import cli, dashboard  # noqa: E402
from fake_telegram import FakeClient  # noqa: E402


@pytest.fixture
def env(tmp_path, monkeypatch):
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setattr(cli, "DB_PATH", data / "followups.sqlite3")
    monkeypatch.setattr(cli, "SESSION_PATH", data / "support_account")
    monkeypatch.setattr(cli, "CONFIG_PATH", data / "telegram_api.json")
    monkeypatch.setattr(cli, "SITE_CHECKS_PATH", data / "site-checks.json")
    cli._SITE_CACHE.update(mtime=None, path=None, handles={})
    monkeypatch.setattr(dashboard, "SESSION_PATH", data / "support_account")
    monkeypatch.setattr(dashboard, "CONFIG_PATH", data / "telegram_api.json")
    client = FakeClient()
    calls = {"clients": 0}

    def make_client():
        calls["clients"] += 1
        return client

    monkeypatch.setattr(cli, "telegram_client", make_client)
    dashboard.SCAN_STATE.update(running=False, error=None, processed=0, phase=None)
    dashboard.SEND_STATE.update(running=False, last_at=0.0)
    return {"client": client, "calls": calls, "data": data}
