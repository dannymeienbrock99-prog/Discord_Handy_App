#!/usr/bin/env python3
"""Package all six Crazy_Batto website pages as one self-contained offline HTML.

This script reads the master only. It does not run its build or encode/edit images.
Usage: python3 generate_offline_html.py [--master PATH] [--output PATH]
                                      [--report-dir PATH]

The portable copy lives in quellcode/offline: its default master is ../.. and its
default output is Crazy_Batto-Offline.html inside that project. Verification
reports are optional and must be written outside quellcode.
"""
from __future__ import annotations

import argparse
import base64
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
DEFAULT_ROOT = HERE.parent.parent
DEFAULT_OUTPUT = DEFAULT_ROOT / 'Crazy_Batto-Offline.html'
DEFAULT_REPORT_DIR = None
MIMES = {'.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif'}
PAGE_NAMES = {'home': 'index.html', 'old': 'altes-setup.html', 'gaming': 'gaming-setup.html', 'software': 'software.html', 'discord': 'discord-app.html', 'registration': 'registrierung.html'}
CSS_SOURCES = ('style.css', 'discord.css', 'registration.css')
JS_SOURCES = ('script.js', 'registration.js')


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


class Inspect(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.nodes = []
        self.stack = []
        self.ids = []
        self.refs = []

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        index = len(self.nodes)
        self.nodes.append({'tag': tag, 'attrs': attr, 'parent': self.stack[-1] if self.stack else None, 'text': ''})
        if 'id' in attr:
            self.ids.append(attr['id'])
        for key in ('src', 'href'):
            if key in attr:
                self.refs.append((tag, key, attr[key]))
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append(index)

    def handle_endtag(self, tag):
        for position in range(len(self.stack) - 1, -1, -1):
            if self.nodes[self.stack[position]]['tag'] == tag:
                del self.stack[position:]
                return

    def handle_data(self, data):
        if self.stack:
            node = self.nodes[self.stack[-1]]
            if node['tag'] not in {'script', 'style'}:
                node['text'] += data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--master', type=Path, default=DEFAULT_ROOT)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--report-dir', type=Path, default=DEFAULT_REPORT_DIR,
                        help='Optional directory for verification JSON and the DOM fixture; outside quellcode.')
    args = parser.parse_args()
    root = args.master.resolve()
    source = root / 'quellcode'
    site = root / 'webseite'
    output = args.output.resolve()
    report_dir = args.report_dir.resolve() if args.report_dir is not None else None
    if output == source or source in output.parents:
        parser.error('--output must be outside quellcode; generated pages are not editable sources.')
    if report_dir is not None and (report_dir == source or source in report_dir.parents):
        parser.error('--report-dir must be outside quellcode.')
    if report_dir == root:
        parser.error('--report-dir must use a dedicated subdirectory or a directory outside the project.')

    def snapshot():
        return {
            str(p.relative_to(root)): digest(p.read_bytes())
            for p in root.rglob('*')
            if p.is_file() and p.resolve() != output
            and not (report_dir is not None and report_dir in p.resolve().parents)
        }

    before = snapshot()

    def read(name):
        return (source / name).read_bytes().decode('utf-8')

    pages = {
        'home': read('home.html'),
        'old': read('old.html').replace('__OLD_INTRO__', read('old-intro.html')).replace('__OLD_HISTORY__', read('old-history.html')),
        'gaming': read('gaming.html').replace('__GAMING_INTRO__', read('gaming-intro.html')).replace('__GALLERY__', read('gallery.html')).replace('__GAMING_SPECS__', read('gaming-specs.html')),
        'software': read('software.html').replace('__SOFTWARE_GALLERY__', read('software-gallery.html')),
        'discord': read('discord.html'),
        'registration': read('registration.html'),
    }
    # Run the normal project build first; never silently export stale rendered pages.
    for name, content in pages.items():
        assert content in (site / PAGE_NAMES[name]).read_bytes().decode('utf-8'), name

    contents = '\n'.join(content if name == 'home' else content.replace('data-page="' + name + '"', 'data-page="' + name + '" hidden', 1) for name, content in pages.items())
    layout = (read('layout.html')
              .replace('__PREVIEW__', 'false')
              .replace('__START_PAGE__', 'home')
              .replace('__BANNER__', read('banner.html'))
              .replace('__CONTENT__', contents)
              .replace('__ASSET_DATA__', ''))
    layout = layout.replace('data-preview="false"', 'data-preview="false" data-offline="true"', 1)
    # A file export cannot be switched live by an inherited template setting.
    if re.search(r'\bdata-portal-mode="[^"]*"', layout):
        layout = re.sub(r'\bdata-portal-mode="[^"]*"', 'data-portal-mode="offline"', layout, count=1)
    else:
        layout = layout.replace('id="cb-website"', 'id="cb-website" data-portal-mode="offline"', 1)
    layout = layout.replace('data-nav="home"', 'data-nav="home" aria-current="page"', 1)
    html = (read('document.html')
            .replace('__TITLE__', 'Crazy_Batto – Hardware, Gaming & Team TABH')
            .replace('__DESCRIPTION__', 'Crazy_Batto: Content-Creator für Hardware und Gaming, Inhaber und Gründer von Team TABH. Meine Geschichte, PC-Setups und eigenen Softwareprojekte.')
            .replace('__SITE__', layout))
    css = '\n\n'.join(read(name) for name in CSS_SOURCES)
    assert css.count('url("marble-gold.webp")') == 1
    # Bootstrap assigns the same original marble bytes as a Blob URL via this variable.
    offline_css = css.replace('url("marble-gold.webp")', 'none')
    html = html.replace('<link rel="stylesheet" href="assets/site.css">', '<style id="cb-offline-theme">\n' + offline_css + '\n</style>')
    html = html.replace('<script src="assets/site.js" defer></script>', '')

    referenced = {'assets/marble-gold.webp'}

    def embed_reference(match):
        attr, path = match.group('attr', 'path')
        referenced.add(path)
        return 'data-offline-' + attr + '="' + path + '"'

    html = re.sub(r'(?<![-\w])(?P<attr>src|href|data-full-src)="(?P<path>assets/[^"]+)"', embed_reference, html)
    # data-full-src needs a short, predictable dataset key for the bootstrap.
    html = html.replace('data-offline-data-full-src=', 'data-offline-full-src=')

    def local_link(match):
        tag = match.group(0)
        destination = re.search(r'\bdata-page-link="([^"]+)"', tag)
        href = re.search(r'(?<![-\w])href="([^"]*)"', tag)
        if destination and href:
            assert destination.group(1) in PAGE_NAMES, destination.group(1)
            old_href = href.group(1)
            anchor = old_href.partition('#')[2]
            new_href = '#' + destination.group(1) + ('/' + anchor if anchor else '')
            tag = tag[:href.start(1)] + new_href + tag[href.end(1):]
        return tag

    html = re.sub(r'<a\b[^>]*>', local_link, html)
    assert not re.search(r'__[A-Z_]+__', html)

    assets = {}
    asset_report = []
    for path in sorted(referenced):
        full_path = site / path
        data = full_path.read_bytes()
        assets[path] = {'mime': MIMES[full_path.suffix], 'base64': base64.b64encode(data).decode('ascii')}
        asset_report.append({'path': path, 'bytes': len(data), 'sha256': digest(data), 'mime': MIMES[full_path.suffix]})
    supplied_assets = {
        'assets/' + path.name
        for path in (site / 'assets').iterdir()
        if path.is_file() and path.suffix.lower() in MIMES
    }
    assert set(assets) == supplied_assets, {
        'unreferenced_images': sorted(supplied_assets - set(assets)),
        'unexpected_images': sorted(set(assets) - supplied_assets),
    }
    assert 'assets/header.gif' in assets
    assert 'assets/portrait.png' in assets
    assert 'assets/discord-app.png' in assets
    asset_json = json.dumps(assets, ensure_ascii=False, separators=(',', ':'))
    bootstrap = (HERE / 'offline-bootstrap.js').read_bytes().decode('utf-8')
    router = (HERE / 'offline-router.js').read_bytes().decode('utf-8')
    original_js = read('script.js')
    registration_js = read('registration.js')
    bundled_js = '\n\n'.join(read(name) for name in JS_SOURCES)
    scripts = '\n'.join([
        '<script id="cb-offline-assets" type="application/json">' + asset_json + '</script>',
        '<script id="cb-offline-bootstrap">\n' + bootstrap + '\n</script>',
        '<script id="cb-original-script">\n' + original_js + '\n</script>',
        '<script id="cb-registration-script">\n' + registration_js + '\n</script>',
        '<script id="cb-offline-router">\n' + router + '\n</script>',
    ])
    html = html.replace('</body>', scripts + '\n</body>')
    data = html.encode('utf-8')
    inspector = Inspect()
    inspector.feed(html)
    assert len(inspector.ids) == len(set(inspector.ids)), 'Duplicate HTML IDs'
    assert [n['attrs']['data-page'] for n in inspector.nodes if 'data-page' in n['attrs']] == list(PAGE_NAMES)
    export_root = next(n for n in inspector.nodes if n['attrs'].get('id') == 'cb-website')
    assert export_root['attrs']['data-portal-mode'] == 'offline'
    assert not [ref for ref in inspector.refs if not ref[2].startswith('#')], inspector.refs
    assert not re.search(r'@import\b|url\(', offline_css)
    assert '<!DOCTYPE html>' in html and 'name="viewport"' in html
    # Only registration.js contains the existing server API branch. It executes
    # exclusively for explicit live mode; the Node smoke forbids any network call.
    assert not re.search(r'\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(', bootstrap + original_js + router)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(data)
    after = snapshot()
    assert before == after, 'Master files changed unexpectedly'

    report = {
        'output': str(output), 'bytes': len(data), 'sha256': digest(data),
        'pages': list(PAGE_NAMES.values()), 'start_page': 'home',
        'portal_mode': 'offline',
        'original_page_bodies_match_handover': True,
        'asset_count': len(assets), 'asset_bytes': sum(a['bytes'] for a in asset_report),
        'assets': asset_report,
        'original_css_sha256': digest(css.encode('utf-8')),
        'css_sources': {name: digest(read(name).encode('utf-8')) for name in CSS_SOURCES},
        'original_js_sha256': digest(bundled_js.encode('utf-8')),
        'javascript_sources': {name: digest(read(name).encode('utf-8')) for name in JS_SOURCES},
        'all_original_asset_bytes_embedded': True,
        'master_files_unchanged': len(before), 'static_external_references': 0,
        'local_file_requests': 0, 'external_requests': None,
        'all_link_targets_are_fragment_or_runtime_blob': True,
        'smoke_test': 'pending', 'visual_browser_test': False,
        'limits': ['Statische Prüfung und gezielter Node-DOM-Smoke-Test; kein realer Browserlauf.', 'Die Offline-Datei muss in einem Browser mit JavaScript-Unterstützung geöffnet werden.', 'Registrierung ist eine gekennzeichnete Offline-Vorschau ohne Anmeldung, Anfrage, Freigabe oder APK-Download.'],
    }
    if report_dir is not None:
        report_dir.mkdir(parents=True, exist_ok=True)
        (report_dir / 'offline-dom-fixture.json').write_text(json.dumps(inspector.nodes, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        (report_dir / 'html-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: report[k] for k in ('output', 'bytes', 'sha256', 'asset_count', 'asset_bytes', 'master_files_unchanged')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
