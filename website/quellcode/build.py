from pathlib import Path
from html.parser import HTMLParser
import argparse
import base64
import json
import re
import shutil
from restore_media import restore_header

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'quellcode'
SITE = ROOT / 'webseite'
PREVIEW = ROOT / 'arbeitsmaterial/vorschau'

parser = argparse.ArgumentParser(description='Crazy_Batto-Webseite aus den Vorlagen bauen.')
parser.add_argument('--preview-output', type=Path, help='Optionaler Ausgabepfad für ein HTML-Fragment der Chat-Vorschau.')
args = parser.parse_args()
restore_header(ROOT)

def read(name):
    return (SOURCE / name).read_text(encoding='utf-8')

def data_uri(path, mime):
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode('ascii')

old = read('old.html').replace('__OLD_INTRO__', read('old-intro.html')).replace('__OLD_HISTORY__', read('old-history.html'))
gaming = read('gaming.html').replace('__GAMING_INTRO__', read('gaming-intro.html')).replace('__GALLERY__', read('gallery.html')).replace('__GAMING_SPECS__', read('gaming-specs.html'))
software = read('software.html').replace('__SOFTWARE_GALLERY__', read('software-gallery.html'))
pages = {'home': read('home.html'), 'old': old, 'gaming': gaming, 'software': software, 'discord': read('discord.html'), 'registration': read('registration.html')}
metadata = {
    'home': ('index.html', 'Crazy_Batto – Hardware, Gaming & Team TABH', 'Crazy_Batto: Content-Creator für Hardware und Gaming, Inhaber und Gründer von Team TABH. Meine Geschichte, PC-Setups und eigenen Softwareprojekte.'),
    'old': ('altes-setup.html', 'Mein altes Setup – Crazy_Batto', 'So habe ich angefangen: Mein PC-Setup ab 2022, der Wechsel zu ASUS ROG und meine ersten Umbauten an der Wasserkühlung.'),
    'gaming': ('gaming-setup.html', 'Mein Gaming-Setup – Crazy_Batto', 'Mein Gaming-PC mit Ryzen 7 9800X3D, ROG Crosshair X870E Glacial und ROG Astral RTX 5080. Fotos, Wasserkühlung und vollständige Ausstattung.'),
    'software': ('software.html', 'Software – Batto OBS Tool | Crazy_Batto', 'Einblicke in mein Batto OBS Tool: Multi-Chat, RGB-Vorschau, Lüfterkurven und Jarvis. Ein eigenes Softwareprojekt von Crazy_Batto, noch nicht freigegeben.'),
    'discord': ('discord-app.html', 'Crazy_Batto Discord App – Modstempel, Beiträge & Events', 'Meine Android-App für Moderationsdienste, Stream-Abfragen, Beiträge mit Bildern und Discord-Events. Zugang nach persönlicher Freigabe.'),
    'registration': ('registrierung.html', 'Registrierung & App-Zugang | Crazy_Batto', 'Mit Discord anmelden, Zugang anfragen und nach der persönlichen Freigabe die Crazy_Batto Discord App für Android herunterladen.')
}
software_assets = {
    'softwareStart': ('01-1000157322', 'software-start.jpg'),
    'softwareStrimer': ('02-1000157319', 'software-strimer.jpg'),
    'softwareRgb': ('03-1000157318', 'software-rgb.jpg'),
    'softwareChat': ('05-1000157321', 'software-multi-chat.jpg'),
    'softwareOverview': ('06-1000157320', 'software-uebersicht.jpg'),
    'softwareWidgets': ('07-1000157325', 'software-widgets.jpg'),
    'softwareDeck': ('08-1000157324', 'software-touch-deck.jpg'),
    'softwareFans': ('09-1000157323', 'software-luefterkurven.jpg')
}
for _, filename in software_assets.values():
    if not (SITE / 'assets' / filename).is_file():
        raise FileNotFoundError('Benötigtes Originalbild fehlt: ' + str(SITE / 'assets' / filename))
layout = read('layout.html')
banner = read('banner.html')
document = read('document.html')
for key, content in pages.items():
    filename, title, description = metadata[key]
    page = layout.replace('__PREVIEW__', 'false').replace('__START_PAGE__', key).replace('__BANNER__', banner if key == 'home' else '').replace('__CONTENT__', content).replace('__ASSET_DATA__', '')
    page = page.replace('data-nav="' + key + '"', 'data-nav="' + key + '" aria-current="page"')
    page = document.replace('__TITLE__', title).replace('__DESCRIPTION__', description).replace('__SITE__', page)
    assert not re.search(r'__[A-Z_]+__', page), filename
    (SITE / filename).write_text(page, encoding='utf-8')

