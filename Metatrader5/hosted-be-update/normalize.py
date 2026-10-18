"""Read-only MT5 conversion. One fully closed position = one journal trade.
Unsupported INOUT reversals and incomplete histories are reported, never guessed.
"""
from collections import defaultdict
from datetime import datetime, timezone

def normalize(deals, open_ids):
    groups = defaultdict(list)
    unattached = 0
    for d in deals:
        if d['position_id']:
            groups[str(d['position_id'])].append(d)
        elif d['type'] not in (2, 3) and any(d.get(k, 0) for k in ('profit','commission','swap','fee')):
            unattached += 1
    trades, skipped = [], 0
    for pid, items in groups.items():
        if pid in open_ids:
            continue
        execution = sorted([d for d in items if d['type'] in (0,1)], key=lambda d:(d['time_msc'],d['ticket']))
        if not execution:
            continue
        ins = [d for d in execution if d['entry']==0]
        outs = [d for d in execution if d['entry'] in (1,3)]
        if (not ins or not outs or any(d['entry']==2 for d in execution)
            or len({d['type'] for d in ins})!=1
            or any(d['type']==ins[0]['type'] for d in outs)
            or len({d['symbol'] for d in execution})!=1
            or execution[0]['entry']!=0):
            skipped += 1
            continue
        volume = sum(d['volume'] for d in ins)
        if volume<=0 or abs(volume-sum(d['volume'] for d in outs))>1e-7:
            skipped += 1
            continue
        pnl = sum(sum(d.get(k,0) for k in ('profit','commission','swap','fee')) for d in items)
        trades.append(dict(external_id='mt5:'+pid, symbol=ins[0]['symbol'], direction='buy' if ins[0]['type']==0 else 'sell',
            entry_price=sum(d['price']*d['volume'] for d in ins)/volume,
            trade_date=datetime.fromtimestamp(outs[-1]['time'],timezone.utc).isoformat(), result_amount=round(pnl,8)))
    warnings=[]
    if skipped: warnings.append(f'{skipped} position(s) non importée(s) : historique incomplet ou retournement netting à vérifier.')
    if unattached: warnings.append(f'{unattached} opération(s) de frais/ajustement sans position : non attribuées aux trades.')
    return sorted(trades,key=lambda t:(t['trade_date'],t['external_id'])), warnings
