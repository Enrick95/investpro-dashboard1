"""InvestPro hosted pilot. Windows only. HTTPS outbound; no order execution.
One worker lease, isolated terminal folders, read-only access, no browser secrets.
"""
import os,sys,json,time,uuid,shutil,subprocess,getpass,urllib.request,urllib.error
from pathlib import Path
from datetime import datetime,timezone
BASE=Path(__file__).resolve().parent
STATE=(Path(os.environ.get('LOCALAPPDATA',str(BASE)))/'InvestProHosted').resolve()
SITE='https://investprotrading.fr'
def diagnostic(message):
 print(datetime.now().strftime('%H:%M:%S')+' | '+message,flush=True)

def safe_error(e):
 if isinstance(e,urllib.error.HTTPError):
  reason=''
  try:
   value=json.loads(e.read(2048)).get('error')
   if value in ('unauthorized','worker','another_worker','job','access_removed','snapshot','stale_or_invalid','unavailable'):reason=' '+value
  except Exception:pass
  return 'HTTP '+str(e.code)+reason
 # Print only filesystem filenames and code locations, never arbitrary messages.
 detail=type(e).__name__
 if isinstance(e,OSError):
  if e.errno is not None:detail+=' errno='+str(e.errno)
  if getattr(e,'winerror',None) is not None:detail+=' winerror='+str(e.winerror)
  for label in ('filename','filename2'):
   value=getattr(e,label,None)
   if value is not None:detail+=' ; '+label+'='+json.dumps(str(value),ensure_ascii=True)
 tb=e.__traceback__
 while tb is not None:
  if Path(tb.tb_frame.f_code.co_filename).name=='host.py':
   detail+=' ; '+tb.tb_frame.f_code.co_name+':'+str(tb.tb_lineno)
  tb=tb.tb_next
 return detail

class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None

def private(path):
 path.mkdir(parents=True,exist_ok=True)
 import win32api,win32security,win32con
 token=win32security.OpenProcessToken(win32api.GetCurrentProcess(),win32con.TOKEN_QUERY)
 sid=win32security.GetTokenInformation(token,win32security.TokenUser)[0]
 acl=win32security.ACL();acl.AddAccessAllowedAceEx(win32security.ACL_REVISION,3,win32con.GENERIC_ALL,sid)
 win32security.SetNamedSecurityInfo(str(path),win32security.SE_FILE_OBJECT,win32security.DACL_SECURITY_INFORMATION|win32security.PROTECTED_DACL_SECURITY_INFORMATION,None,None,acl,None)

def settings():
 import win32crypt
 return json.loads(win32crypt.CryptUnprotectData((STATE/'config.dpapi').read_bytes(),None,None,None,0)[1])

def api(config,payload):
 payload=dict(payload,worker=config['worker'])
 req=urllib.request.Request(SITE+'/api/metasync/hosted/worker',data=json.dumps(payload,allow_nan=False).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+config['token']},method='POST')
 with urllib.request.build_opener(NoRedirect).open(req,timeout=20) as r:return json.load(r)

def save_config(c):
 import win32crypt
 (STATE/'config.dpapi').write_bytes(win32crypt.CryptProtectData(json.dumps(c).encode(),'InvestPro Hosted',None,None,None,0))

def configure():
 private(STATE)
 try:c=settings()
 except FileNotFoundError:c={'worker':str(uuid.uuid4()),'max_accounts':3,'templates':{}}
 print('Configuration administrateur du PC. Aucun membre ne fait cette installation.')
 token=getpass.getpass('METASYNC_HOSTED_WORKER_TOKEN (64 caracteres hex, vide pour conserver) : ').strip()
 if token:c['token']=token
 if len(c.get('token',''))!=64 or any(v not in '0123456789abcdef' for v in c['token']):raise ValueError('token')
 save_config(c);print('Configuration protegee enregistree.')

