"""FIFO admission for isolated MT5 snapshots; contains no account data.

D15 (21/11/2026): a ticket that close() could not delete (file held open for an instant by another child
reading the queue, WinError 32) kept its place at the head of the queue while its process lived, and once
enough of them piled up no MT5 account got a turn again (15/11 20:44 to 21/11). Renaming and deleting are
now retried, a ticket that cannot be read is skipped for one round, and each process removes its own
leftover tickets.
"""
import json
import os
from pathlib import Path
import time
import uuid

RETRIES, PAUSE = 10, .2


def _retry(action):
    for attempt in range(RETRIES):
        try:
            return action()
        except PermissionError:
            if attempt == RETRIES - 1:
                raise
            time.sleep(PAUSE)


class TicketQueue:
    def __init__(self, directory, alive=None):
        self.directory = Path(directory)
        self.ticket = None
        self.alive = alive or self._alive

    @staticmethod
    def _alive(pid, created):
        import psutil
        try:
            return abs(psutil.Process(pid).create_time() - created) < .01
        except psutil.NoSuchProcess:
            return False
        except psutil.AccessDenied:
            return True

    def enter(self):
        import psutil
        self.directory.mkdir(parents=True, exist_ok=True)
        pid = os.getpid()
        name = f'{time.monotonic_ns():020d}-{pid}-{uuid.uuid4().hex}.json'
        temporary = self.directory / (name + '.tmp')
        temporary.write_text(json.dumps({'pid': pid, 'created': psutil.Process(pid).create_time()}))
        ticket = self.directory / name
        _retry(lambda: os.replace(temporary, ticket))
        self.ticket = ticket
        return self

    def turn(self, limit):
        if self.ticket is None:
            raise RuntimeError('queue ticket missing')
        waiting = []
        pid = os.getpid()
        for path in self.directory.glob('*.json'):
            try:
                record = json.loads(path.read_text())
                if not self.alive(record['pid'], record['created']):
                    path.unlink(missing_ok=True)
                    continue
                if record['pid'] == pid and path.name != self.ticket.name:
                    # An earlier ticket of this process that close() could not delete.
                    path.unlink(missing_ok=True)
                    continue
                waiting.append(path.name)
            except (FileNotFoundError, PermissionError, ValueError, KeyError, TypeError):
                # Gone, held open by another process this instant, or unreadable: looked at again next round.
                continue
        return self.ticket.name in sorted(waiting)[:limit]

    def close(self):
        if self.ticket is not None:
            ticket, self.ticket = self.ticket, None
            try:
                _retry(lambda: ticket.unlink(missing_ok=True))
            except PermissionError:
                pass  # turn() of this process deletes it on its next round (same pid, other name).
