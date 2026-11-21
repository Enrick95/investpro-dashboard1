"""InvestPro : lance le connecteur heberge en arriere-plan et le relance s'il s'arrete (D14, D15).

Lance par la tache planifiee InvestProHostedCollector. Le connecteur (host.py run) tourne dans un processus
enfant dont la sortie va dans pool-native-run.log. S'il s'arrete, il est relance apres 1 minute, puis 2, 4 et
au plus 10 minutes s'il s'arrete encore aussitot. Avant chaque demarrage, un connecteur reste ouvert sans
lanceur, ses comptes et les terminaux MetaTrader de ses dossiers d'instance sont arretes : un terminal oublie
bloquait son dossier et arretait le connecteur (PermissionError 32). Rien d'autre sur le PC n'est touche.

D15 (21/11/2026) : surveillance de la file MT5. Si un compte MT5 attend son tour depuis plus de 30 minutes
alors que le connecteur tourne depuis plus de 30 minutes, la file est bloquee (cas du 15/11 20:44 au 21/11 :
plus aucun compte MT5 lu pendant cinq jours). Le connecteur est alors arrete puis relance comme apres un
arret, au plus une fois toutes les 90 minutes. Un ticket ne contient qu'un numero de processus.
"""
import os
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
HOST = BASE / 'host.py'
LOG = BASE / 'pool-native-run.log'
STATE = Path(os.environ.get('LOCALAPPDATA', str(BASE))) / 'InvestProHosted'
QUEUE = STATE / 'mt5-snapshot-queue'
FIRST_DELAY, MAX_DELAY, STABLE = 60, 600, 300
MAX_LOG = 50 * 1024 * 1024
STUCK_AFTER, GRACE, WATCH_EVERY, WATCH_GAP, STOP_WAIT = 30 * 60, 30 * 60, 60, 90 * 60, 60


def say(text):
    try:
        with open(LOG, 'a', encoding='utf-8') as log:
            log.write(time.strftime('%H:%M:%S') + ' | LANCEUR : ' + text + '\n')
    except OSError:
        pass


def rotate_log():
    try:
        if LOG.stat().st_size > MAX_LOG:
            old = LOG.with_name(LOG.name + '.1')
            if old.exists():
                old.unlink()
            LOG.rename(old)
    except OSError:
        pass


def connector_process(args, host=HOST):
    """`host.py run` or `host.py child` of this folder; never `register`, `configure` or anything else."""
    if len(args) < 2 or args[-1] not in ('run', 'child'):
        return False
    target = os.path.normcase(os.path.abspath(str(host)))
    return any(os.path.normcase(os.path.abspath(arg)) == target for arg in args[:-1] if arg.lower().endswith('host.py'))


def instance_process(name, exe, args, instances):
    """A MetaTrader terminal or its WebView started from one of the connector's instance folders."""
    name = (name or '').lower()
    root = os.path.normcase(os.path.abspath(str(instances))).rstrip('\\/')
    if name in ('terminal.exe', 'terminal64.exe'):
        path = os.path.normcase(os.path.abspath(exe)) if exe else ''
        return path.startswith(root + os.sep)
    if name == 'msedgewebview2.exe':
        return any(arg.lower().startswith('--user-data-dir=') and root in os.path.normcase(arg.split('=', 1)[1].strip('"'))
                   for arg in args)
    return False


def cleanup():
    try:
        import psutil
    except ImportError:
        say('nettoyage impossible : psutil absent')
        return
    mine = {os.getpid(), os.getppid()}
    victims = []
    for process in psutil.process_iter(['pid', 'name', 'exe', 'cmdline']):
        try:
            info = process.info
            if info['pid'] in mine:
                continue
            args = info['cmdline'] or []
            name = (info['name'] or '').lower()
            if (name.startswith('python') and connector_process(args)) or instance_process(name, info['exe'], args, STATE / 'instances'):
                victims.append(process)
        except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
            pass
    for process in victims:
        try:
            process.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    psutil.wait_procs(victims, timeout=15)
    if victims:
        say(str(len(victims)) + ' processus restes ouverts arretes avant le demarrage')


def ticket_owner_alive(pid, created):
    try:
        import psutil
        return abs(psutil.Process(pid).create_time() - created) < .01
    except ImportError:
        return False
    except Exception as error:
        return type(error).__name__ == 'AccessDenied'


def stuck_tickets(queue=None, now=None, alive=None):
    """Number of MT5 accounts whose process is alive and has waited more than STUCK_AFTER seconds for its turn."""
    import json
    queue = QUEUE if queue is None else queue
    now = time.time() if now is None else now
    alive = alive or ticket_owner_alive
    try:
        paths = list(Path(queue).glob('*.json'))
    except OSError:
        return 0
    count = 0
    for path in paths:
        try:
            if now - path.stat().st_mtime < STUCK_AFTER:
                continue
            record = json.loads(path.read_text())
            if alive(record['pid'], record['created']):
                count += 1
        except (OSError, ValueError, KeyError, TypeError):
            continue
    return count


def run_connector(env, watch=None):
    """Run host.py until it stops; stop it if the MT5 queue stays blocked. Returns its exit code."""
    watch = watch or stuck_tickets
    global last_watchdog
    started = time.monotonic()
    with open(LOG, 'a', encoding='utf-8') as log:
        process = subprocess.Popen([sys.executable, '-u', str(HOST), 'run'], cwd=str(BASE), env=env,
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
        while True:
            try:
                return process.wait(timeout=WATCH_EVERY)
            except subprocess.TimeoutExpired:
                pass
            now = time.monotonic()
            if now - started < GRACE or (last_watchdog is not None and now - last_watchdog < WATCH_GAP):
                continue
            try:
                blocked = watch()
            except Exception:
                blocked = 0
            if not blocked:
                continue
            last_watchdog = now
            say('file MT5 bloquee : ' + str(blocked) + ' compte(s) en attente depuis plus de ' + str(STUCK_AFTER // 60)
                + ' min ; arret du connecteur pour relance')
            cleanup()
            try:
                return process.wait(timeout=STOP_WAIT)
            except subprocess.TimeoutExpired:
                process.kill()
                return process.wait()


last_watchdog = None


def next_delay(previous, ran):
    return FIRST_DELAY if ran >= STABLE else min(MAX_DELAY, max(FIRST_DELAY, previous * 2))


def main():
    os.chdir(BASE)
    env = dict(os.environ, INVESTPRO_SHOW_TERMINALS='0', PYTHONIOENCODING='utf-8', PYTHONUNBUFFERED='1')
    delay = FIRST_DELAY // 2
    while True:
        started = time.monotonic()
        code = None
        try:
            rotate_log()
            cleanup()
            say('demarrage du connecteur')
            code = run_connector(env)
        except Exception as error:
            say('lancement impossible : ' + type(error).__name__)
        ran = time.monotonic() - started
        delay = next_delay(delay, ran)
        say('connecteur arrete (code ' + str(code) + ') apres ' + str(int(ran)) + ' s ; relance dans ' + str(delay) + ' s')
        time.sleep(delay)


if __name__ == '__main__':
    main()