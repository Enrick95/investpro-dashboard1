"""InvestPro : lance le connecteur heberge en arriere-plan et le relance s'il s'arrete (D14).

Lance par la tache planifiee InvestProHostedCollector. Le connecteur (host.py run) tourne dans un processus
enfant dont la sortie va dans pool-native-run.log. S'il s'arrete, il est relance apres 1 minute, puis 2, 4 et
au plus 10 minutes s'il s'arrete encore aussitot. Avant chaque demarrage, un connecteur reste ouvert sans
lanceur, ses comptes et les terminaux MetaTrader de ses dossiers d'instance sont arretes : un terminal oublie
bloquait son dossier et arretait le connecteur (PermissionError 32). Rien d'autre sur le PC n'est touche.
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
FIRST_DELAY, MAX_DELAY, STABLE = 60, 600, 300
MAX_LOG = 50 * 1024 * 1024


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
            with open(LOG, 'a', encoding='utf-8') as log:
                code = subprocess.call([sys.executable, '-u', str(HOST), 'run'], cwd=str(BASE), env=env,
                                       stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
        except Exception as error:
            say('lancement impossible : ' + type(error).__name__)
        ran = time.monotonic() - started
        delay = next_delay(delay, ran)
        say('connecteur arrete (code ' + str(code) + ') apres ' + str(int(ran)) + ' s ; relance dans ' + str(delay) + ' s')
        time.sleep(delay)


if __name__ == '__main__':
    main()
