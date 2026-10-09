#!/usr/bin/env python3
"""Fetch a minimal Android toolchain from official release servers, with checksums."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
import zipfile

ANDROID_MANIFEST = "https://dl.google.com/android/repository/repository2-1.xml"
ANDROID_BASE = "https://dl.google.com/android/repository/"
ECJ_BASE = "https://download.eclipse.org/eclipse/downloads/drops4/R-4.31-202402290520/"
ECJ_SHA512 = "1f31bea2297013601ba7a3e0a8c65d7b621601c106fe10bf2a11af625d63aa0772941fa029fb392cd9fe2314203e6ef7e04a94dc938e15961108494139fae3e8"
ANDROID_PACKAGES = [
    ("platforms;android-35", "platform", "android.jar", "platform-35-ext15_r01.zip", "ce757091f933b7ac646bf197ce8957cc73b95614", "a93712aedd4f851d9cf1f7281f7c4fe5581ce03a9df37ffc8c53a487eadf311f"),
    ("build-tools;35.0.0", "build-tools", "aapt2", "build-tools_r35_linux.zip", "2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc", "bd3a4966912eb8b30ed0d00b0cda6b6543b949d5ffe00bea54c04c81e1561d88"),
]


def digest_file(path, algorithm="sha256"):
    digest = hashlib.new(algorithm)
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url, destination, expected=None, algorithm="sha256"):
    destination = Path(destination)
    if destination.exists() and expected:
        if digest_file(destination, algorithm) == expected:
            return destination
    temporary = destination.with_suffix(destination.suffix + ".part")
    digest = hashlib.new(algorithm)
    request = urllib.request.Request(url, headers={"User-Agent": "Modstempel-build/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response, temporary.open("wb") as stream:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            stream.write(chunk)
            digest.update(chunk)
    if expected and digest.hexdigest() != expected:
        temporary.unlink(missing_ok=True)
        raise RuntimeError("Release checksum does not match: " + destination.name)
    temporary.replace(destination)
    return destination


def safe_extract(archive, destination):
    destination = Path(destination).resolve()
    with zipfile.ZipFile(archive) as package:
        for item in package.infolist():
            target = (destination / item.filename).resolve()
            if not target.is_relative_to(destination):
                raise RuntimeError("Unexpected archive path")
        package.extractall(destination)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parent.parent / "toolchain")
    args = parser.parse_args()
    root = args.directory.resolve()
    root.mkdir(parents=True, exist_ok=True)
    cache = root / "downloads"
    cache.mkdir(exist_ok=True)
    records = []
    for package_name, directory_name, required_file, relative, checksum, sha256 in ANDROID_PACKAGES:
        archive = download(ANDROID_BASE + relative, cache / Path(relative).name, sha256, "sha256")
        if digest_file(archive, "sha1") != checksum:
            raise RuntimeError("Official Android manifest checksum does not match")
        target = root / directory_name
        if not (target / required_file).exists():
            staging = root / (directory_name + ".extract")
            staging.mkdir(exist_ok=True)
            safe_extract(archive, staging)
            candidates = list(staging.rglob(required_file))
            if len(candidates) != 1:
                raise RuntimeError("Unexpected Android archive layout")
            if target.exists():
                shutil.rmtree(target)
            shutil.move(str(candidates[0].parent), target)
            shutil.rmtree(staging)
        for binary in ["aapt", "aapt2", "zipalign", "aidl", "dexdump", "split-select"]:
            path = target / binary
            if path.exists():
                path.chmod(path.stat().st_mode | 0o111)
        records.append({"package": package_name, "url": ANDROID_BASE + relative, "manifest": ANDROID_MANIFEST, "checksumAlgorithm": "sha1", "checksum": checksum, "sha256": sha256})
        print("Ready:", package_name, flush=True)
    ecj = download(ECJ_BASE + "ecj-4.31.jar", root / "ecj.jar", ECJ_SHA512, "sha512")
    records.append({"package": "Eclipse Java Compiler 4.31", "url": ECJ_BASE + "ecj-4.31.jar", "checksumUrl": ECJ_BASE + "checksum/ecj-4.31.jar.sha512", "checksumAlgorithm": "sha512", "checksum": ECJ_SHA512, "sha256": digest_file(ecj)})
    (root / "verified-tools.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    print("Ready: Eclipse Java Compiler 4.31", flush=True)


if __name__ == "__main__":
    main()