def register():
 c=settings();private(STATE/'templates')
 name=input('ID du broker (ex: puprime-mt4-live5) : ').strip()
 import re
 if not re.fullmatch('[a-z0-9-]{1,60}',name):raise ValueError('id')
 platform=input('Plateforme MT4 ou MT5 : ').strip().upper()
 if platform not in ('MT4','MT5'):raise ValueError('platform')
 install=Path(input('Dossier installation terminal (pas le fichier exe) : ').strip().strip('"'))
 data=Path(input('Dossier des donnees (Fichier > Ouvrir le dossier des donnees) : ').strip().strip('"'))
 server=input('Nom EXACT du serveur : ').strip()
 symbol=input('Symbole disponible pour ouvrir le graphique (ex EURUSD, respecter suffixe) : ').strip()
 for value in (server,symbol):
  if not value or any(ord(x)<32 for x in value):raise ValueError('value')
 dest=STATE/'templates'/name
 if dest.exists():raise ValueError('Template deja existant : utiliser un nouvel ID pour une mise a jour.')
 private(dest)
 # Copy binaries only; never accounts.dat, profiles, passwords, user EAs or saved logs.
 for file in install.iterdir():
  if file.is_file() and file.suffix.lower() in ('.exe','.dll'):shutil.copy2(file,dest/file.name)
 exe='terminal.exe' if platform=='MT4' else 'terminal64.exe'
 if not (dest/exe).exists():raise ValueError('terminal absent')
 (dest/'config').mkdir(exist_ok=True)
 if platform=='MT4':
  srv=data/'config'/(server+'.srv')
  if not srv.exists():raise ValueError('Fichier serveur .srv introuvable dans config. Verifier le serveur.')
  shutil.copy2(srv,dest/'config'/srv.name)
  experts=dest/'MQL4'/'Experts';experts.mkdir(parents=True)
  shutil.copy2(BASE/'InvestProHostedMT4.mq4',experts/'InvestProHostedMT4.mq4')
  editor=dest/'metaeditor.exe'
  if not editor.exists():raise ValueError('MetaEditor absent')
  subprocess.run([str(editor),'/portable','/compile:'+str(experts/'InvestProHostedMT4.mq4'),'/log:'+str(dest/'compile.log')],timeout=120,check=False)
  if not (experts/'InvestProHostedMT4.ex4').exists():raise ValueError('Compilation MT4 non confirmee : consulter compile.log')
 else:
  source=data/'config'/'servers.dat'
  if source.exists():shutil.copy2(source,dest/'config'/'servers.dat')
 c['templates'][name]={'platform':platform,'server':server,'symbol':symbol,'path':str(dest)}
 save_config(c);print('Modele enregistre. Ajouter cet ID dans METASYNC_HOSTED_BROKERS, puis tester avant ouverture.')

def stop_terminals(folder):
 import psutil
 for p in psutil.process_iter(['pid','exe']):
  try:
   exe=p.info['exe']
   if exe and Path(exe).resolve().is_relative_to(folder.resolve()):p.kill();p.wait(timeout=10)
  except (psutil.NoSuchProcess,psutil.AccessDenied,psutil.TimeoutExpired):pass

def remove_instance(folder):
 # Windows Store Python + WebView caches can exceed legacy MAX_PATH.
 # Missing cache files during removal are harmless; other errors remain visible.
 target=os.path.abspath(os.fspath(folder))
 if os.name=='nt' and not target.startswith('\\\\?\\'):
  target=('\\\\?\\UNC\\'+target[2:]) if target.startswith('\\\\') else ('\\\\?\\'+target)
 def onerror(function,path,exc_info):
  if isinstance(exc_info[1],FileNotFoundError):return
  raise exc_info[1]
 try:shutil.rmtree(target,onerror=onerror)
 except FileNotFoundError:pass

def fresh_lease():
 try:return time.time()-(STATE/'lease').stat().st_mtime<75
 except OSError:return False

