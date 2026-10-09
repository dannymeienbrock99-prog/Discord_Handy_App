#!/usr/bin/env python3
"""Package the already-built Windows release, with its real dependencies and evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
import zipfile

ROOT = Path(__file__).resolve().parent
NAME = 'Crazy_Batto-Discord-App-Verwaltung'
VERSION = '2.2.0'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pe_imports(path):
    data = path.read_bytes()
    header = struct.unpack_from('<I', data, 0x3c)[0]
    if data[header:header + 4] != b'PE\0\0':
        raise ValueError('Not a Windows PE file: ' + str(path))
    machine, sections, _, _, _, optional_size, _ = struct.unpack_from('<HHIIIHH', data, header + 4)
    optional = header + 24
    magic = struct.unpack_from('<H', data, optional)[0]
    directory = optional + (112 if magic == 0x20b else 96)
    base = struct.unpack_from('<Q' if magic == 0x20b else '<I', data, optional + (24 if magic == 0x20b else 28))[0]
    table = optional + optional_size
    mappings = []
    for index in range(sections):
        at = table + 40 * index
        virtual_size, rva, size, raw = struct.unpack_from('<IIII', data, at + 8)
        mappings.append((rva, max(virtual_size, size), raw))

    def offset(rva):
        for start, size, raw in mappings:
            if start <= rva < start + size:
                return raw + rva - start
        raise ValueError('Invalid PE RVA')

    def name(rva):
        at = offset(rva)
        return data[at:data.index(b'\0', at)].decode('ascii')

    imports, delay = [], []
    for kind, output, stride in [(1, imports, 20), (13, delay, 32)]:
        rva, size = struct.unpack_from('<II', data, directory + 8 * kind)
        if not rva:
            continue
        at = offset(rva)
        for count in range(256):
            row = struct.unpack_from('<' + 'I' * (stride // 4), data, at + count * stride)
            if not any(row):
                break
            address = row[3] if kind == 1 else row[1] if row[0] & 1 else row[1] - base
            output.append(name(address))
        else:
            raise ValueError('Unexpected import table length')
    return {'machine': hex(machine), 'direct': imports, 'delay': delay}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'dist' / (NAME + '-' + VERSION + '.zip'))
    args = parser.parse_args()
    binary = ROOT / 'bin' / 'Release' / 'net48'
    stage = ROOT / 'dist' / 'package-2.2'
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    required = [NAME + '.exe', NAME + '.exe.config', 'SkiaSharp.dll', 'System.Memory.dll', 'System.Buffers.dll',
                'System.Numerics.Vectors.dll', 'System.Runtime.CompilerServices.Unsafe.dll',
                'x64/libSkiaSharp.dll', 'x86/libSkiaSharp.dll', 'arm64/libSkiaSharp.dll']
    for item in required:
        source = binary / item
        if not source.is_file() or source.stat().st_size == 0:
            raise RuntimeError('Required runtime file missing: ' + item)
        destination = stage / item
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    shutil.copy2(ROOT / 'README.md', stage / 'ANLEITUNG.md')
    shutil.copytree(ROOT / 'THIRD-PARTY', stage / 'THIRD-PARTY')
    for package in ['skiasharp', 'skiasharp.nativeassets.win32', 'system.memory', 'system.buffers', 'system.numerics.vectors', 'system.runtime.compilerservices.unsafe']:
        if not (stage / 'THIRD-PARTY' / package / 'LICENSE.txt').is_file():
            raise RuntimeError('License missing: ' + package)
    if not (stage / 'THIRD-PARTY' / 'skiasharp.nativeassets.win32' / 'THIRD-PARTY-NOTICES.txt').is_file():
        raise RuntimeError('Native third-party notices missing')
    evidence = json.loads((ROOT / 'qa' / 'binary-2.2.json').read_text())
    if not evidence.get('passed') or evidence['exeSha256'] != sha(binary / (NAME + '.exe')):
        raise RuntimeError('Binary evidence does not match this EXE; run BinaryInspector for the current build.')
    tests = (ROOT / 'qa' / 'desktop-tests-2.2.log').read_text()
    match = re.search(r'PASS: (\d+) desktop core and HTTP contract assertions\.', tests)
    if not match:
        raise RuntimeError('Successful final core/transport/image test log missing')
    imports = {arch: pe_imports(binary / arch / 'libSkiaSharp.dll') for arch in ['x64', 'x86', 'arm64']}
    inspection = {'binary': evidence, 'coreHttpWebsiteAndImageAssertions': int(match[1]), 'windowsRuntimeTested': False,
                  'imageDecoderExecutedOn': 'Linux, SkiaSharp 4.153.1', 'nativeWindowsImports': imports,
                  'openChecks': ['Windows UI and DPI', 'Windows image DLL execution', 'DPAPI', 'Tray notifications', 'Autostart', 'Real configured Discord login']}
    (stage / 'PRUEFUNG-WINDOWS.json').write_text(json.dumps(inspection, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'qa' / 'release-2.2.json').write_text(json.dumps(inspection, ensure_ascii=False, indent=2) + '\n')
    dependencies = {'SkiaSharp': '4.153.1', 'SkiaSharp.NativeAssets.Win32': '4.153.1', 'System.Memory': '4.6.3',
                    'System.Buffers': '4.6.1', 'System.Numerics.Vectors': '4.6.1', 'System.Runtime.CompilerServices.Unsafe': '6.1.2'}
    files = {p.relative_to(stage).as_posix(): {'size': p.stat().st_size, 'sha256': sha(p)} for p in sorted(stage.rglob('*')) if p.is_file()}
    manifest = {'name': 'Crazy_Batto Discord App · Verwaltung', 'version': VERSION, 'framework': '.NET Framework 4.8', 'dependencies': dependencies, 'files': files}
    (stage / 'PAKET-MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(stage.rglob('*')):
            if path.is_file():
                archive.write(path, path.relative_to(stage).as_posix())
    with zipfile.ZipFile(args.output) as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError('Corrupt release member: ' + bad)
        names = archive.namelist()
        if set(required) - set(names) or any(name.endswith(('.dylib', '.so', '.pdb')) for name in names):
            raise RuntimeError('Unexpected or missing runtime in Windows ZIP')
        for name, info in files.items():
            if hashlib.sha256(archive.read(name)).hexdigest() != info['sha256']:
                raise RuntimeError('Packaged hash differs: ' + name)
    result = {'path': str(args.output.resolve()), 'size': args.output.stat().st_size, 'sha256': sha(args.output), 'files': len(names), 'assertions': int(match[1]), 'imports': imports}
    (ROOT / 'qa' / 'package-2.2.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
