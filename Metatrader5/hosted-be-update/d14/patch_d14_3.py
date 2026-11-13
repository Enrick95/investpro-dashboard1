"""Patch host.py D14.2 into D14.3. Writes host.py.d14_3 next to it; host.py itself is untouched.

One failed reading (an MT4 export a few seconds late while the terminal reconnects to its broker, an MT5 terminal
restarting) marked the account « Échec de synchronisation » on the site until the next good reading. The account is
now reported in error only after three failures in a row, when the connector pauses or stops it.
Every replacement must match exactly once, otherwise nothing is written.
"""
import ast
import sys
from pathlib import Path

source = Path(sys.argv[1])
text = source.read_text(encoding='utf-8')
nl = '\r\n' if '\r\n' in text else '\n'


def block(*lines):
    return nl.join(lines)


REPLACEMENTS = [
    ("print('InvestPro D14.2 - ", "print('InvestPro D14.3 - erreur signalee apres 3 echecs ; "),
    (block("    try:report('error')", "    except urllib.error.HTTPError as e:"),
     block("    try:", "     if failures>=3:report('error')", "    except urllib.error.HTTPError as e:")),
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
target = source.with_name(source.name + '.d14_3')
with open(target, 'w', encoding='utf-8', newline='') as handle:
    handle.write(text)
print('host.py.d14_3 ecrit :', len(text.encode('utf-8')), 'octets ; syntaxe OK')