def disable_mt5_mcp(folder):
 # Only called with this hosted terminal stopped. Preserve unrelated settings.
 import re
 config=folder/'config';config.mkdir(exist_ok=True)
 path=config/'assistant.ini'
 raw=path.read_bytes() if path.exists() else b''
 if raw.startswith((b'\xff\xfe',b'\xfe\xff')):encoding='utf-16'
 elif raw.startswith(b'\xef\xbb\xbf'):encoding='utf-8-sig'
 elif b'\x00' in raw[:200]:encoding='utf-16-le'
 else:
  try:raw.decode('utf-8');encoding='utf-8'
  except UnicodeDecodeError:encoding='mbcs' if os.name=='nt' else 'cp1252'
 value=raw.decode(encoding) if raw else ''
 lines=value.splitlines(keepends=True)
 newline='\r\n' if '\r\n' in value or not value else '\n'
 targets={'mcp.metatrader','mcp.metaeditor'};seen=set();section=None;enabled=False;out=[]
 for line in lines:
  header=re.match(r'^\s*\[([^\]]+)\]',line)
  if header:
   if section in targets and not enabled:out.append('Enable=0'+newline)
   section=header.group(1).strip().lower();enabled=False
   if section in targets:seen.add(section)
  if section in targets and re.match(r'^\s*Enable\s*=',line,re.I):
   out.append('Enable=0'+newline);enabled=True
  else:out.append(line if line.endswith(('\n','\r')) else line+newline)
 if section in targets and not enabled:out.append('Enable=0'+newline)
 for name in ('MCP.MetaTrader','MCP.MetaEditor'):
  if name.lower() not in seen:out.extend([newline+'['+name+']'+newline,'Enable=0'+newline])
 encoded=''.join(out).encode(encoding if raw else 'utf-16')
 if encoded!=raw:
  temp=config/'assistant.ini.investpro-tmp';temp.write_bytes(encoded);os.replace(temp,path)


class MT5InitializationError(RuntimeError):
 def __init__(self,code):
  super().__init__('MT5 initialization failed')
  self.code=code


