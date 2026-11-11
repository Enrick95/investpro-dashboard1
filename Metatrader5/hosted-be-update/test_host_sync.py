"""Offline tests of the lighter MT5 cycle (D11): no MT terminal, broker, login, real files or network.

Each MT5 account keeps its link to the terminal open, re-reads its whole history only when the account changed (new
deal, balance) or every 15 minutes, and only new or changed trades are sent to the site.
"""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import mt5_exit_evidence as evidence


BASE = Path(__file__).resolve().parent


def load_host():
    spec = importlib.util.spec_from_file_location('host_sync_under_test', BASE/'host.py')
    host = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(host)
    return host


def deal(ticket, entry, price, *, position=100, profit=0.0, kind=None):
    return dict(ticket=ticket, position_id=position, type=(0 if entry == 0 else 1) if kind is None else kind,
                entry=entry, price=price, volume=1.0, symbol='XAUUSD', reason=0, time_msc=ticket*1000, time=ticket,
                profit=profit, commission=-1.0, swap=0.0, fee=-0.5)


class FakeMt5:
    """The few MetaTrader5 calls the connector makes, on synthetic data."""
    def __init__(self, deals, balance=1000.0, currency='USD'):
        self.deals = list(deals)
        self.account = SimpleNamespace(login=10001, server='Synthetic-Server', currency=currency, balance=balance,
                                       equity=balance+12.5, trade_allowed=False)
        self.terminal = SimpleNamespace(connected=True, data_path=str(BASE))
        self.initialize = Mock(return_value=True)
        self.shutdown = Mock()
        self.history_reads = 0

    def account_info(self):
        return self.account

    def terminal_info(self):
        return self.terminal

    def history_deals_total(self, start, end):
        return len(self.deals)

    def history_deals_get(self, start, end):
        self.history_reads += 1
        return [SimpleNamespace(_asdict=lambda d=d: d) for d in self.deals]

    def positions_get(self):
        return []

    def symbol_info(self, symbol):
        return SimpleNamespace(point=0.01, trade_tick_size=0.01)

    def last_error(self):
        return (1, 'Success')


JOB = dict(investpro_mt_connections=dict(login='10001', server='Synthetic-Server', currency='USD', platform='MT5'),
           password='synthetic-test-password')


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class Mt5SyncTest(unittest.TestCase):
    def setUp(self):
        self.host = load_host()
        self.quiet = patch.object(self.host, 'diagnostic')
        self.quiet.start()
        self.no_export = patch.object(evidence, 'read_export', return_value=None)
        self.no_export.start()
        self.addCleanup(self.quiet.stop)
        self.addCleanup(self.no_export.stop)
        self.clock = Clock()
        self.mt5 = FakeMt5([deal(10, 0, 2000), deal(20, 1, 2001, profit=8.0)])
        self.sync = self.host.Mt5Sync(self.mt5, JOB, BASE, clock=self.clock)

    def test_first_cycle_reads_everything_then_only_balance_and_equity(self):
        first, complete = self.sync.snapshot()
        self.assertTrue(complete)
        self.assertEqual(len(first['trades']), 1)
        self.assertIn('funding', first)
        light, complete = self.sync.snapshot()
        self.assertFalse(complete)
        self.assertEqual(light['trades'], [])
        self.assertNotIn('funding', light, 'The site keeps its funding summary from the last complete read')
        self.assertEqual((light['balance'], light['equity']), (1000.0, 1012.5))
        self.assertEqual(light['warnings'], first['warnings'])
        self.assertEqual(self.mt5.initialize.call_count, 1, 'One login for the link, not one per cycle')
        self.assertEqual(self.mt5.history_reads, 1, 'The whole history is not re-read when nothing changed')
        self.mt5.shutdown.assert_not_called()

    def test_a_new_deal_or_a_balance_change_reads_the_history_again_without_a_new_login(self):
        self.sync.snapshot()
        self.mt5.deals += [deal(30, 0, 2010, position=101), deal(40, 1, 2005, position=101, profit=-5.0)]
        self.mt5.account.balance = 1003.0
        snapshot, complete = self.sync.snapshot()
        self.assertTrue(complete)
        self.assertEqual(len(snapshot['trades']), 2)
        self.assertEqual(self.mt5.history_reads, 2)
        self.mt5.account.balance = 1103.0  # e.g. a deposit the deal count missed
        self.assertTrue(self.sync.snapshot()[1])
        self.assertEqual(self.mt5.initialize.call_count, 1)

    def test_the_whole_history_is_still_reread_every_15_minutes(self):
        self.sync.snapshot()
        self.clock.now += 899
        self.assertFalse(self.sync.snapshot()[1])
        self.clock.now += 1
        self.assertTrue(self.sync.snapshot()[1])
        self.assertEqual(self.mt5.history_reads, 2)

    def test_a_closed_link_logs_in_again_on_the_next_cycle(self):
        self.sync.snapshot()
        self.sync.close()
        self.sync.close()
        self.assertEqual(self.mt5.shutdown.call_count, 1)
        self.sync.snapshot()
        self.assertEqual(self.mt5.initialize.call_count, 2)

    def test_identity_and_permission_checks_still_run_on_every_light_cycle(self):
        self.sync.snapshot()
        self.mt5.account.trade_allowed = True
        with self.assertRaises(RuntimeError):
            self.sync.snapshot()
        self.mt5.account.trade_allowed = False
        self.mt5.terminal.connected = False
        with self.assertRaises(RuntimeError):
            self.sync.snapshot()

    def test_a_cent_account_light_snapshot_is_converted_like_the_complete_one(self):
        self.mt5.account.currency = 'USC'
        self.mt5.account.balance = 100000.0
        self.mt5.account.equity = 101000.0
        complete, _ = self.sync.snapshot()
        light, is_complete = self.sync.snapshot()
        self.assertFalse(is_complete)
        self.assertEqual((complete['balance'], light['balance'], light['equity']), (1000.0, 1000.0, 1010.0))

    def test_without_a_deal_count_every_cycle_stays_complete_but_the_link_stays_open(self):
        mt5 = FakeMt5([deal(10, 0, 2000), deal(20, 1, 2001, profit=8.0)])
        del FakeMt5.history_deals_total
        try:
            sync = self.host.Mt5Sync(mt5, JOB, BASE, clock=self.clock)
            self.assertTrue(sync.snapshot()[1])
            self.assertTrue(sync.snapshot()[1])
            self.assertEqual((mt5.initialize.call_count, mt5.history_reads), (1, 2))
        finally:
            FakeMt5.history_deals_total = lambda self, start, end: len(self.deals)


