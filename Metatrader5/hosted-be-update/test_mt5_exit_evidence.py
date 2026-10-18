"""Offline tests only: no MT terminal, broker, login, real files or network."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import mt5_exit_evidence as evidence
from normalize import normalize


BASE = Path(__file__).resolve().parent


def deal(ticket, entry, price, *, kind=None, volume=1.0, reason=0, stamp=None, profit=0.0, **extra):
    values = dict(ticket=ticket, position_id=100, type=(0 if entry == 0 else 1) if kind is None else kind,
                  entry=entry, price=price, volume=volume, symbol='XAUUSD', reason=reason,
                  time_msc=stamp or ticket*1000, time=(stamp or ticket*1000)//1000,
                  profit=profit, commission=-1.0, swap=0.0, fee=-0.5)
    return dict(values, **extra)


def export_rows(deals, stop=2000.0):
    return {str(d['ticket']): dict(ticket=str(d['ticket']), position_id=str(d['position_id']), symbol=d['symbol'],
                                 time_msc=d['time_msc'], reason=d['reason'], price=d['price'],
                                 volume=d['volume'], stop_loss=stop) for d in deals if d['entry'] == 1}


def enrich(deals, rows=None, open_ids=None, step=0.01):
    open_ids = set() if open_ids is None else open_ids
    trades, _ = normalize(deals, open_ids)
    return evidence.enrich_trades(trades, deals, open_ids, export_rows(deals) if rows is None else rows, {'XAUUSD': step})


class EvidenceTest(unittest.TestCase):
    def setUp(self):
        self.deals = [deal(10, 0, 2000), deal(20, 1, 1999.98, reason=4, profit=-2)]

    def test_real_closing_sl_is_exported_without_rewriting_fees_or_slippage(self):
        original, _ = normalize(self.deals, set())
        output = enrich(self.deals)
        proof = output[0].pop('execution_metadata')
        self.assertEqual(output, original)
        self.assertEqual(output[0]['result_amount'], -5.0)
        self.assertEqual(proof['source'], 'mt5_history_deal_sl')
        self.assertEqual(proof['position_id'], '100')
        self.assertEqual(proof['exits'][0], dict(ticket='20', time_msc=20000, price=1999.98, volume=1.0, reason='sl', stop_loss=2000.0))

    def test_sell_uses_same_actual_execution_prices(self):
        self.deals[0]['type'], self.deals[1]['type'] = 1, 0
        self.deals[1]['price'] = 2000.02
        output = enrich(self.deals)[0]
        self.assertEqual(output['direction'], 'sell')
        self.assertEqual(output['execution_metadata']['exits'][0]['price'], 2000.02)

    def test_manual_small_loss_with_sl_at_entry_remains_manual(self):
        for reason in (0, 1, 2, 3, 6):
            with self.subTest(reason=reason):
                self.deals[1]['reason'] = reason
                proof = enrich(self.deals)[0]['execution_metadata']
                self.assertNotEqual(proof['exits'][0]['reason'], 'sl')
                self.assertLess(enrich(self.deals)[0]['result_amount'], 0)

    def test_take_profit_then_be_stop_exports_both_without_claiming_whole_trade_be(self):
        self.deals = [deal(10, 0, 2000), deal(20, 1, 2010, volume=0.5, reason=5, profit=500),
                      deal(30, 1, 1999.98, volume=0.5, reason=4, profit=-1)]
        proof = enrich(self.deals)[0]['execution_metadata']
        self.assertEqual([row['reason'] for row in proof['exits']], ['tp', 'sl'])

    def test_normal_sl_is_exported_as_actual_sl_never_changed_to_entry(self):
        proof = enrich(self.deals, export_rows(self.deals, stop=1990))[0]['execution_metadata']
        self.assertEqual(proof['exits'][0]['stop_loss'], 1990)

    def test_no_bridge_no_metadata_even_if_deal_or_order_like_record_has_sl(self):
        self.deals[1]['sl'] = 2000
        output = enrich(self.deals, {})
        self.assertNotIn('execution_metadata', output[0])

    def test_every_exit_needs_exact_bridge_match(self):
        for field, bad in [('ticket', '21'), ('position_id', '101'), ('symbol', 'EURUSD'),
                           ('time_msc', 19999), ('reason', 0), ('price', 1999.97), ('volume', 0.9)]:
            with self.subTest(field=field):
                rows = export_rows(self.deals)
                rows['20'][field] = bad
                self.assertNotIn('execution_metadata', enrich(self.deals, rows)[0])

    def test_missing_stop_field_is_ignored(self):
        rows = export_rows(self.deals)
        del rows['20']['stop_loss']
        self.assertNotIn('execution_metadata', enrich(self.deals, rows)[0])

    def test_scale_in_before_exit_has_actual_weighted_entry(self):
        self.deals = [deal(10, 0, 1999, volume=0.5), deal(15, 0, 2001, volume=0.5), deal(20, 1, 1999.98, reason=4)]
        output = enrich(self.deals)[0]
        self.assertEqual(output['entry_price'], 2000)
        self.assertEqual(len(output['execution_metadata']['entries']), 2)

    def test_scale_in_after_partial_exit_is_not_guessed(self):
        self.deals = [deal(10, 0, 2000), deal(20, 1, 2000, volume=0.5, reason=4),
                      deal(30, 0, 2001, volume=0.5), deal(40, 1, 2000.1, reason=4)]
        self.assertNotIn('execution_metadata', enrich(self.deals)[0])

    def test_volume_mismatch_open_reversal_and_close_by_do_not_emit_proof(self):
        self.assertEqual(enrich(self.deals, open_ids={'100'}), [])
        for mutate in ('volume', 'reversal', 'close_by'):
            with self.subTest(mutate=mutate):
                deals = copy.deepcopy(self.deals)
                if mutate == 'volume':
                    deals[1]['volume'] = 0.9
                else:
                    deals[1]['entry'] = 2 if mutate == 'reversal' else 3
                trades, _ = normalize(deals, set())
                output = evidence.enrich_trades(trades, deals, set(), export_rows(deals), {'XAUUSD': 0.01})
                self.assertTrue(all('execution_metadata' not in row for row in output))

    def test_duplicate_and_unbounded_executions_do_not_emit_proof(self):
        trades, _ = normalize(self.deals, set())
        duplicate = self.deals+[self.deals[1]]
        output = evidence.enrich_trades(trades, duplicate, set(), export_rows(duplicate), {'XAUUSD': 0.01})
        self.assertNotIn('execution_metadata', output[0])
        many = [deal(10, 0, 2000, volume=17.0)]+[deal(20+i, 1, 2000, reason=4) for i in range(17)]
        self.assertNotIn('execution_metadata', enrich(many)[0])

    def test_broker_minimum_point_prevents_coarse_tick_tolerance(self):
        mt5 = SimpleNamespace(symbol_info=lambda symbol: SimpleNamespace(point=0.001, trade_tick_size=0.01))
        self.assertEqual(evidence.price_steps(mt5, ['XAUUSD']), {'XAUUSD': 0.001})
        mt5.symbol_info = lambda symbol: SimpleNamespace(point=0, trade_tick_size=0.01)
        self.assertEqual(evidence.price_steps(mt5, ['XAUUSD']), {'XAUUSD': 0.01})
        mt5.symbol_info = lambda symbol: None
        self.assertEqual(evidence.price_steps(mt5, ['XAUUSD']), {})

    def test_missing_symbol_precision_omits_metadata(self):
        trades, _ = normalize(self.deals, set())
        output = evidence.enrich_trades(trades, self.deals, set(), export_rows(self.deals), {})
        self.assertEqual(output, trades)


class ExportReaderTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=BASE, prefix='test-evidence-')
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.file = self.folder/'MQL5'/'Files'/'investpro-exit-stops.json'
        self.file.parent.mkdir(parents=True)
        self.now = int(time.time())
        self.account = SimpleNamespace(login=10001, server='Synthetic-Server', currency='USC')
        self.document = dict(schema=evidence.SCHEMA, login='10001', server='Synthetic-Server', currency='USC',
                             observed_at_unix=self.now, deals=list(export_rows([deal(20, 1, 2000, reason=4)]).values()))

    def write(self, document=None):
        self.file.write_text(json.dumps(self.document if document is None else document), encoding='utf-8')
        os.utime(self.file, (self.now, self.now))

    def test_valid_exact_raw_identity_is_required(self):
        self.write()
        self.assertIn('20', evidence.read_export(self.folder, self.account, self.now))
        for attribute, value in [('login', 10002), ('server', 'Different'), ('currency', 'USD')]:
            with self.subTest(attribute=attribute):
                account = copy.copy(self.account)
                setattr(account, attribute, value)
                self.assertEqual(evidence.read_export(self.folder, account, self.now), {})

    def test_both_age_sources_and_clock_bounds_are_required(self):
        self.write()
        for stamp in (self.now-91, self.now+1):
            with self.subTest(stamp=stamp):
                os.utime(self.file, (stamp, stamp))
                self.assertEqual(evidence.read_export(self.folder, self.account, self.now), {})
        for stamp in (self.now-91, self.now+1):
            self.document['observed_at_unix'] = stamp
            self.write()
            self.assertEqual(evidence.read_export(self.folder, self.account, self.now), {})

    def test_size_count_duplicate_nonfinite_and_malformed_exports_are_rejected(self):
        cases = []
        duplicate = copy.deepcopy(self.document)
        duplicate['deals'] *= 2
        cases.append(duplicate)
        too_many = copy.deepcopy(self.document)
        too_many['deals'] *= 1001
        cases.append(too_many)
        nan = copy.deepcopy(self.document)
        nan['deals'][0]['price'] = float('nan')
        cases.append(nan)
        absent = copy.deepcopy(self.document)
        del absent['deals'][0]['stop_loss']
        cases.append(absent)
        for document in cases:
            self.write(document)
            self.assertEqual(evidence.read_export(self.folder, self.account, self.now), {})
        for raw in ('{'+' '*500001, '{"schema":"one","schema":"two"}', '[]', '{broken'):
            self.file.write_text(raw, encoding='utf-8')
            os.utime(self.file, (self.now, self.now))
            self.assertEqual(evidence.read_export(self.folder, self.account, self.now), {})

    def test_missing_export_is_optional(self):
        self.assertEqual(evidence.read_export(self.folder, self.account, self.now), {})


class StartupAndBatchTest(unittest.TestCase):
    def test_preparation_stays_inside_instance_uses_no_secret_and_read_only_settings(self):
        with tempfile.TemporaryDirectory(dir=BASE, prefix='test-evidence-') as temporary:
            root = Path(temporary)/'instances'
            folder = root/'synthetic-job'
            folder.mkdir(parents=True)
            (folder/'metaeditor64.exe').write_bytes(b'not executable; mocks only')
            account = dict(login='10001', server='Synthetic-Server', password='must-not-appear')
            def compiled(*args, **kwargs):
                (folder/'MQL5'/'Experts'/(evidence.EXPERT_NAME+'.ex5')).write_bytes(b'mocked')
            with patch.object(evidence.subprocess, 'run', side_effect=compiled) as compiler, patch.object(evidence.subprocess, 'Popen') as launch:
                evidence.prepare_bridge(BASE, folder, root, account, 'XAUUSD')
                self.assertEqual(compiler.call_count, 1)
                self.assertEqual(launch.call_count, 1)
                ini = (folder/'config'/'investpro-evidence-start.ini').read_text(encoding='utf-16')
                self.assertNotIn('must-not-appear', ini)
                self.assertNotIn('Password', ini)
                self.assertIn('AllowLiveTrading=0', ini)
                self.assertIn('AllowDllImport=0', ini)
                self.assertIn('[StartUp]', ini)
                self.assertIn('Expert='+evidence.EXPERT_NAME, ini)
                self.assertTrue(all(str(folder) in str(arg) or str(arg).startswith('/portable') for arg in compiler.call_args.args[0]))
                evidence.restart_bridge(folder, root)
                self.assertEqual(compiler.call_count, 1)
                self.assertEqual(launch.call_count, 2)
            with self.assertRaises(ValueError):
                evidence.prepare_bridge(BASE, root, root, account, 'XAUUSD')
            with self.assertRaises(ValueError):
                evidence.prepare_bridge(BASE, Path(temporary)/'other', root, account, 'XAUUSD')

    def test_missing_compiler_or_failed_compile_does_not_launch_terminal(self):
        with tempfile.TemporaryDirectory(dir=BASE, prefix='test-evidence-') as temporary:
            root = Path(temporary)
            folder = root/'synthetic-job'
            folder.mkdir()
            account = dict(login='10001', server='Synthetic-Server')
            with patch.object(evidence.subprocess, 'Popen') as launch:
                with self.assertRaises(FileNotFoundError):
                    evidence.prepare_bridge(BASE, folder, root, account, 'XAUUSD')
                (folder/'metaeditor64.exe').write_bytes(b'mocked')
                with patch.object(evidence.subprocess, 'run'):
                    with self.assertRaises(RuntimeError):
                        evidence.prepare_bridge(BASE, folder, root, account, 'XAUUSD')
                launch.assert_not_called()

    def test_batches_stay_below_http_size_and_original_count_limit(self):
        snapshot = dict(platform='MT5', warnings=['é'*20], observed_at='synthetic')
        trades = [dict(external_id='mt5:'+str(index), result_amount=-3.1, execution_metadata={'rows':'x'*5000}) for index in range(1000)]
        batches = list(evidence.trade_batches(snapshot, trades))
        self.assertEqual(sum(map(len, batches)), len(trades))
        for batch in batches:
            self.assertLessEqual(len(batch), 250)
            self.assertLessEqual(len(json.dumps(dict(snapshot, trades=batch), allow_nan=False).encode()), 400000)
            self.assertTrue(all(trade['result_amount'] == -3.1 for trade in batch))
        self.assertEqual(list(evidence.trade_batches(snapshot, [])), [[]])
        many_small = list(evidence.trade_batches(snapshot, [dict(result_amount=1) for _ in range(501)]))
        self.assertEqual(list(map(len, many_small)), [250, 250, 1])

    def test_oversized_optional_proof_does_not_drop_trade_or_money(self):
        trade = dict(external_id='mt5:1', result_amount=-4.2, execution_metadata={'rows':'x'*500000})
        self.assertEqual(list(evidence.trade_batches({}, [trade])), [[dict(external_id='mt5:1', result_amount=-4.2)]])

    def test_expert_is_static_read_only_and_reads_actual_deal_sl(self):
        source = (BASE/(evidence.EXPERT_NAME+'.mq5')).read_text()
        self.assertIn('HistoryDealGetDouble(ticket,DEAL_SL)', source)
        self.assertIn('HistoryDealGetInteger(ticket,DEAL_REASON)', source)
        self.assertIn('FILE_REWRITE', source)
        self.assertNotRegex(source, r'\b(?:OrderSend|OrderSendAsync|PositionOpen|PositionClose|WebRequest|ShellExecute)\s*\(')
        self.assertNotIn('#import', source)


class HostIntegrationTest(unittest.TestCase):
    def test_snapshot_uses_bridge_but_preserves_cent_conversion_funding_and_base_history(self):
        spec = importlib.util.spec_from_file_location('host_under_test', BASE/'host.py')
        host = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(host)
        deals = [deal(10, 0, 2000), deal(20, 1, 1999.98, reason=4, profit=-2)]
        raw_account = SimpleNamespace(login=10001, server='Synthetic-Server', currency='USC', balance=100000.0, equity=100000.0, trade_allowed=False)
        terminal = SimpleNamespace(connected=True, data_path=str(BASE))
        mt5 = SimpleNamespace(initialize=Mock(return_value=True), account_info=Mock(return_value=raw_account),
                              terminal_info=Mock(return_value=terminal), history_deals_get=Mock(return_value=[SimpleNamespace(_asdict=lambda d=d: d) for d in deals]),
                              positions_get=Mock(return_value=[]), symbol_info=Mock(return_value=SimpleNamespace(point=0.01, trade_tick_size=0.01)))
        job = dict(investpro_mt_connections=dict(login='10001', server='Synthetic-Server', currency='USD'), password='synthetic-test-password')
        with patch.object(evidence, 'read_export', return_value=export_rows(deals)), patch.object(host, 'diagnostic'):
            snapshot = host.snapshot_mt5(mt5, job, BASE)
        self.assertEqual(snapshot['balance'], 1000)
        self.assertEqual(snapshot['trades'][0]['result_amount'], -0.05)
        self.assertEqual(snapshot['trades'][0]['entry_price'], 2000)
        self.assertEqual(snapshot['trades'][0]['execution_metadata']['exits'][0]['stop_loss'], 2000)
        with patch.object(evidence, 'read_export', side_effect=RuntimeError('synthetic bridge unavailable')), patch.object(host, 'diagnostic'):
            fallback = host.snapshot_mt5(mt5, job, BASE)
        self.assertEqual(fallback['trades'][0]['result_amount'], -0.05)
        self.assertNotIn('execution_metadata', fallback['trades'][0])
        self.assertEqual(fallback['funding'], snapshot['funding'])
        self.assertEqual(mt5.initialize.call_count, 2)


if __name__ == '__main__':
    unittest.main()