def snapshot_mt5(mt5,job,folder):
 from normalize import normalize
 from capital import funding_mt5
 from mt5_exit_evidence import read_export,enrich_trades,price_steps
 a=job['investpro_mt_connections']
 if not mt5.initialize(str(folder/'terminal64.exe'),login=int(a['login']),password=job['password'],server=a['server'],timeout=180000,portable=True):
  error=mt5.last_error()
  code=error[0] if isinstance(error,(tuple,list)) and error and isinstance(error[0],int) else 'inconnu'
  labels={-6:'AUTHENTIFICATION REFUSEE : verifier numero, serveur et mot de passe',-10005:'DELAI DEPASSE entre Python et le terminal',-10003:'INITIALISATION IPC IMPOSSIBLE',-10001:'ENVOI IPC IMPOSSIBLE',-10002:'RECEPTION IPC IMPOSSIBLE',-5:'VERSION MT5 INCOMPATIBLE'}
  diagnostic('MT5 INITIALISATION compte ...'+str(a['login'])[-4:]+' : code '+str(code)+' ; '+labels.get(code,'ECHEC TECHNIQUE'))
  raise MT5InitializationError(code)
 info=mt5.account_info();terminal=mt5.terminal_info()
 identity=lambda x:(str(x.login),x.server,x.currency)
 cent_to_usd=info is not None and info.currency=='USC' and a['currency']=='USD'
 expected=(a['login'],a['server'],'USC' if cent_to_usd else a['currency'])
 problems=[]
 if info is None:problems.append('informations du compte absentes')
 if terminal is None:problems.append('informations du terminal absentes')
 if terminal is not None:
  if not terminal.connected:problems.append('terminal non connecte au broker')
  if Path(terminal.data_path).resolve()!=folder.resolve():problems.append('dossier du terminal different de l instance demandee')
 if info is not None:
  if str(info.login)!=a['login']:problems.append('numero de compte different : attendu ...'+str(a['login'])[-4:]+' ; recu ...'+str(info.login)[-4:])
  if info.server!=a['server']:problems.append('serveur different : attendu '+json.dumps(str(a['server'])[:128],ensure_ascii=True)+' ; recu '+json.dumps(str(info.server)[:128],ensure_ascii=True))
  if info.currency!=expected[2]:problems.append('devise differente : attendue '+json.dumps(str(a['currency'])[:16],ensure_ascii=True)+' ; recue '+json.dumps(str(info.currency)[:16],ensure_ascii=True))
  if info.trade_allowed and not job.get('allow_trading_password',False):problems.append('mot de passe principal non autorise pour cette connexion sur le site')
 if problems:
  for problem in problems:diagnostic('MT5 CONTROLE : '+problem)
  raise RuntimeError('identity or credential permission')
 # Extend the query window to include recent deals with broker clock offsets.
 history_end=datetime.fromtimestamp(time.time()+86400,timezone.utc)
 deals=mt5.history_deals_get(datetime(1970,1,1,tzinfo=timezone.utc),history_end)
 positions=mt5.positions_get()
 after=mt5.account_info()
 if deals is None or positions is None or after is None or identity(after)!=expected or abs(after.balance-info.balance)>0.000001:raise RuntimeError('history')
 raw_deals=[d._asdict() for d in deals]
 open_ids={str(p.identifier) for p in positions}
 trades,warnings=normalize(raw_deals,open_ids)
 # Optional exact closing SLs from the read-only MQL5 expert. Failure or missing
 # coverage leaves the original monetary history and classification unchanged.
 try:
  evidence=read_export(folder,after)
  if evidence:
   trades=enrich_trades(trades,raw_deals,open_ids,evidence,price_steps(mt5,{t['symbol'] for t in trades}))
 except Exception:
  diagnostic('MT5 PREUVE SL INDISPONIBLE : montants synchronises sans classement BE automatique')
 diagnostic('MT5 compte ...'+str(a['login'])[-4:]+': '+str(len(deals))+' executions lues, '+str(len(trades))+' trades fermes, '+str(len(positions))+' positions ouvertes, '+str(len(warnings))+' avertissements')
 if trades:
  latest=max(trades,key=lambda t:t['trade_date'])
  diagnostic('Dernier trade prepare: '+latest['external_id']+' ; date brute '+latest['trade_date'])
 funding=funding_mt5(after.balance,[d._asdict() for d in deals])
 balance=after.balance;equity=after.equity
 if cent_to_usd:
  balance=balance/100;equity=equity/100
  # Normalization has already summed profit, commission, swap and fees in USC.
  trades=[dict(t,result_amount=round(t['result_amount']/100,8)) for t in trades]
  funding=dict(funding)
  for key in ('inflows','outflows','reference_balance'):
   funding[key]=round(funding[key]/100,8)
  warnings=list(warnings)+['Compte USC : montants convertis en USD (100 USC = 1 USD). Prix et volumes inchanges.']
  diagnostic('MT5 COMPTE CENT : conversion USC vers USD appliquee aux montants (division par 100)')
 return dict(platform='MT5',login=a['login'],server=a['server'],currency=a['currency'],balance=balance,equity=equity,observed_at=datetime.now(timezone.utc).isoformat(),warnings=warnings,trades=trades,funding=funding)


def safe_ini(value):
 value=str(value)
 if any(ord(x)<32 for x in value):raise ValueError('Invalid configuration value')
 return value

