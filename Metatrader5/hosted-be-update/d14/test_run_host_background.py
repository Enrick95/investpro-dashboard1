import importlib.util, unittest
spec = importlib.util.spec_from_file_location('w', __import__('pathlib').Path(__file__).with_name('run_host_background.py')); w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
class T(unittest.TestCase):
    def test_connector(self):
        host = '/x/WINDOWS/host.py'
        self.assertTrue(w.connector_process(['/venv/python.exe', '-u', host, 'run'], host))
        self.assertTrue(w.connector_process(['/venv/python.exe', '-u', host, 'child'], host))
        self.assertFalse(w.connector_process(['/venv/python.exe', host, 'register'], host))
        self.assertFalse(w.connector_process(['/venv/python.exe', '/x/WINDOWS/run_host_background.py'], host))
        self.assertFalse(w.connector_process(['/venv/python.exe', '/other/host.py', 'run'], host))
        self.assertFalse(w.connector_process([], host))
    def test_instances(self):
        inst = '/state/instances'
        self.assertTrue(w.instance_process('terminal64.exe', '/state/instances/abc/terminal64.exe', [], inst))
        self.assertTrue(w.instance_process('TERMINAL.EXE', '/state/instances/abc/terminal.exe', [], inst))
        self.assertFalse(w.instance_process('terminal64.exe', '/state/templates/abc/terminal64.exe', [], inst))
        self.assertFalse(w.instance_process('terminal64.exe', '/state/instances-old/abc/terminal64.exe', [], inst))
        self.assertFalse(w.instance_process('terminal64.exe', None, [], inst))
        self.assertTrue(w.instance_process('msedgewebview2.exe', '/pf/edge/msedgewebview2.exe', ['x', '--user-data-dir="/state/instances/abc/webview"'], inst))
        self.assertFalse(w.instance_process('msedgewebview2.exe', '/pf/edge/msedgewebview2.exe', ['--user-data-dir=/home/u/edge'], inst))
        self.assertFalse(w.instance_process('chrome.exe', '/state/instances/abc/chrome.exe', [], inst))
    def test_delay(self):
        self.assertEqual(w.next_delay(30, 10), 60)
        self.assertEqual(w.next_delay(60, 10), 120)
        self.assertEqual(w.next_delay(480, 10), 600)
        self.assertEqual(w.next_delay(600, 10), 600)
        self.assertEqual(w.next_delay(600, 3600), 60)
unittest.main(verbosity=1)
