"""D15 tests: the MT5 ticket queue survives undeletable or unreadable tickets, and the launcher restarts a
connector whose MT5 queue stays blocked. Run with: python3 -m unittest test_d15 (works on Linux and Windows)."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


q15 = load('q15', HERE / 'mt5_ticket_queue.py')
w = load('w15', HERE / 'run_host_background.py')


def ticket(directory, name, pid, created=1.0):
    path = Path(directory) / name
    path.write_text(json.dumps({'pid': pid, 'created': created}))
    return path


class TicketQueueTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def queue(self, alive=lambda pid, created: True):
        return q15.TicketQueue(self.dir, alive=alive)

    def test_fifo_order_is_kept(self):
        ticket(self.dir, '00000000000000000000-11-x.json', 11)  # another live process, ahead of us
        a = self.queue().enter()
        ticket(self.dir, '99999999999999999999-22-y.json', 22)  # another one, behind us
        self.assertFalse(a.turn(1))
        self.assertTrue(a.turn(2))
        a.close()
        self.assertEqual(sorted(p.name for p in self.dir.glob('*.json')),
                         ['00000000000000000000-11-x.json', '99999999999999999999-22-y.json'])

    def test_dead_owner_ticket_is_removed(self):
        dead = ticket(self.dir, '00000000000000000001-4242-z.json', 4242)
        a = self.queue(alive=lambda pid, created: pid != 4242).enter()
        self.assertTrue(a.turn(1))
        self.assertFalse(dead.exists())

    def test_own_leftover_ticket_no_longer_blocks_the_queue(self):
        # 15/11 20:44: an undeletable ticket of a live process sat at the head of the queue for good.
        leftover = ticket(self.dir, '00000000000000000001-%d-old.json' % os.getpid(), os.getpid())
        other = ticket(self.dir, '00000000000000000002-777-b.json', 777)
        a = self.queue().enter()
        self.assertFalse(a.turn(1))      # the other live process is ahead...
        self.assertFalse(leftover.exists())  # ...but our own leftover is gone
        other.unlink()
        self.assertTrue(a.turn(1))

    def test_close_survives_a_ticket_held_open_and_turn_cleans_it_later(self):
        a = self.queue().enter()
        first = a.ticket
        real_unlink = Path.unlink
        def busy(self, missing_ok=False):
            if self == first:
                raise PermissionError(13, 'used by another process')
            return real_unlink(self, missing_ok=missing_ok)
        with mock.patch.object(q15, 'PAUSE', 0), mock.patch.object(Path, 'unlink', busy):
            a.close()  # no exception any more
        self.assertIsNone(a.ticket)
        self.assertTrue(first.exists())
        a.enter()
        self.assertTrue(a.turn(1))
        self.assertFalse(first.exists())

    def test_unreadable_ticket_is_skipped_for_one_round(self):
        a = self.queue().enter()
        ahead = ticket(self.dir, '00000000000000000000-555-c.json', 555)
        real_read = Path.read_text
        def busy(self, *args, **kwargs):
            if self == ahead:
                raise PermissionError(13, 'used by another process')
            return real_read(self, *args, **kwargs)
        with mock.patch.object(Path, 'read_text', busy):
            self.assertTrue(a.turn(1))  # no crash (was child:676 PermissionError)
        self.assertFalse(a.turn(1))     # readable again: the older ticket goes first

    def test_half_written_ticket_is_skipped(self):
        (self.dir / '00000000000000000000-1-bad.json').write_text('{"pid": 1')
        a = self.queue().enter()
        self.assertTrue(a.turn(1))

    def test_rename_is_retried(self):
        real = os.replace
        calls = []
        def flaky(src, dst):
            calls.append(1)
            if len(calls) < 3:
                raise PermissionError(13, 'scanned')
            return real(src, dst)
        with mock.patch.object(q15, 'PAUSE', 0), mock.patch.object(q15.os, 'replace', flaky):
            a = self.queue().enter()
        self.assertTrue(a.ticket.exists())
        self.assertEqual(len(calls), 3)


class WatchdogTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def test_stuck_tickets_counts_only_old_tickets_of_live_processes(self):
        now = time.time()
        old_live = ticket(self.dir, 'a.json', 1)
        old_dead = ticket(self.dir, 'b.json', 2)
        recent = ticket(self.dir, 'c.json', 3)
        (self.dir / 'd.json').write_text('not json')
        for path in (old_live, old_dead, self.dir / 'd.json'):
            os.utime(path, (now - 3600, now - 3600))
        alive = lambda pid, created: pid in (1, 3)
        self.assertEqual(w.stuck_tickets(self.dir, now, alive), 1)
        self.assertEqual(w.stuck_tickets(self.dir / 'missing', now, alive), 0)

    def test_owner_check_matches_the_process_start_time(self):
        import psutil
        me = psutil.Process(os.getpid())
        self.assertTrue(w.ticket_owner_alive(os.getpid(), me.create_time()))
        self.assertFalse(w.ticket_owner_alive(os.getpid(), me.create_time() - 100))
        self.assertFalse(w.ticket_owner_alive(2 ** 22 + 12345, 1.0))

    def run_with(self, script, watch, **constants):
        host = self.dir / 'host.py'
        host.write_text(script)
        lines = []
        values = dict(HOST=host, BASE=self.dir, LOG=self.dir / 'log.txt', GRACE=0, WATCH_EVERY=.2, STOP_WAIT=1,
                      WATCH_GAP=3600, last_watchdog=None)
        values.update(constants)
        with mock.patch.multiple(w, **values), mock.patch.object(w, 'say', lines.append), \
             mock.patch.object(w, 'cleanup', lambda: None):
            started = time.monotonic()
            code = w.run_connector(dict(os.environ), watch=watch)
            return code, time.monotonic() - started, lines

    def test_a_connector_that_stops_by_itself_is_just_waited_for(self):
        code, took, lines = self.run_with('import sys; sys.exit(3)', watch=lambda: 0)
        self.assertEqual(code, 3)
        self.assertEqual(lines, [])

    def test_a_blocked_mt5_queue_stops_the_connector(self):
        code, took, lines = self.run_with('import time; time.sleep(60)', watch=lambda: 4)
        self.assertLess(took, 10)
        self.assertNotEqual(code, 0)
        self.assertTrue(lines and 'file MT5 bloquee : 4 compte(s)' in lines[0], lines)

    def test_no_watchdog_during_the_grace_period_or_right_after_a_restart(self):
        code, took, lines = self.run_with('import time; time.sleep(1.5)', watch=lambda: 4, GRACE=3600)
        self.assertEqual((code, lines), (0, []))
        code, took, lines = self.run_with('import time; time.sleep(1.5)', watch=lambda: 4,
                                          last_watchdog=time.monotonic())
        self.assertEqual((code, lines), (0, []))

    def test_d14_helpers_unchanged(self):
        host = '/x/WINDOWS/host.py'
        self.assertTrue(w.connector_process(['/venv/python.exe', '-u', host, 'run'], host))
        self.assertFalse(w.connector_process(['/venv/python.exe', '/x/WINDOWS/run_host_background.py'], host))
        self.assertEqual(w.next_delay(600, 3600), 60)
        self.assertEqual(w.next_delay(60, 10), 120)


if __name__ == '__main__':
    unittest.main(verbosity=2)