css = '\n'.join(read(name) for name in ('style.css', 'discord.css', 'registration.css'))
script = '\n'.join(read(name) for name in ('script.js', 'registration.js'))
(SITE / 'assets/site.css').write_text(css, encoding='utf-8')
(SITE / 'assets/site.js').write_text(script, encoding='utf-8')
shutil.copy2(SOURCE / 'LIESMICH.txt', SITE / 'LIESMICH.txt')

if args.preview_output is None:
    print(json.dumps({'pages': [entry[0] for entry in metadata.values()], 'site': str(SITE)}, ensure_ascii=False))
    raise SystemExit(0)

preview_assets = {
    'logo': (PREVIEW / 'logo.webp', 'image/webp'),
    'portrait': (PREVIEW / 'portrait.webp', 'image/webp'),
    'poster': (SITE / 'assets/header-poster.webp', 'image/webp'),
    'motion': (PREVIEW / 'motion.mp4', 'video/mp4'),
    'discordApp': (SITE / 'assets/discord-app.png', 'image/png')
}
for key, (uploaded, _) in software_assets.items():
    preview_assets[key] = (PREVIEW / (uploaded + '.webp'), 'image/webp')

# Photo replacements use the same files in every export. Reading the paths from
# the templates prevents an older preview copy from surviving a photo change.
class PhotoAssetParser(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        key = attributes.get('data-asset')
        if tag != 'img' or not key:
            return
        src = attributes.get('src', '')
        if not src.startswith('assets/'):
            raise ValueError('Bild ohne lokalen Medienpfad: ' + str(key))
        if key not in preview_assets:
            path = SITE / src
            mime = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}[path.suffix.lower()]
            preview_assets[key] = (path, mime)

photo_parser = PhotoAssetParser()
for content in pages.values():
    photo_parser.feed(content)
assets_json = json.dumps({key: data_uri(path, mime) for key, (path, mime) in preview_assets.items()}, ensure_ascii=False, separators=(',', ':'))
assets_element = read('inline-assets.html').replace('__ASSETS_JSON__', assets_json)
preview_banner = re.sub(r'<img data-header-motion[^>]+>', '<video data-header-motion data-asset="motion" width="600" height="200" autoplay loop muted playsinline preload="auto" aria-label="Animierter Crazy_Batto-Header"></video>', banner)
preview_start = 'software'
preview_banner = preview_banner.replace('data-home-banner', 'data-home-banner hidden', 1)
preview_pages = '\n'.join(content if key == preview_start else content.replace('data-page="' + key + '"', 'data-page="' + key + '" hidden', 1) for key, content in pages.items())
preview_site = layout.replace('__PREVIEW__', 'true').replace('__START_PAGE__', preview_start).replace('__BANNER__', preview_banner).replace('__CONTENT__', preview_pages).replace('__ASSET_DATA__', assets_element)
preview_site = preview_site.replace('data-nav="' + preview_start + '"', 'data-nav="' + preview_start + '" aria-current="page"')
def inline_tag(match):
    tag = match.group(0)
    if 'data-asset=' in tag:
        tag = re.sub(r'\s+src="[^"]*"', '', tag)
    return tag
preview_site = re.sub(r'<(?:img|video)\b[^>]*>', inline_tag, preview_site)
marble_uri = data_uri(PREVIEW / 'marble.webp', 'image/webp')
inline_css = css.replace('url("marble-gold.webp")', 'url("' + marble_uri + '")')
fragment = read('inline-template.html').replace('__SITE__', preview_site).replace('__CSS__', inline_css).replace('__JS__', script)
assert not re.search(r'__[A-Z_]+__', fragment)
preview_path = args.preview_output.expanduser().resolve()
preview_path.parent.mkdir(parents=True, exist_ok=True)
preview_path.write_text(fragment, encoding='utf-8')
print(json.dumps({'pages': [entry[0] for entry in metadata.values()], 'inline_bytes': preview_path.stat().st_size, 'preview': str(preview_path)}, ensure_ascii=False))
