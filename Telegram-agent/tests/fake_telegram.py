"""Faux client Telegram pour tester l’agent sans réseau, avec les vrais types Telethon 1.45."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from telethon import errors
from telethon.tl.functions.channels import GetParticipantRequest
from telethon.tl.types import Channel, Chat, ChatPhotoEmpty, User

NOW = datetime.now(timezone.utc)


def user(uid, first, last=None, username=None, **flags):
    return User(id=uid, first_name=first, last_name=last, username=username, **flags)


def channel(cid, title, count=None, megagroup=True):
    return Channel(id=cid, title=title, photo=ChatPhotoEmpty(), date=NOW, participants_count=count, megagroup=megagroup)


def chat(cid, title, count):
    return Chat(id=cid, title=title, photo=ChatPhotoEmpty(), participants_count=count, date=NOW, version=1)


class Msg:
    def __init__(self, out, text, days_ago, media=None):
        self.out = out
        self.message = text
        self.date = NOW - timedelta(days=days_ago)
        self.media = media


class Dialog:
    def __init__(self, entity, message):
        self.entity = entity
        self.message = message


class FakeClient:
    def __init__(self):
        self.authorized = True
        self.dialogs = []          # [(entity, [Msg newest first])]
        self.visible = {}          # group id -> ids listed by iter_participants
        self.list_error = {}       # group id -> exception raised by iter_participants
        self.participant = {}      # group id -> callable(peer_id) -> True/False or raises
        self.cached = set()        # peer ids resolvable without username
        self.usernames = {}        # username -> peer id
        self.send_error = None
        self.sent = []
        self.participant_calls = 0
        self.calls_by_channel = {}
        self.connected = False
        self.flood_sleep_threshold = 60

    def add(self, entity, messages):
        self.dialogs.append((entity, messages))
        if isinstance(entity, User):
            self.cached.add(entity.id)
            if entity.username:
                self.usernames[entity.username] = entity.id

    async def connect(self):
        self.connected = True

    async def start(self):
        self.connected = True

    async def is_user_authorized(self):
        return self.authorized

    async def disconnect(self):
        self.connected = False

    async def iter_dialogs(self):
        for entity, messages in self.dialogs:
            yield Dialog(entity, messages[0] if messages else None)

    async def iter_messages(self, entity, limit=8):
        for candidate, messages in self.dialogs:
            if candidate.id == entity.id:
                for message in messages[:limit]:
                    yield message

    async def iter_participants(self, entity):
        if entity.id in self.list_error:
            raise self.list_error[entity.id]
        for pid in self.visible.get(entity.id, []):
            yield user(pid, "x")

    async def __call__(self, request):
        if isinstance(request, GetParticipantRequest):
            self.participant_calls += 1
            self.calls_by_channel[request.channel.id] = self.calls_by_channel.get(request.channel.id, 0) + 1
            pid = request.participant.id if hasattr(request.participant, "id") else request.participant
            rule = self.participant.get(request.channel.id)
            if rule is None or not rule(pid):
                raise errors.UserNotParticipantError(request=None)
            return object()
        raise AssertionError(f"Requête inattendue : {type(request).__name__}")

    async def get_input_entity(self, peer):
        if isinstance(peer, str):
            if peer in self.usernames:
                return ("input", self.usernames[peer])
            raise ValueError("unknown username")
        if peer in self.cached:
            return ("input", peer)
        raise ValueError("Could not find the input entity")

    async def send_message(self, entity, text):
        if self.send_error is not None:
            raise self.send_error
        self.sent.append((entity, text))
