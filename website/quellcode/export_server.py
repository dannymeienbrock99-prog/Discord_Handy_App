"""Export the built website for the existing Crazy_Batto Discord backend.

Run build.py first. The standalone website stays an offline preview; only
this explicit server export enables the existing authenticated portal API.
"""
from pathlib import Path
import argparse
import json
import re
import shutil

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'webseite'
PAGES = ('index.html', 'altes-setup.html', 'gaming-setup.html', 'software.html', 'discord-app.html', 'registrierung.html')

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--server-public', type=Path, default=ROOT.parent / 'server/public/showcase')
args = parser.parse_args()
target = args.server_public.expanduser().resolve()
target.mkdir(parents=True, exist_ok=True)
(target / 'assets').mkdir(exist_ok=True)

def make_absolute(match):
    attribute, value = match.group(1), match.group(2)
    if value.startswith('assets/'):
        value = '/' + value
    elif value.split('#', 1)[0] in PAGES:
        value = '/portal' + ('#' + value.split('#', 1)[1] if '#' in value else '') if value.startswith('registrierung.html') else '/' + value
    return attribute + '="' + value + '"'

for name in PAGES:
    content = (SITE / name).read_text(encoding='utf-8')
    assert content.count('data-portal-mode="offline"') == 1, name
    content = content.replace('data-portal-mode="offline"', 'data-portal-mode="live"', 1)
    content = re.sub(r'(?<![-\w])(src|href|data-full-src)="([^"]*)"', make_absolute, content)
    assert not re.search(r'<style\b|\bstyle=|<script(?![^>]*\bsrc=)', content), name
    (target / name).write_text(content, encoding='utf-8')

assets = []
for item in sorted((SITE / 'assets').iterdir()):
    if item.is_file() and (item.suffix.lower() in ('.jpeg', '.jpg', '.png', '.webp', '.gif') or item.name in ('site.css', 'site.js')):
        shutil.copy2(item, target / 'assets' / item.name)
        assets.append(item.name)

print(json.dumps({'directory': str(target), 'pages': list(PAGES), 'assets': len(assets), 'portal_mode': 'live'}, ensure_ascii=False))
