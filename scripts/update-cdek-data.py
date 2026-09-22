"""Refresh the public pickup-point directory. Credentials stay in environment variables."""
import datetime
import json
import os
import pathlib
import urllib.parse
import urllib.request


def refresh():
    body = urllib.parse.urlencode({
        'grant_type': 'client_credentials',
        'client_id': os.environ['CDEK_ACCOUNT'],
        'client_secret': os.environ['CDEK_SECRET'],
    }).encode()
    request = urllib.request.Request('https://api.cdek.ru/v2/oauth/token', data=body)
    with urllib.request.urlopen(request, timeout=45) as response:
        token = json.load(response)['access_token']
    url = 'https://api.cdek.ru/v2/deliverypoints?country_code=RU&type=PVZ&is_handout=true'
    request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(request, timeout=90) as response:
        offices = json.load(response)
    if not isinstance(offices, list) or not offices:
        raise ValueError('Empty directory')
    cities, groups = {}, {}
    for office in offices:
        loc = office.get('location', {})
        code = loc.get('city_code')
        if not code or not loc.get('longitude') or not loc.get('latitude'):
            continue
        cities[code] = [code, loc['city'], loc.get('region', '')]
        groups.setdefault(str(code), []).append([
            office['code'], loc['address'], loc['longitude'], loc['latitude'], office.get('work_time', ''),
        ])
    if not groups:
        raise ValueError('No valid pickup points')
    data = {
        'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source': 'https://api.cdek.ru/v2/deliverypoints',
        'cities': sorted(cities.values(), key=lambda c: (c[1], c[2])),
        'offices': groups,
    }
    target = pathlib.Path(__file__).resolve().parents[1] / 'assets/data/cdek-offices.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    temporary.replace(target)
    print('Updated cities:', len(cities), 'pickup points:', sum(map(len, groups.values())))


if __name__ == '__main__':
    try:
        refresh()
    except Exception as error:
        # Do not print response bodies, tokens, credentials, or request headers.
        raise SystemExit('CDEK refresh failed: ' + type(error).__name__)
