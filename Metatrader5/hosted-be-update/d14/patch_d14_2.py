"""Patch host.py D14.1 into D14.2. Writes host.py.d14_2 next to it; host.py itself is untouched.

An account whose terminal lost its broker connection for a while (MT4 export older than 90 s, MT5 IPC timeout)
was retried twice, then stayed stopped until the connector restarted. It is now retried for as long as needed:
MT4 every 1 to 5 minutes, MT5 every 5 then 10 minutes. Refused credentials are still never retried.
Every replacement must match exactly once, otherwise nothing is written.
"""
import ast
import sys
from pathlib import Path

source = Path(sys.argv[1])
text = source.read_text(encoding='utf-8')

REPLACEMENTS = [
    ("print('InvestPro D14.1 - ", "print('InvestPro D14.2 - reprises sans limite ; "),
    (" return 60 * (recoveries + 1) if isinstance(error, MT4ExportStale) and confirmed and recoveries < 2 else None",
     " return min(300, 60 * (recoveries + 1)) if isinstance(error, MT4ExportStale) and confirmed else None"),
    (" if isinstance(error,MT5InitializationError) and error.code in (-10000,-10001,-10002,-10003,-10005) and recoveries<2:return 300",
     " if isinstance(error,MT5InitializationError) and error.code in (-10000,-10001,-10002,-10003,-10005):return 300 if recoveries<2 else 600"),
    ("('+str(recoveries)+'/2)')", "(tentative '+str(recoveries)+')')"),
]

problems = []
for old, new in REPLACEMENTS:
    count = text.count(old)
    if count != 1:
        problems.append(f'{count} x {old[:90]!r}')
        continue
    text = text.replace(old, new)
if problems:
    print('ARRET, rien ecrit :')
    print('\n'.join(problems))
    sys.exit(1)
ast.parse(text)
target = source.with_name(source.name + '.d14_2')
with open(target, 'w', encoding='utf-8', newline='') as handle:
    handle.write(text)
print('host.py.d14_2 ecrit :', len(text.encode('utf-8')), 'octets ; syntaxe OK')