def trade(ticket, amount):
    return dict(external_id=f'mt5:{ticket}', symbol='XAUUSD', direction='buy', entry_price=2000.0,
                trade_date='2026-11-10T10:00:00+00:00', result_amount=amount)


SNAPSHOT = dict(platform='MT5', login='10001', server='Synthetic-Server', currency='USD', balance=1000.0,
                equity=1000.0, observed_at='2026-11-11T04:00:00+00:00', warnings=[])


class SentTradesTest(unittest.TestCase):
    def setUp(self):
        self.host = load_host()
        self.sent = self.host.SentTrades()
        self.reports = []

    def report(self, status, snapshot):
        self.reports.append(snapshot['trades'])

    def send(self, trades, report=None, lease=lambda: True):
        return self.host.send_changes(report or self.report, dict(SNAPSHOT), trades, self.sent, lease=lease)

    def test_everything_is_sent_once_then_only_new_or_changed_trades(self):
        history = [trade(n, 1.0) for n in range(1, 301)]
        self.assertEqual(self.send(history), 300)
        self.assertEqual([len(batch) for batch in self.reports], [250, 50], 'The original 250-trade batches')
        self.reports.clear()
        self.assertEqual(self.send(history), 0)
        self.assertEqual(self.reports, [[]], 'Nothing new: one light report keeps balance and last sync current')
        self.reports.clear()
        changed = history[:299] + [trade(300, -2.0), trade(301, 4.0)]
        self.assertEqual(self.send(changed), 2)
        self.assertEqual([t['external_id'] for t in self.reports[0]], ['mt5:300', 'mt5:301'])

    def test_trades_count_as_sent_only_once_every_batch_was_accepted(self):
        history = [trade(n, 1.0) for n in range(1, 301)]
        calls = []

        def failing(status, snapshot):
            calls.append(len(snapshot['trades']))
            if len(calls) == 2:
                raise OSError('synthetic network failure')
        with self.assertRaises(OSError):
            self.send(history, report=failing)
        self.reports.clear()
        self.assertEqual(self.send(history), 300, 'A failed sending is sent again in full')

    def test_an_ended_lease_stops_without_remembering(self):
        self.assertIsNone(self.send([trade(1, 1.0)], lease=lambda: False))
        self.assertEqual(self.reports, [])
        self.assertEqual(self.send([trade(1, 1.0)]), 1)


class ChildLoopSourceTest(unittest.TestCase):
    """The child loop keeps the link open between cycles and closes it only on failure or at the end."""
    def test_child_uses_the_open_link_and_sends_only_changes(self):
        source = (BASE/'host.py').read_text(encoding='utf-8')
        child = source[source.index('def child():'):source.index('def memory_allows_start():')]
        self.assertIn('sync=Mt5Sync(mt5,job,folder)', child)
        self.assertIn('snapshot,complete=sync.snapshot()', child)
        self.assertIn('count=send_changes(report,snapshot,trades,sent)', child)
        self.assertNotIn('mt5.shutdown()', child, 'No more logout after every cycle')
        self.assertNotIn('snapshot_mt5(mt5,job,folder)', child)
        self.assertIn('InvestPro D11', source)


if __name__ == '__main__':
    unittest.main()
