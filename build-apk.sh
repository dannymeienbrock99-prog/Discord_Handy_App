#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_DIR="$(dirname "$PROJECT_DIR")"
MODSTEMPEL_TOOLCHAIN="${MODSTEMPEL_TOOLCHAIN:-$TASK_DIR/toolchain}"
MODSTEMPEL_PRIVATE="${MODSTEMPEL_PRIVATE:-$TASK_DIR/private}"
MODSTEMPEL_OUTPUT="${MODSTEMPEL_OUTPUT:-$TASK_DIR/output}"
MODSTEMPEL_BUILD="$PROJECT_DIR/android/build"
JAVA_LIMITS=(-XX:ActiveProcessorCount=2 -XX:+UseSerialGC -Xmx256m)
if [[ ! -f "$MODSTEMPEL_TOOLCHAIN/platform/android.jar" || ! -f "$MODSTEMPEL_TOOLCHAIN/ecj.jar" ]]; then
  timeout 240s python3 "$PROJECT_DIR/setup-toolchain.py" --directory "$MODSTEMPEL_TOOLCHAIN"
fi
if [[ ! -f "$PROJECT_DIR/web/index.html" ]]; then
  printf '%s\n' 'Missing web/index.html. Add the application assets before building.' >&2
  exit 1
fi
mkdir -p "$MODSTEMPEL_BUILD/res" "$MODSTEMPEL_BUILD/gen" "$MODSTEMPEL_BUILD/classes" "$MODSTEMPEL_BUILD/dex" "$MODSTEMPEL_OUTPUT" "$MODSTEMPEL_PRIVATE"
chmod 700 "$MODSTEMPEL_PRIVATE"
timeout 30s "$MODSTEMPEL_TOOLCHAIN/build-tools/aapt2" compile --no-crunch --dir "$PROJECT_DIR/android/app/src/main/res" -o "$MODSTEMPEL_BUILD/resources.zip"
timeout 30s "$MODSTEMPEL_TOOLCHAIN/build-tools/aapt2" link -o "$MODSTEMPEL_BUILD/unsigned.apk" -I "$MODSTEMPEL_TOOLCHAIN/platform/android.jar" --manifest "$PROJECT_DIR/android/app/src/main/AndroidManifest.xml" -A "$PROJECT_DIR/web" -R "$MODSTEMPEL_BUILD/resources.zip" --auto-add-overlay --java "$MODSTEMPEL_BUILD/gen" --min-sdk-version 26 --target-sdk-version 35 --version-code 10 --version-name 2.2.0
python3 - "$MODSTEMPEL_BUILD" "$PROJECT_DIR" <<'PY'
from pathlib import Path
import sys
build, project = map(Path, sys.argv[1:])
files = sorted((project / 'android/app/src/main/java').rglob('*.java')) + sorted((build / 'gen').rglob('*.java'))
(build / 'sources.txt').write_text('\n'.join('"' + str(f) + '"' for f in files) + '\n')
for stale in (build / 'classes').rglob('*.class'):
    stale.unlink()
PY
timeout 60s java "${JAVA_LIMITS[@]}" -jar "$MODSTEMPEL_TOOLCHAIN/ecj.jar" -source 8 -target 8 -encoding UTF-8 -warn:none -classpath "$MODSTEMPEL_TOOLCHAIN/platform/android.jar" -d "$MODSTEMPEL_BUILD/classes" @"$MODSTEMPEL_BUILD/sources.txt"
python3 - "$MODSTEMPEL_BUILD" <<'PY'
from pathlib import Path
import sys, zipfile
build = Path(sys.argv[1])
with zipfile.ZipFile(build / 'classes.jar', 'w', zipfile.ZIP_DEFLATED) as jar:
    for path in sorted((build / 'classes').rglob('*.class')):
        jar.write(path, path.relative_to(build / 'classes'))
PY
timeout 90s java "${JAVA_LIMITS[@]}" -cp "$MODSTEMPEL_TOOLCHAIN/build-tools/lib/d8.jar" com.android.tools.r8.D8 --min-api 26 --lib "$MODSTEMPEL_TOOLCHAIN/platform/android.jar" --output "$MODSTEMPEL_BUILD/dex" "$MODSTEMPEL_BUILD/classes.jar"
python3 - "$MODSTEMPEL_BUILD" <<'PY'
from pathlib import Path
import sys, zipfile
build = Path(sys.argv[1])
with zipfile.ZipFile(build / 'unsigned.apk', 'a', zipfile.ZIP_DEFLATED) as apk:
    for path in sorted((build / 'dex').glob('*.dex')):
        apk.write(path, path.name)
PY
timeout 30s "$MODSTEMPEL_TOOLCHAIN/build-tools/zipalign" -f -P 16 4 "$MODSTEMPEL_BUILD/unsigned.apk" "$MODSTEMPEL_BUILD/aligned.apk"
if [[ ! -f "$MODSTEMPEL_PRIVATE/modstempel.keystore" ]]; then
  python3 - "$MODSTEMPEL_PRIVATE/signing-password.txt" <<'PY'
from pathlib import Path
import secrets, sys, os
path = Path(sys.argv[1]); path.write_text(secrets.token_urlsafe(48)); path.chmod(0o600)
PY
  timeout 30s keytool -J-XX:ActiveProcessorCount=2 -J-XX:+UseSerialGC -J-Xmx128m -genkeypair -keystore "$MODSTEMPEL_PRIVATE/modstempel.keystore" -storepass:file "$MODSTEMPEL_PRIVATE/signing-password.txt" -keypass:file "$MODSTEMPEL_PRIVATE/signing-password.txt" -alias modstempel -keyalg RSA -keysize 3072 -validity 7300 -dname 'CN=Modstempel, OU=Mobile, O=Modstempel' -storetype PKCS12 >/dev/null
  chmod 600 "$MODSTEMPEL_PRIVATE/modstempel.keystore"
fi
timeout 45s java "${JAVA_LIMITS[@]}" -jar "$MODSTEMPEL_TOOLCHAIN/build-tools/lib/apksigner.jar" sign --ks "$MODSTEMPEL_PRIVATE/modstempel.keystore" --ks-key-alias modstempel --ks-pass "file:$MODSTEMPEL_PRIVATE/signing-password.txt" --out "$MODSTEMPEL_OUTPUT/Crazy_Batto-Discord-App-2.2.0.apk" "$MODSTEMPEL_BUILD/aligned.apk"
timeout 30s java "${JAVA_LIMITS[@]}" -jar "$MODSTEMPEL_TOOLCHAIN/build-tools/lib/apksigner.jar" verify --verbose "$MODSTEMPEL_OUTPUT/Crazy_Batto-Discord-App-2.2.0.apk"
timeout 20s "$MODSTEMPEL_TOOLCHAIN/build-tools/zipalign" -c -P 16 4 "$MODSTEMPEL_OUTPUT/Crazy_Batto-Discord-App-2.2.0.apk"
printf '%s\n' "APK: $MODSTEMPEL_OUTPUT/Crazy_Batto-Discord-App-2.2.0.apk"