def mt4_diagnostic(folder,reason):
 # Only fixed labels leave the journal parser: never raw logs, logins or passwords.
 diagnostic('MT4 DIAGNOSTIC : '+reason)
 labels=set();files_seen=0
 rules={
  'authorization failed':'AUTHENTIFICATION REFUSEE',
  'invalid account':'COMPTE REFUSE',
  'invalid password':'MOT DE PASSE REFUSE',
  'no connection':'PAS DE CONNEXION BROKER',
  'connection failed':'CONNEXION BROKER ECHOUEE',
  'authorized':'MENTION AUTORISATION DANS LE JOURNAL',
  'login failed':'CONNEXION AU COMPTE REFUSEE',
  'cannot open':'OUVERTURE DE FICHIER OU GRAPHIQUE IMPOSSIBLE',
  'cannot load':'CHARGEMENT IMPOSSIBLE',
  'unknown symbol':'SYMBOLE INCONNU',
  'invalid symbol':'SYMBOLE INVALIDE',
  'initialization failed':'INITIALISATION EXPERT ECHOUEE',
  'liveupdate:':'MISE A JOUR AUTOMATIQUE DU TERMINAL',
  'initialized':'MENTION INITIALISATION DANS LE JOURNAL',
  'investprohostedmt4':'EXPERT INVESTPRO MENTIONNE DANS LE JOURNAL',
 }
 for directory in (folder/'logs',folder/'MQL4'/'Logs'):
  try:
   files=sorted(directory.glob('*.log'),key=lambda p:p.stat().st_mtime)[-2:]
   for file in files:
    with file.open('rb') as stream:
     stream.seek(0,2);size=stream.tell();stream.seek(max(0,size-131072)//2*2)
     raw=stream.read(131072)
    files_seen+=1
    encoding='utf-16-le' if raw.startswith(b'\xff\xfe') or b'\x00' in raw[:200] else ('mbcs' if os.name=='nt' else 'cp1252')
    value=raw.decode(encoding,errors='replace').lower()
    labels.update(label for phrase,label in rules.items() if phrase in value)
  except OSError:
   labels.add('JOURNAL TEMPORAIREMENT INACCESSIBLE')
 diagnostic('MT4 JOURNAUX : '+str(files_seen)+' fichier(s) ; '+(' ; '.join(sorted(labels)) if labels else 'aucun indice reconnu'))
 diagnostic('MT4 EXPORT : '+('present' if (folder/'MQL4'/'Files'/'investpro.json').exists() else 'absent'))


def mt4_update_finished(folder):
 # A completed updater can relaunch a new PID without the startup EA settings.
 # Inspect only local terminal logs; never expose their contents.
 for file in (folder/'logs').glob('*.log'):
  try:
   with file.open('rb') as stream:
    stream.seek(0,2);size=stream.tell();stream.seek(max(0,size-262144)//2*2)
    raw=stream.read(262144)
   encoding='utf-16-le' if raw.startswith(b'\xff\xfe') or b'\x00' in raw[:200] else ('mbcs' if os.name=='nt' else 'cp1252')
   value=raw.decode(encoding,errors='replace').lower()
   if 'liveupdate: updater - finished for portable' in value:
    return True
  except OSError:pass
 return False


def clear_mt4_start(folder):
 for file in (folder/'start.ini',folder/'config'/'investpro-start.ini'):
  file.unlink(missing_ok=True)


def prepare_mt4(job,template,folder):
 a=job['investpro_mt_connections']
 required=(folder/'terminal.exe',folder/'MQL4'/'Experts'/'InvestProHostedMT4.ex4')
 for file in required:
  if not file.is_file():
   diagnostic('MT4 MODELE INCOMPLET : '+file.name)
   raise FileNotFoundError(2,'Required MT4 file missing',str(file))
 # Strict Windows ANSI encoding: do not silently replace password characters.
 encoding='mbcs' if os.name=='nt' else 'cp1252'
 def encoded(values):
  return ('\r\n'.join(f'{k}={safe_ini(v)}' for k,v in values.items())+'\r\n').encode(encoding,errors='strict')
 params={'ExpectedLogin':a['login'],'ExpectedServer':a['server'],'ExpectedCurrency':a['currency'],'AllowTradingPassword':'true' if job.get('allow_trading_password',False) else 'false'}
 config={'Login':a['login'],'Password':job['password'],'Server':a['server'],'AutoConfiguration':'true','EnableNews':'false','EnableDDE':'false','ExpertsEnable':'true','ExpertsDllImport':'false','ExpertsExpImport':'false','ExpertsTrades':'false','Symbol':template['symbol'],'Period':'H1','Expert':'InvestProHostedMT4','ExpertParameters':'investpro.set'}
 try:params_bytes=encoded(params);config_bytes=encoded(config)
 except UnicodeEncodeError:
  diagnostic('MT4 CONFIGURATION : caractere non representable dans le codage Windows ; aucune substitution effectuee')
  raise
 presets=folder/'MQL4'/'Presets';presets.mkdir(parents=True,exist_ok=True)
 (presets/'investpro.set').write_bytes(params_bytes)
 (folder/'config').mkdir(exist_ok=True)
 start=folder/'config'/'investpro-start.ini'
 # Restricted folder ACL; removed after first export or on failure/shutdown.
 start.write_bytes(config_bytes)
 diagnostic('MT4 LANCEMENT D5 : configuration relative, mode portable ; export attendu')
 return subprocess.Popen([str(folder/'terminal.exe'),r'config\investpro-start.ini','/portable'],cwd=str(folder),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def child():
 config=settings();job=json.loads(sys.stdin.readline());a=job['investpro_mt_connections'];template=config['templates'][job['broker_id']]
 diagnostic('PREPARATION '+a['platform']+' compte ...'+str(a['login'])[-4:])
 if (template['platform'],template['server'])!=(a['platform'],a['server']):raise ValueError('template mismatch')
 folder=STATE/'instances'/job['id'];private(folder.parent)
 stop_terminals(folder)
 diagnostic('COPIE DU MODELE '+a['platform']+' compte ...'+str(a['login'])[-4:])
 remove_instance(folder)
 shutil.copytree(template['path'],folder);private(folder)
 report=lambda status,snapshot=None:api(config,{'action':'report','id':job['id'],'generation':job['generation'],'status':status,'snapshot':snapshot})
 mt5=None
 try:
  diagnostic('CONNEXION '+a['platform']+' compte ...'+str(a['login'])[-4:])
  report('connecting')
  terminal_process=None
  if a['platform']=='MT4':terminal_process=prepare_mt4(job,template,folder)
  else:
   disable_mt5_mcp(folder)
   diagnostic('MT5 MCP DESACTIVE compte ...'+str(a['login'])[-4:])
   try:
    from mt5_exit_evidence import prepare_bridge
    terminal_process=prepare_bridge(BASE,folder,STATE/'instances',a,template['symbol'])
    diagnostic('MT5 PREUVE SL : expert de lecture seule prepare')
   except Exception:
    diagnostic('MT5 PREUVE SL INDISPONIBLE : synchronisation habituelle conservee ; aucun BE suppose')
   import MetaTrader5 as mt5
  last=0;started=time.monotonic();last_stamp=None;failures=0;mt4_update_restarted=False;retry_at=None;recoveries=0
  while fresh_lease():
   if failures>=3:
    if retry_at is None or time.monotonic()<retry_at:
     time.sleep(2);continue
    if not memory_allows_start():
     retry_at=time.monotonic()+300;continue
    disable_mt5_mcp(folder)
    try:
     from mt5_exit_evidence import restart_bridge
     terminal_process=restart_bridge(folder,STATE/'instances')
    except Exception:
     diagnostic('MT5 PREUVE SL : reprise habituelle sans expert ; aucun BE suppose')
    failures=0;retry_at=None
    diagnostic('MT5 REPRISE compte ...'+str(a['login'])[-4:]+' : nouvelle tentative apres pause')
   if time.monotonic()-last<30:time.sleep(1);continue
   last=time.monotonic()
   try:
    if a['platform']=='MT5':snapshot=snapshot_mt5(mt5,job,folder)
    else:
     file=folder/'MQL4'/'Files'/'investpro.json'
     if not file.exists():
      elapsed=int(time.monotonic()-started)
      # The initial PID exiting is normal during LiveUpdate. Give the updater
      # time to finish, then restart once with the original read-only EA config.
      if elapsed>=60 and not mt4_update_restarted and mt4_update_finished(folder):
       diagnostic('MT4 MISE A JOUR TERMINEE : relance du terminal avec la configuration InvestPro')
       mt4_update_restarted=True
       stop_terminals(folder)
       terminal_process=prepare_mt4(job,template,folder)
       started=time.monotonic()
       continue
      if elapsed>180:
       mt4_diagnostic(folder,'aucun export apres 180 secondes')
       failures=3
       stop_terminals(folder);clear_mt4_start(folder)
       diagnostic('MT4 ARRETE : connexion a verifier ; transmettre les lignes MT4 DIAGNOSTIC et MT4 JOURNAUX')
       report('error')
      else:
       diagnostic('MT4 ATTENTE EXPORT : '+str(elapsed)+' secondes / 180')
      continue
     if time.time()-file.stat().st_mtime>90 or file.stat().st_size>20000000:raise RuntimeError('stale export')
     snapshot=json.loads(file.read_text(encoding='utf-8-sig'))
     clear_mt4_start(folder)
     if snapshot['observed_at']==last_stamp:continue
    if (snapshot['login'],snapshot['server'],snapshot['currency'],snapshot['platform'])!=(a['login'],a['server'],a['currency'],a['platform']):raise RuntimeError('identity')
    trades=snapshot.pop('trades')
    from mt5_exit_evidence import trade_batches
    for batch in trade_batches(snapshot,trades):
     if not fresh_lease():return
     report('syncing',dict(snapshot,trades=batch))
    diagnostic('ENVOI ACCEPTE '+a['platform']+' compte ...'+str(a['login'])[-4:]+': '+str(len(trades))+' trades ; reception '+snapshot['observed_at'])
    last_stamp=snapshot['observed_at'];failures=0
   except urllib.error.HTTPError as e:
    diagnostic('ENVOI REFUSE '+a['platform']+' compte ...'+str(a['login'])[-4:]+': '+safe_error(e))
    if e.code in (401,409):return
   except Exception as e:
    diagnostic('LECTURE/ENVOI '+a['platform']+' compte ...'+str(a['login'])[-4:]+': '+safe_error(e))
    failures+=1
    if isinstance(e,MT5InitializationError) and e.code==-6:
     failures=3
     diagnostic('MT5 COMPTE A VERIFIER ...'+str(a['login'])[-4:]+' : authentification refusee ; corriger la connexion sur le site puis relancer si necessaire')
    if failures>=3:
     if a['platform']=='MT4':mt4_diagnostic(folder,'trois echecs de lecture ou envoi')
     if mt5:mt5.shutdown()
     stop_terminals(folder);clear_mt4_start(folder)
     if isinstance(e,MT5InitializationError) and e.code in (-10000,-10001,-10002,-10003,-10005) and recoveries<2:
      recoveries+=1;retry_at=time.monotonic()+300
      diagnostic('MT5 PAUSE compte ...'+str(a['login'])[-4:]+' : reprise dans 5 minutes ('+str(recoveries)+'/2)')
     elif a['platform']=='MT5':
      diagnostic('MT5 ARRETE compte ...'+str(a['login'])[-4:]+' : verification necessaire')
    try:report('error')
    except urllib.error.HTTPError as e:
     if e.code in (401,409):return
    except Exception:pass
   finally:
    if mt5:mt5.shutdown()
 finally:
  if mt5:mt5.shutdown()
  stop_terminals(folder)
  remove_instance(folder)

def memory_allows_start():
 import ctypes
 class MemoryStatus(ctypes.Structure):
  _fields_=[('length',ctypes.c_ulong),('load',ctypes.c_ulong)]+[(name,ctypes.c_ulonglong) for name in ('total','available','page_total','page_available','virtual_total','virtual_available','extended')]
 value=MemoryStatus();value.length=ctypes.sizeof(value)
 if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(value)):
  diagnostic('DEMARRAGE DIFFERE : mesure memoire indisponible')
  return False
 if value.load>=90 or value.available<2*1024**3:
  diagnostic('DEMARRAGE DIFFERE : memoire '+str(value.load)+'% ; disponible '+str(round(value.available/1024**3,1))+' Go')
  return False
 return True

def run():
 import win32event,win32api,winerror
 mutex=win32event.CreateMutex(None,False,'Local\\InvestProHosted')
 if win32api.GetLastError()==winerror.ERROR_ALREADY_EXISTS:raise RuntimeError('Un hebergeur tourne deja.')
 c=settings();c['max_accounts']=50;private(STATE/'instances');running={};failure_since=None;crashes={}
 stop_terminals(STATE/'instances')
 def stop(key):
  p,_=running.pop(key);p.terminate()
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait()
  folder=STATE/'instances'/key;stop_terminals(folder)
  remove_instance(folder)
 try:
  print('InvestPro D10 - MCP desactive ; delai MT5 60s ; plafond 50 comptes ; protection memoire. Ctrl+C pour arreter.',flush=True)
  while True:
   try:
    jobs=api(c,{'action':'poll'})['jobs'];failure_since=None;(STATE/'lease').touch()
    diagnostic('SITE JOIGNABLE : '+str(len(jobs))+' connexion(s) demandee(s)')
    desired={j['id']:j for j in jobs}
    for key,(p,generation) in list(running.items()):
     if p.poll() is not None:crashes[(key,generation)]=crashes.get((key,generation),0)+1
     if key not in desired or desired[key]['generation']!=generation or p.poll() is not None:stop(key)
    for j in jobs:
     if j['id'] in running:continue
     template=c['templates'].get(j['broker_id'])
     status='error' if not template or crashes.get((j['id'],j['generation']),0)>=3 else 'capacity' if len(running)>=c['max_accounts'] else None
     if status:
      diagnostic('DEMARRAGE BLOQUE compte ...'+str(j['investpro_mt_connections']['login'])[-4:]+': '+status+' ; modele absent='+str(not bool(template)))
      api(c,{'action':'report','id':j['id'],'generation':j['generation'],'status':status});continue
     if not memory_allows_start():break
     p=subprocess.Popen([sys.executable,'-u',str(BASE/'host.py'),'child'],stdin=subprocess.PIPE,stdout=None,stderr=subprocess.DEVNULL,text=True)
     p.stdin.write(json.dumps(j)+'\n');p.stdin.close();running[j['id']]=(p,j['generation'])
     break # At most one new terminal per polling cycle; maintain worker lease.
   except Exception as e:
    diagnostic('BOUCLE HEBERGEUR : '+safe_error(e))
    failure_since=failure_since or time.monotonic()
    print('Serveur indisponible ou configuration a verifier. Nouvelle tentative.',flush=True)
    if time.monotonic()-failure_since>60:
     (STATE/'lease').unlink(missing_ok=True)
     for key in list(running):stop(key)
   time.sleep(15)
 finally:
  (STATE/'lease').unlink(missing_ok=True)
  for key in list(running):stop(key)
  win32api.CloseHandle(mutex)

if __name__=='__main__':
 try:
  if sys.platform!='win32':raise RuntimeError('Windows requis')
  {'configure':configure,'register':register,'run':run,'child':child}[sys.argv[1] if len(sys.argv)>1 else 'run']()
 except KeyboardInterrupt:print('Arrete.')
 except Exception as e:diagnostic('ARRET : '+safe_error(e));sys.exit(1)
