#!/usr/bin/env python3
"""FTPS deployment of an explicitly listed release. Default is read-only."""
import argparse
import datetime as dt
import ftplib
import getpass
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import ssl
import sys
import uuid


def digest(data):
    return hashlib.sha256(data).hexdigest() if data is not None else None


def safe_path(value):
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or str(path) != value:
        raise ValueError('Недопустимый путь: ' + value)
    if not (value in ('index.html', 'messenger.html', 'sitemap.xml') or value.startswith(('assets/images/family-20260929/', 'assets/images/caricatures-20260929/', 'articles/', 'assets/js/', 'assets/css/'))):
        raise ValueError('Путь вне разрешённых каталогов: ' + value)
    return value


class Remote:
    def __init__(self, ftp):
        self.ftp = ftp
        self.directories = {}

    def clear(self):
        self.directories.clear()

    def listing(self, directory):
        if directory not in self.directories:
            self.directories[directory] = dict(self.ftp.mlsd(directory or '.', facts=['type']))
        return self.directories[directory]

    def exists(self, path):
        parts = PurePosixPath(path).parts
        parent = ''
        for number, part in enumerate(parts):
            entry = self.listing(parent).get(part)
            if entry is None:
                return False
            expected = 'file' if number == len(parts)-1 else 'dir'
            if entry.get('type') != expected:
                raise RuntimeError('Неожиданный тип объекта на сервере: ' + path)
            parent = str(PurePosixPath(parent) / part)
        return True

    def read(self, path):
        if not self.exists(path):
            return None
        output = io.BytesIO()
        self.ftp.retrbinary('RETR ' + path, output.write)
        return output.getvalue()

    def mkdirs(self, path):
        parent = ''
        for part in PurePosixPath(path).parent.parts:
            entry = self.listing(parent).get(part)
            next_parent = str(PurePosixPath(parent) / part)
            if entry is None:
                self.ftp.mkd(next_parent)
                self.clear()
            elif entry.get('type') != 'dir':
                raise RuntimeError('Вместо каталога существует другой объект: ' + next_parent)
            parent = next_parent

    def replace(self, path, data, expected):
        self.clear()
        if digest(self.read(path)) != expected:
            raise RuntimeError('Файл изменился после проверки: ' + path)
        self.mkdirs(path)
        temporary = str(PurePosixPath(path).with_name('.artnahodka-' + uuid.uuid4().hex + '.tmp'))
        created = False
        try:
            self.ftp.storbinary('STOR ' + temporary, io.BytesIO(data))
            created = True
            self.clear()
            if digest(self.read(temporary)) != digest(data):
                raise RuntimeError('Проверка загруженного файла не прошла: ' + path)
            self.clear()
            if digest(self.read(path)) != expected:
                raise RuntimeError('Файл изменился во время загрузки: ' + path)
            # Never delete the old target: servers without rename-overwrite stop safely.
            self.ftp.rename(temporary, path)
            created = False
            self.clear()
            if digest(self.read(path)) != digest(data):
                raise RuntimeError('Проверка после переименования не прошла: ' + path)
        finally:
            if created:
                try:
                    self.ftp.delete(temporary)
                except ftplib.all_errors:
                    pass
            self.clear()


def inspect_release(remote, manifest, payload):
    plan, conflicts = [], []
    for entry in manifest['files']:
        path = safe_path(entry['path'])
        data = (payload/path).read_bytes()
        if digest(data) != entry['sha256'] or len(data) != entry['size']:
            raise RuntimeError('Повреждён локальный файл обновления: ' + path)
        previous = remote.read(path)
        current = digest(previous)
        if current == entry['sha256']:
            continue
        if current != entry['baseline_sha256']:
            conflicts.append(path)
        else:
            plan.append((entry, data, previous))
    if conflicts:
        raise RuntimeError('На хостинге обнаружены изменения. Ничего не загружено. Сначала нужна повторная сверка:\n' + '\n'.join(conflicts))
    return plan


