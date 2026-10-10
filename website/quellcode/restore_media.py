"""Restore the unchanged header from its Git backup parts when necessary."""
from pathlib import Path
import hashlib
import json
import re

def restore_header(root):
    root = Path(root)
    target = root / 'webseite/assets/header.gif'
    if target.is_file():
        return
    parts_dir = root / 'media-parts'
    if not (parts_dir / 'manifest.json').is_file():
        parts_dir = root.parent / 'server/media-parts'
    manifest = json.loads((parts_dir / 'manifest.json').read_text(encoding='utf-8'))
    assert manifest['formatVersion'] == 1 and manifest['filename'] == 'header.gif'
    chunks = []
    for part in manifest['parts']:
        assert re.fullmatch(r'header\.gif\.\d{3}', part['filename'])
        data = (parts_dir / part['filename']).read_bytes()
        assert len(data) == part['size'] and hashlib.sha256(data).hexdigest() == part['sha256']
        chunks.append(data)
    data = b''.join(chunks)
    assert len(data) == manifest['size'] and hashlib.sha256(data).hexdigest() == manifest['contentSha256']
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
