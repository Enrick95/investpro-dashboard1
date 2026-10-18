"""Optional, read-only MT5 closing-stop evidence.

The Python TradeDeal API does not expose DEAL_SL. The companion MQL5 expert
exports that documented property; every row is joined back to Python's deal
history and to the same authenticated account before it can enrich a trade.
Nothing here changes result_amount or infers an outcome from profit/loss.
"""
import json
import math
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

SCHEMA = 'investpro.mt5.exit-stop.v1'
EXPERT_NAME = 'InvestProHostedMT5Evidence'
MAX_EXPORT_BYTES = 500_000
MAX_EXPORT_DEALS = 1000
MAX_EXECUTIONS = 16
MAX_AGE_SECONDS = 90
_ID = re.compile(r'[1-9][0-9]{0,19}\Z')


def _number(value, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(value) and abs(value) < 1e12 and (value > 0 if positive else value >= 0)


def _id(value):
    return isinstance(value, (str, int)) and not isinstance(value, bool) and bool(_ID.fullmatch(str(value)))


def _integer(value, positive=False):
    return type(value) is int and value <= 9007199254740991 and (value > 0 if positive else value >= 0)


def _same_number(left, right):
    # This is serialization noise only, not a stop/price or P&L tolerance.
    return _number(left) and _number(right) and math.isclose(left, right, rel_tol=1e-12, abs_tol=1e-12)


def _duplicate_safe_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate evidence key')
        result[key] = value
    return result


def read_export(folder, account, now=None):
    """Read at most 500 kB from this isolated terminal, or return no evidence.

    account is the freshly verified raw MT5 identity (before USC conversion).
    Failure never prevents the original monetary history from synchronizing.
    """
    now = time.time() if now is None else now
    try:
        file = Path(folder) / 'MQL5' / 'Files' / 'investpro-exit-stops.json'
        if file.is_symlink():
            return {}
        stat = file.stat()
        if stat.st_size > MAX_EXPORT_BYTES or not 0 <= now-stat.st_mtime <= MAX_AGE_SECONDS:
            return {}
        with file.open('rb') as stream:
            raw = stream.read(MAX_EXPORT_BYTES+1)
        if len(raw) > MAX_EXPORT_BYTES:
            return {}
        document = json.loads(raw.decode('utf-8-sig'), object_pairs_hook=_duplicate_safe_object,
                              parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite evidence')))
        if (not isinstance(document, dict) or document.get('schema') != SCHEMA
                or document.get('login') != str(account.login)
                or document.get('server') != account.server
                or document.get('currency') != account.currency
                or not _integer(document.get('observed_at_unix'), positive=True)
                or not 0 <= now-document['observed_at_unix'] <= MAX_AGE_SECONDS):
            return {}
        rows = document.get('deals')
        if not isinstance(rows, list) or len(rows) > MAX_EXPORT_DEALS:
            return {}
        result = {}
        for row in rows:
            if (not isinstance(row, dict) or not _id(row.get('ticket')) or not _id(row.get('position_id'))
                    or not isinstance(row.get('symbol'), str) or not 1 <= len(row['symbol']) <= 128
                    or not _integer(row.get('time_msc'), positive=True)
                    or not _integer(row.get('reason')) or row['reason'] > 255
                    or not _number(row.get('price'), positive=True)
                    or not _number(row.get('volume'), positive=True)
                    or 'stop_loss' not in row
                    or (row.get('stop_loss') is not None and not _number(row['stop_loss'], positive=True))):
                return {}
            ticket = str(row['ticket'])
            if ticket in result:
                return {}
            result[ticket] = row
        return result
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        return {}


def _raw_valid(deal):
    return (isinstance(deal, dict) and _id(deal.get('ticket')) and _id(deal.get('position_id'))
            and _integer(deal.get('time_msc'), positive=True)
            and _number(deal.get('price'), positive=True) and _number(deal.get('volume'), positive=True))


def _joined(row, deal, step):
    return (isinstance(row, dict) and str(row.get('ticket')) == str(deal['ticket'])
            and str(row.get('position_id')) == str(deal['position_id'])
            and row.get('symbol') == deal.get('symbol') and row.get('time_msc') == deal['time_msc']
            and row.get('reason') == deal.get('reason')
            and _number(row.get('price'), positive=True) and abs(row['price']-deal['price']) <= step*1e-6
            and _same_number(row.get('volume'), deal['volume']))


def enrich_trades(trades, deals, open_ids, evidence, price_steps):
    """Add bounded execution_metadata; ambiguous or unproved positions stay as-is.

    Scale-ins are supported only before the first exit. A mixture of TP/manual
    and SL exits is exported faithfully and must not become an automatic BE.
    """
    groups = {}
    for deal in deals:
        if isinstance(deal, dict) and deal.get('position_id'):
            groups.setdefault(str(deal['position_id']), []).append(deal)
    result = []
    for trade in trades:
        enriched = dict(trade)
        pid = str(trade.get('external_id', '')).removeprefix('mt5:')
        items = groups.get(pid, [])
        execution = [d for d in items if d.get('type') in (0, 1)]
        step = price_steps.get(trade.get('symbol'))
        if (not _id(pid) or trade.get('external_id') != 'mt5:'+pid or pid in open_ids
                or not _number(step, positive=True) or not execution
                or any(not _raw_valid(d) for d in execution)
                or len({str(d['ticket']) for d in execution}) != len(execution)):
            result.append(enriched)
            continue
        execution.sort(key=lambda d: (d['time_msc'], int(d['ticket'])))
        ins = [d for d in execution if d.get('entry') == 0]
        outs = [d for d in execution if d.get('entry') == 1]
        if (not 1 <= len(ins) <= MAX_EXECUTIONS or not 1 <= len(outs) <= MAX_EXECUTIONS
                or len(ins)+len(outs) != len(execution)
                or len({d['type'] for d in ins}) != 1
                or any(d['type'] == ins[0]['type'] for d in outs)
                or any(d.get('symbol') != trade.get('symbol') for d in execution)
                or ('buy' if ins[0]['type'] == 0 else 'sell') != trade.get('direction')
                or (ins[-1]['time_msc'], int(ins[-1]['ticket'])) >= (outs[0]['time_msc'], int(outs[0]['ticket']))):
            result.append(enriched)
            continue
        volume_in = sum(d['volume'] for d in ins)
        volume_out = sum(d['volume'] for d in outs)
        weighted_entry = sum(d['price']*d['volume'] for d in ins)/volume_in
        if (abs(volume_in-volume_out) > 1e-7 or not _number(trade.get('entry_price'), positive=True)
                or abs(weighted_entry-trade['entry_price']) > step*1e-6):
            result.append(enriched)
            continue
        joined = [evidence.get(str(d['ticket'])) for d in outs]
        if any(not _joined(row, deal, step) or 'stop_loss' not in row for row, deal in zip(joined, outs)):
            result.append(enriched)
            continue
        def basic(deal):
            return dict(ticket=str(deal['ticket']), time_msc=deal['time_msc'],
                        price=deal['price'], volume=deal['volume'])
        metadata_exits = []
        for row, deal in zip(joined, outs):
            reason = 'sl' if deal['reason'] == 4 else 'tp' if deal['reason'] == 5 else 'manual' if deal['reason'] in (0, 1, 2) else 'other'
            metadata_exits.append(dict(basic(deal), reason=reason, stop_loss=row['stop_loss']))
        enriched['execution_metadata'] = dict(version=1, platform='MT5', source='mt5_history_deal_sl',
                                               position_id=pid, price_step=step,
                                               entries=[basic(d) for d in ins], exits=metadata_exits)
        result.append(enriched)
    return result


def price_steps(mt5, symbols):
    result = {}
    for symbol in symbols:
        try:
            info = mt5.symbol_info(symbol)
            steps = [getattr(info, key, None) for key in ('point', 'trade_tick_size')]
            valid = [step for step in steps if _number(step, positive=True)]
            if valid:
                result[symbol] = min(valid)
        except Exception:
            pass
    return result


def trade_batches(snapshot, trades):
    """Retain the original 250-trade cap and stay below the site's byte limit.

    400 kB leaves room for the existing action/job/generation/worker envelope.
    Use the same ensure_ascii/allow_nan encoding as host.api, including the
    UTF-8 byte length; evidence therefore cannot turn a valid sync into a 413.
    """
    prefix_bytes = len(json.dumps(dict(snapshot, trades=[]), allow_nan=False).encode('utf-8'))
    if prefix_bytes > 400_000:
        raise ValueError('snapshot too large')
    batch, batch_bytes = [], prefix_bytes
    for trade in trades:
        row_bytes = len(json.dumps(trade, allow_nan=False).encode('utf-8'))
        # The original record remains useful if an unusually large optional
        # proof cannot fit. Never alter its monetary amount to force a fit.
        if prefix_bytes+row_bytes+2 > 400_000 and 'execution_metadata' in trade:
            trade = {key: value for key, value in trade.items() if key != 'execution_metadata'}
            row_bytes = len(json.dumps(trade, allow_nan=False).encode('utf-8'))
        if prefix_bytes+row_bytes+2 > 400_000:
            raise ValueError('trade too large')
        if batch and (len(batch) >= 250 or batch_bytes+row_bytes+2 > 400_000):
            yield batch
            batch, batch_bytes = [], prefix_bytes
        batch.append(trade)
        batch_bytes += row_bytes+(2 if len(batch) > 1 else 0)
    if batch or not trades:
        yield batch


def _ini_value(value):
    value = str(value)
    if not value or any(ord(char) < 32 for char in value):
        raise ValueError('invalid evidence startup value')
    return value


def _hidden_process_options():
    startupinfo = None
    if os.name == 'nt':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
    return dict(startupinfo=startupinfo, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))


def _isolated_folder(folder, instances_root):
    folder, root = Path(folder).resolve(), Path(instances_root).resolve()
    if folder == root or not folder.is_relative_to(root):
        raise ValueError('evidence terminal outside isolated instances')
    return folder


def restart_bridge(folder, instances_root):
    """Reattach the prepared expert after the existing IPC recovery stops MT5."""
    folder = _isolated_folder(folder, instances_root)
    config = folder/'config'/'investpro-evidence-start.ini'
    compiled = folder/'MQL5'/'Experts'/(EXPERT_NAME+'.ex5')
    if not config.is_file() or not compiled.is_file():
        raise FileNotFoundError('evidence startup unavailable')
    return subprocess.Popen([str(folder/'terminal64.exe'), '/portable', '/config:'+str(config)], cwd=str(folder),
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **_hidden_process_options())


def prepare_bridge(base, folder, instances_root, account, symbol):
    """Compile and start only the new read-only expert in this isolated instance.

    No credentials are written. The existing Python initialize/login retains
    responsibility for authentication, account permission and identity checks.
    This function is called once for the newly created child instance, never
    by the agent while preparing the update.
    """
    folder = _isolated_folder(folder, instances_root)
    experts = folder/'MQL5'/'Experts'
    experts.mkdir(parents=True, exist_ok=True)
    source = experts/(EXPERT_NAME+'.mq5')
    compiled = experts/(EXPERT_NAME+'.ex5')
    shutil.copy2(Path(base)/(EXPERT_NAME+'.mq5'), source)
    compiled.unlink(missing_ok=True)
    editor = folder/'metaeditor64.exe'
    if not editor.is_file():
        raise FileNotFoundError('evidence compiler unavailable')
    subprocess.run([str(editor), '/portable', '/compile:'+str(source), '/log:'+str(experts/'investpro-evidence-compile.log')],
                   timeout=120, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **_hidden_process_options())
    if not compiled.is_file():
        raise RuntimeError('evidence compiler produced no expert')
    config = folder/'config'/'investpro-evidence-start.ini'
    config.parent.mkdir(exist_ok=True)
    ini = '[Common]\r\nLogin='+_ini_value(account['login'])+'\r\nServer='+_ini_value(account['server'])+'\r\nKeepPrivate=0\r\nNewsEnable=0\r\n\r\n'
    ini += '[Experts]\r\nEnabled=1\r\nAllowLiveTrading=0\r\nAllowDllImport=0\r\nAccount=0\r\nProfile=0\r\n\r\n'
    ini += '[StartUp]\r\nExpert='+EXPERT_NAME+'\r\nSymbol='+_ini_value(symbol)+'\r\nPeriod=H1\r\n'
    config.write_bytes(ini.encode('utf-16'))
    # The terminal is needed for the existing Python API as well. Hiding only
    # this newly introduced startup process leaves the old login flow intact.
    return restart_bridge(folder, instances_root)