def save_journal(directory, journal):
    temporary = directory/'journal.new.json'
    temporary.write_text(json.dumps(journal, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(directory/'journal.json')


def apply_release(remote, plan, directory, manifest):
    directory.mkdir(parents=True, exist_ok=False, mode=0o700)
    journal = {'host': manifest['host'], 'root': manifest['root'], 'release': manifest['release'], 'files': []}
    for entry, data, previous in plan:
        if previous is not None:
            backup = directory/'originals'/entry['path']
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_bytes(previous)
        journal['files'].append({'path': entry['path'], 'before': digest(previous), 'after': digest(data), 'started': False, 'completed': False})
    save_journal(directory, journal)
    print('Резервная копия:', directory)
    for (entry, data, _), item in zip(plan, journal['files']):
        item['started'] = True
        save_journal(directory, journal)
        remote.replace(entry['path'], data, item['before'])
        item['completed'] = True
        save_journal(directory, journal)
        print('Загружен:', entry['path'])
    print('Готово. Контрольные суммы загруженных файлов проверены.')


def rollback(remote, directory, manifest, apply=False):
    journal = json.loads((directory/'journal.json').read_text(encoding='utf-8'))
    if journal['host'] != manifest['host'] or journal['root'] != manifest['root']:
        raise RuntimeError('Резервная копия относится к другому серверу.')
    allowed = {entry['path'] for entry in manifest['files']}
    plan = []
    for item in reversed(journal['files']):
        path = safe_path(item['path'])
        if path not in allowed:
            raise RuntimeError('Неизвестный файл в резервной копии: ' + path)
        if item['before'] is None or not item['started']:
            continue
        original = (directory/'originals'/path).read_bytes()
        if digest(original) != item['before']:
            raise RuntimeError('Повреждена резервная копия: ' + path)
        current = digest(remote.read(path))
        if current == item['before']:
            continue
        if current != item['after']:
            raise RuntimeError('После обновления файл снова изменён; откат остановлен: ' + path)
        plan.append((path, original, current))
    print('Для восстановления прежних файлов:', len(plan))
    if apply:
        for path, data, expected in plan:
            remote.replace(path, data, expected)
            print('Восстановлен:', path)
        print('Прежние файлы восстановлены. Новые страницы и изображения оставлены на сервере; старые страницы на них не ссылаются.')
    else:
        print('Только проверка. Для восстановления повторите с --apply.')


def main():
    parser = argparse.ArgumentParser(description='Безопасная проверка и установка обновления ArtNahodka по FTPS.')
    parser.add_argument('--apply', action='store_true', help='Записать проверенные изменения на хостинг.')
    parser.add_argument('--rollback', type=Path, help='Каталог резервной копии для восстановления прежних файлов.')
    parser.add_argument('--package', type=Path, default=Path(__file__).resolve().parent, help='Каталог с manifest.json и payload/.')
    args = parser.parse_args()
    base = args.package.resolve()
    manifest = json.loads((base/'manifest.json').read_text(encoding='utf-8'))
    print('Режим:', 'ЗАПИСЬ НА ХОСТИНГ' if args.apply else 'ПРОВЕРКА БЕЗ ИЗМЕНЕНИЙ')
    print('Сервер:', manifest['host'], 'Пользователь:', manifest['user'], 'Корень:', manifest['root'])
    password = getpass.getpass('Пароль FTPS (ввод не отображается): ')
    ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=45)
    try:
        ftp.connect(manifest['host'], 21)
        ftp.login(manifest['user'], password)
        password = None
        ftp.prot_p()
        ftp.cwd(manifest['root'])
        remote = Remote(ftp)
        if args.rollback:
            rollback(remote, args.rollback.resolve(), manifest, args.apply)
            return
        plan = inspect_release(remote, manifest, base/'payload')
        print('Файлов для загрузки:', len(plan), 'из', len(manifest['files']))
        if not plan:
            print('Все файлы обновления уже совпадают с хостингом.')
        elif args.apply:
            stamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
            apply_release(remote, plan, base/'backups'/stamp, manifest)
        else:
            print('Проверка пройдена. На сервер ничего не записано. После согласования демо можно запускать с --apply.')
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()


if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except (OSError, ValueError, RuntimeError, ftplib.Error, ssl.SSLError) as error:
        print('ОСТАНОВЛЕНО:', error, file=sys.stderr)
        sys.exit(1)
