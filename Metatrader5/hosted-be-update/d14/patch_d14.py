"""Patch the hosting PC's host.py (D13b) into D14. Writes host.py.d14 next to it; host.py itself is untouched.

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


FUNCTIONS = block(
    "def copy_template(source,folder):",
    " # A template is never copied while a newer MetaTrader build is being written into it.",
    " import win32event,win32api",
    " lock=win32event.CreateMutex(None,False,'Local\\\\InvestProTemplates')",
    " owned=win32event.WaitForSingleObject(lock,120000)==win32event.WAIT_OBJECT_0",
    " try:shutil.copytree(source,folder)",
    " finally:",
    "  if owned:win32event.ReleaseMutex(lock)",
    "  win32api.CloseHandle(lock)",
    "",
    "def file_version(path):",
    " try:",
    "  import win32api",
    "  info=win32api.GetFileVersionInfo(str(path),'\\\\')",
    "  return (info['FileVersionMS']>>16,info['FileVersionMS']&0xffff,info['FileVersionLS']>>16,info['FileVersionLS']&0xffff)",
    " except Exception:return None",
    "",
    "def signed_by_metaquotes(path):",
    " try:",
    "  script='$s=Get-AuthenticodeSignature -LiteralPath $env:IPX_FILE;if($s.Status -eq \"Valid\" -and $s.SignerCertificate.Subject -like \"*O=MetaQuotes Ltd*\"){\"ok\"}'",
    "  out=subprocess.run(['powershell','-NoProfile','-NonInteractive','-Command',script],env=dict(os.environ,IPX_FILE=str(path)),capture_output=True,text=True,timeout=90,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))",
    "  return out.stdout.strip()=='ok'",
    " except Exception:return False",
    "",
    "def propagate_mt5_build(c):",
    " \"\"\"Copy into every MT5 template a newer MetaTrader build that one instance installed (update approved once on the PC).\"\"\"",
    " templates=[Path(t['path']) for t in c['templates'].values() if t.get('platform')=='MT5']",
    " versions=[v for v in (file_version(p/'terminal64.exe') for p in templates) if v]",
    " if not versions:return",
    " oldest=min(versions);best=None",
    " for exe in (STATE/'instances').glob('*/terminal64.exe'):",
    "  v=file_version(exe)",
    "  if v and v>oldest and (best is None or v>best[0]):best=(v,exe.parent)",
    " if best is None:return",
    " version,source=best;label='.'.join(map(str,version))",
    " if not signed_by_metaquotes(source/'terminal64.exe'):",
    "  diagnostic('MT5 VERSION '+label+' IGNOREE : signature MetaQuotes non verifiee');return",
    " cache=STATE/'mt5-build-latest';cache.mkdir(exist_ok=True)",
    " for name in MT5_BINARIES:",
    "  if (source/name).is_file():shutil.copy2(source/name,cache/name)",
    " import win32event,win32api",
    " lock=win32event.CreateMutex(None,False,'Local\\\\InvestProTemplates')",
    " updated=0",
    " try:",
    "  for folder in templates+[p.parent for p in (STATE/'staging').rglob('terminal64.exe')]:",
    "   current=file_version(folder/'terminal64.exe')",
    "   if not current or current>=version:continue",
    "   # One template at a time: an account starting meanwhile waits a second, never minutes.",
    "   owned=win32event.WaitForSingleObject(lock,120000)==win32event.WAIT_OBJECT_0",
    "   try:",
    "    for name in MT5_BINARIES:",
    "     if (cache/name).is_file() and (folder/name).is_file():shutil.copy2(cache/name,folder/name)",
    "   finally:",
    "    if owned:win32event.ReleaseMutex(lock)",
    "   updated+=1",
    " finally:win32api.CloseHandle(lock)",
    " diagnostic('MT5 VERSION '+label+' COPIEE DANS '+str(updated)+' MODELE(S) : les autres comptes n auront plus de mise a jour a valider')",
    "",
    "def check_mt5_updates(c):",
    " try:",
    "  import psutil",
    "  if any((p.info['name'] or '').lower()=='consent.exe' for p in psutil.process_iter(['name'])):",
    "   diagnostic('FENETRE ADMINISTRATEUR EN ATTENTE SUR LE PC (mise a jour MetaTrader probable) : cliquer Oui une fois, la nouvelle version sera recopiee dans tous les modeles')",
    "  propagate_mt5_build(c)",
    " except Exception as e:diagnostic('MT5 VERSION : verification impossible ; '+safe_error(e))",
    "",
    "def child():",
)

REPLACEMENTS = [
    # Version banner.
    ("print('InvestPro D13b - appels au site espaces (60 s / 15 min) ; ",
     "print('InvestPro D14 - relance auto ; seuls les trades nouveaux envoyes ; versions MT5 recopiees ; appels espaces (60 s / 15 min) ; "),
    # Constants.
    ("POLL_SECONDS=60;HEARTBEAT_SECONDS=900 # D13b : moins d'appels au site (limites Vercel)",
     block("POLL_SECONDS=60;HEARTBEAT_SECONDS=900 # D13b : moins d'appels au site (limites Vercel)",
           "BUILD_CHECK_SECONDS=600;MT5_BINARIES=('terminal64.exe','MetaEditor64.exe','metatester64.exe')")),
    # New helpers before the child.
    ("def child():", FUNCTIONS),
    # A locked instance folder no longer stops the whole connector (PermissionError 32).
    (block("  folder=STATE/'instances'/key;stop_terminals(folder)", "  remove_instance(folder)"),
     block("  folder=STATE/'instances'/key;stop_terminals(folder)",
           "  try:remove_instance(folder)",
           "  except OSError as e:diagnostic('NETTOYAGE DIFFERE : '+safe_error(e))")),
    # The child retries a folder still held for a few seconds, and copies the template under the template lock.
    (block(" remove_instance(folder)", " shutil.copytree(template['path'],folder);private(folder)"),
     block(" for attempt in range(5):",
           "  try:remove_instance(folder);break",
           "  except PermissionError:",
           "   if attempt==4:raise",
           "   time.sleep(3);stop_terminals(folder)",
           " copy_template(template['path'],folder);private(folder)")),
    (block("  if mt5:mt5.shutdown()", "  stop_terminals(folder)", "  remove_instance(folder)"),
     block("  if mt5:mt5.shutdown()", "  stop_terminals(folder)",
           "  try:remove_instance(folder)", "  except OSError:pass")),
    # Only new or changed trades are sent; a light report keeps the account fresh every 15 minutes.
    ("last_signature=None;last_report_at=0", "last_signature=None;last_report_at=0;sent_marks={}"),
    ("    trades=snapshot.pop('trades')",
     block("    trades=snapshot.pop('trades')",
           "    marks={str(t.get('external_id')):hashlib.sha256(json.dumps(t,sort_keys=True,separators=(',',':'),default=str).encode('utf-8')).hexdigest() for t in trades}",
           "    changed=[t for t in trades if sent_marks.get(str(t.get('external_id')))!=marks[str(t.get('external_id'))]]")),
    ("{'trades':trades,'balance':snapshot.get('balance'),'funding':snapshot.get('funding_summary')}",
     "{'trades':sorted(marks.items()),'balance':snapshot.get('balance'),'funding':snapshot.get('funding')}"),
    ("    for batch in trade_batches(snapshot,trades):", "    for batch in trade_batches(snapshot,changed):"),
    ("+': '+str(len(trades))+' trades ; reception '+snapshot['observed_at'])",
     "+': '+str(len(changed))+' trades nouveaux ou modifies sur '+str(len(trades))+' ; reception '+snapshot['observed_at'])"),
    ("    last_signature=signature;last_report_at=report_now",
     "    last_signature=signature;last_report_at=report_now;sent_marks=marks"),
    # A newer MetaTrader build installed in one instance is copied into every template every 10 minutes.
    # In its own thread: copying a build into ~110 templates takes minutes, polling (the accounts' lease) goes on.
    ("running={};failure_since=None;crashes={};more=False;told=set()",
     "running={};failure_since=None;crashes={};more=False;told=set();last_build_check=0;build_thread=None"),
    ("    diagnostic('SITE JOIGNABLE : '+str(len(jobs))+' connexion(s) demandee(s)')",
     block("    diagnostic('SITE JOIGNABLE : '+str(len(jobs))+' connexion(s) demandee(s)')",
           "    if time.monotonic()-last_build_check>=BUILD_CHECK_SECONDS and not (build_thread and build_thread.is_alive()):",
           "     import threading",
           "     last_build_check=time.monotonic();build_thread=threading.Thread(target=check_mt5_updates,args=(c,),daemon=True);build_thread.start()")),
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
target = source.with_name(source.name + '.d14')
with open(target, 'w', encoding='utf-8', newline='') as handle:
    handle.write(text)
print('host.py.d14 ecrit :', len(text.encode('utf-8')), 'octets ; syntaxe OK')
