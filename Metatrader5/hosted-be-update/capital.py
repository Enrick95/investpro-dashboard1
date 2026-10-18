"""Summary from available broker history; balance movements never become trades."""
import math

def funding_mt5(balance, deals):
    if not math.isfinite(balance):
        raise ValueError('balance')
    inflows = outflows = total = 0.0
    events = []
    for d in deals:
        kind = int(d['type'])
        if kind == 3:  # Credit is not account balance.
            continue
        amount = sum(float(d.get(k, 0)) for k in ('profit', 'commission', 'swap', 'fee'))
        if not math.isfinite(amount):
            raise ValueError('amount')
        total += amount
        if amount:
            events.append((int(d['time_msc']), int(d['ticket']), kind, amount))
        if kind == 2:
            inflows += max(amount, 0)
            outflows += max(-amount, 0)
    events.sort()
    first = events[0] if events else None
    reliable = first and first[2] == 2 and first[3] > 0 and abs(balance-total) <= 0.01
    return dict(inflows=round(inflows,8),outflows=round(outflows,8),
                reference_balance=round(first[3] if reliable else max(0,balance),8),
                reference_method='first_deposit' if reliable else 'first_sync_balance')
