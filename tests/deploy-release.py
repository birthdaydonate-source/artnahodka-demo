"""Offline tests: no connection or credentials are used."""
import importlib.util
import json
from pathlib import Path, PurePosixPath
import tempfile

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).resolve().parents[1]/'scripts/deploy-release.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class FakeFTP:
    def __init__(self, files):
        self.files = dict(files)
        self.dirs = {'.', 'assets', 'assets/js', 'assets/images'}
        self.writes = []
        self.race = False

    def mlsd(self, directory, facts):
        parent = '' if directory == '.' else directory
        result = {}
        for name in self.dirs | set(self.files):
            p = PurePosixPath(name)
            if str(p.parent).replace('.', '') == parent and p.name != '.':
                result[p.name] = {'type': 'dir' if name in self.dirs else 'file'}
        return result.items()

    def retrbinary(self, command, callback):
        callback(self.files[command[5:]])

    def mkd(self, path):
        self.dirs.add(path)

    def storbinary(self, command, file):
        path = command[5:]
        self.files[path] = file.read()
        self.writes.append(path)
        if self.race:
            self.files['index.html'] = b'concurrent change'

    def rename(self, source, target):
        self.files[target] = self.files.pop(source)

    def delete(self, path):
        assert PurePosixPath(path).name.startswith('.artnahodka-'), 'only owned temporary files may be removed'
        del self.files[path]


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    payload = root/'payload'
    (payload/'assets/js').mkdir(parents=True)
    (payload/'assets/js/vk-pixel.js').write_bytes(b'pixel')
    (payload/'index.html').write_bytes(b'new page')
    files = [('assets/js/vk-pixel.js', None), ('index.html', b'old page')]
    manifest = {'host':'example.test', 'root':'/', 'release':'test', 'files':[
        {'path':name, 'baseline_sha256':deploy.digest(old), 'sha256':deploy.digest((payload/name).read_bytes()), 'size':len((payload/name).read_bytes())} for name, old in files
    ]}
    ftp = FakeFTP({'index.html':b'old page', 'api/order-config.php':b'untouched private config'})
    remote = deploy.Remote(ftp)
    plan = deploy.inspect_release(remote, manifest, payload)
    assert len(plan) == 2 and ftp.writes == [], 'preflight is read-only'
    backup = root/'backup'
    deploy.apply_release(remote, plan, backup, manifest)
    assert ftp.files['index.html'] == b'new page'
    assert ftp.files['api/order-config.php'] == b'untouched private config'
    assert deploy.inspect_release(remote, manifest, payload) == [], 'repeat is idempotent'
    deploy.rollback(remote, backup, manifest, apply=True)
    assert ftp.files['index.html'] == b'old page'
    assert ftp.files['assets/js/vk-pixel.js'] == b'pixel', 'rollback leaves new assets'
    conflict = FakeFTP({'index.html':b'new hosting edit'})
    try:
        deploy.inspect_release(deploy.Remote(conflict), manifest, payload)
        raise AssertionError('must reject changed production file')
    except RuntimeError:
        assert conflict.writes == []
    race = FakeFTP({'index.html':b'old page'})
    race.race = True
    try:
        deploy.Remote(race).replace('index.html', b'new page', deploy.digest(b'old page'))
        raise AssertionError('must reject concurrent edit')
    except RuntimeError:
        assert race.files['index.html'] == b'concurrent change'
        assert not any('.artnahodka-' in name for name in race.files)
print('Deployment dry-run, conflict refusal, backups, idempotence, rollback and concurrent edit protection passed.')
