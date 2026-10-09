#!/usr/bin/env bash
set -euo pipefail
ANDROID_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$ANDROID_DIR")"
TASK_DIR="$(dirname "$PROJECT_DIR")"
MODSTEMPEL_TOOLCHAIN="${MODSTEMPEL_TOOLCHAIN:-$TASK_DIR/toolchain}"
JAVA_LIMITS=(-XX:ActiveProcessorCount=2 -XX:+UseSerialGC -Xmx256m)
MODSTEMPEL_JSON_JAR="$MODSTEMPEL_TOOLCHAIN/test-libs/json-20240303.jar"
# Test-only official org.json implementation. Android's platform jar contains method stubs.
# This jar is never an application dependency and is never added to the APK.
timeout 30s python3 - "$MODSTEMPEL_JSON_JAR" <<'PY'
from pathlib import Path
import hashlib, sys, urllib.request
target = Path(sys.argv[1])
expected = '3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed'
if not target.is_file():
    url = 'https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar'
    with urllib.request.urlopen(url, timeout=20) as response:
        data = response.read(100000)
    if hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit('The org.json test dependency checksum does not match.')
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.download')
    temporary.write_bytes(data)
    temporary.replace(target)
if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
    raise SystemExit('The cached org.json test dependency checksum does not match.')
PY
MODSTEMPEL_TEST_PRODUCTION="$ANDROID_DIR/build/native-contract-production"
mkdir -p "$MODSTEMPEL_TEST_PRODUCTION"
# Compile current native sources for the tests, independently of any existing/released APK build.
python3 - "$ANDROID_DIR" "$MODSTEMPEL_TEST_PRODUCTION" <<'PY'
from pathlib import Path
import sys
android, output = map(Path, sys.argv[1:])
for stale in output.rglob('*.class'):
    stale.unlink()
sources = sorted((android / 'app/src/main/java').rglob('*.java'))
(output / 'sources.txt').write_text('\n'.join('"' + str(path) + '"' for path in sources) + '\n')
PY
timeout 45s java "${JAVA_LIMITS[@]}" -jar "$MODSTEMPEL_TOOLCHAIN/ecj.jar" -source 8 -target 8 -encoding UTF-8 -warn:none -classpath "$MODSTEMPEL_TOOLCHAIN/platform/android.jar" -d "$MODSTEMPEL_TEST_PRODUCTION" @"$MODSTEMPEL_TEST_PRODUCTION/sources.txt"
MODSTEMPEL_TEST_CLASSPATH="$MODSTEMPEL_JSON_JAR:$MODSTEMPEL_TEST_PRODUCTION:$MODSTEMPEL_TOOLCHAIN/platform/android.jar"
mkdir -p "$ANDROID_DIR/build/test-classes"
timeout 30s java "${JAVA_LIMITS[@]}" -jar "$MODSTEMPEL_TOOLCHAIN/ecj.jar" -source 8 -target 8 -encoding UTF-8 -warn:none -classpath "$MODSTEMPEL_TEST_CLASSPATH" -d "$ANDROID_DIR/build/test-classes" "$ANDROID_DIR/tests/NativeContractTest.java" "$ANDROID_DIR/tests/DiscordErrorTest.java" "$ANDROID_DIR/tests/NativeSendContractTest.java" "$ANDROID_DIR/tests/NativeBackendTest.java" "$ANDROID_DIR/tests/NativeBackendTransportTest.java" "$ANDROID_DIR/tests/NativeAccessTest.java"
timeout 20s java "${JAVA_LIMITS[@]}" -cp "$ANDROID_DIR/build/test-classes:$MODSTEMPEL_TEST_CLASSPATH" NativeContractTest
timeout 20s java "${JAVA_LIMITS[@]}" -cp "$ANDROID_DIR/build/test-classes:$MODSTEMPEL_TEST_CLASSPATH" app.modstempel.mobile.DiscordErrorTest
timeout 20s java "${JAVA_LIMITS[@]}" -cp "$ANDROID_DIR/build/test-classes:$MODSTEMPEL_TEST_CLASSPATH" app.modstempel.mobile.NativeSendContractTest
timeout 20s java "${JAVA_LIMITS[@]}" -cp "$ANDROID_DIR/build/test-classes:$MODSTEMPEL_TEST_CLASSPATH" app.modstempel.mobile.NativeBackendTest
timeout 20s java "${JAVA_LIMITS[@]}" -cp "$ANDROID_DIR/build/test-classes:$MODSTEMPEL_TEST_CLASSPATH" app.modstempel.mobile.NativeBackendTransportTest
timeout 20s java "${JAVA_LIMITS[@]}" -cp "$ANDROID_DIR/build/test-classes:$MODSTEMPEL_TEST_CLASSPATH" app.modstempel.mobile.NativeAccessTest
