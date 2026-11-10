#!/usr/bin/env bash
# Compila o app Android da DIA e coloca o APK em apps/android/dist (servido pela DIA).
# Precisa do SDK do Android (ANDROID_HOME). A chave de assinatura vem de apps/android/keystore
# (ou das variáveis DIA_KEYSTORE / DIA_KEYSTORE_PASSWORD). Use sempre a mesma chave: com outra,
# a versão nova não instala por cima da antiga.
set -euo pipefail
cd "$(dirname "$0")/../apps/android"
: "${ANDROID_HOME:?Defina ANDROID_HOME (SDK do Android)}"
[ -n "${DIA_KEYSTORE:-}" ] || [ -f keystore/dia.jks ] || { echo "Falta a chave de assinatura (apps/android/keystore/dia.jks)"; exit 1; }
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew --no-daemon -q testReleaseUnitTest assembleRelease
APK=app/build/outputs/apk/release/app-release.apk
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
"$BT/apksigner" verify "$APK"
mkdir -p dist
cp "$APK" dist/dia.apk
CODE=$(sed -n 's/.*versionCode = \([0-9]*\).*/\1/p' app/build.gradle.kts)
NAME=$(sed -n 's/.*versionName = "\(.*\)".*/\1/p' app/build.gradle.kts)
SHA=$(sha256sum dist/dia.apk | cut -d' ' -f1)
printf '{\n  "versionCode": %s,\n  "versionName": "%s",\n  "sha256": "%s"\n}\n' "$CODE" "$NAME" "$SHA" > dist/version.json
echo "APK pronto: apps/android/dist/dia.apk (versão $NAME)"
