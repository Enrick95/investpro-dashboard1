"""Patch host.py D14 into D14.1. Writes host.py.d14_1 next to it; host.py itself is untouched.

The hosting platform (Vercel) refuses a share of the PC's requests at its edge (HTTP 403, X-Vercel-Mitigated: deny,
about one in seven on 13 November 2026). Such a refusal is retried a few seconds later instead of stopping the
account, and an account stopped by repeated crashes is tried again after 30 minutes.
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
    ("print('InvestPro D14 - ", "print('InvestPro D14.1 - refus passagers du site rejoues ; "),
    # Edge refusals (403), rate limits (429) and unavailable answers (5xx) are retried: twice for a report, once for the
    # poll so the accounts' lease (75 s) never expires. The site's own refusals (401, 409, 400) are never retried.
    (block(
        " req=urllib.request.Request(SITE+'/api/metasync/hosted/worker',data=json.dumps(payload,allow_nan=False).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+config['token']},method='POST')",
        " with urllib.request.build_opener(NoRedirect).open(req,timeout=20) as r:return json.load(r)"),
     block(
        " body=json.dumps(payload,allow_nan=False).encode();attempts=2 if payload.get('action')=='poll' else 3",
        " for attempt in range(attempts):",
        "  req=urllib.request.Request(SITE+'/api/metasync/hosted/worker',data=body,headers={'Content-Type':'application/json','Authorization':'Bearer '+config['token'],'User-Agent':'InvestPro-Hosted/14.1'},method='POST')",
        "  try:",
        "   with urllib.request.build_opener(NoRedirect).open(req,timeout=20) as r:return json.load(r)",
        "  except urllib.error.HTTPError as e:",
        "   if attempt==attempts-1 or e.code not in (403,429,500,502,503,504):raise",
        "  time.sleep(3*(attempt+1))")),
    # A refused « connecting » report no longer ends the account's process (it was counted as a crash).
    (block("  diagnostic('CONNEXION '+a['platform']+' compte ...'+str(a['login'])[-4:])", "  report('connecting')"),
     block("  diagnostic('CONNEXION '+a['platform']+' compte ...'+str(a['login'])[-4:])",
           "  try:report('connecting')",
           "  except urllib.error.HTTPError as e:",
           "   if e.code in (401,409):return",
           "   diagnostic('ENVOI REFUSE '+a['platform']+' compte ...'+str(a['login'])[-4:]+': '+safe_error(e))",
           "  except OSError as e:diagnostic('ENVOI REFUSE '+a['platform']+' compte ...'+str(a['login'])[-4:]+': '+safe_error(e))")),
    # Accounts stopped after three crashes get a new chance every 30 minutes.
    ("told=set();last_build_check=0;build_thread=None", "told=set();last_build_check=0;build_thread=None;crash_reset=time.monotonic()"),
    ("     last_build_check=time.monotonic();build_thread=threading.Thread(target=check_mt5_updates,args=(c,),daemon=True);build_thread.start()",
     block("     last_build_check=time.monotonic();build_thread=threading.Thread(target=check_mt5_updates,args=(c,),daemon=True);build_thread.start()",
           "    if time.monotonic()-crash_reset>=1800:crashes.clear();told.clear();crash_reset=time.monotonic()")),
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
target = source.with_name(source.name + '.d14_1')
with open(target, 'w', encoding='utf-8', newline='') as handle:
    handle.write(text)
print('host.py.d14_1 ecrit :', len(text.encode('utf-8')), 'octets ; syntaxe OK')
