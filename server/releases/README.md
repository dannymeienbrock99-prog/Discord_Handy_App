# Privater APK-Download

Die fertige Android-App wird separat bereitgestellt. Dieses öffentliche Repository enthält ihren vollständigen Quellcode und die Buildanleitung. Für den Download nach Betreiberfreigabe die bereits erhaltene **Crazy_Batto-Discord-App-2.2.0.apk** in diesen Ordner kopieren.

| Prüfung | Erwarteter Wert |
| --- | --- |
| Dateiname | `Crazy_Batto-Discord-App-2.2.0.apk` |
| Dateigröße | 2.897.205 Bytes |
| SHA-256 | `5b2d762e10b22082048b76d420ce7a179598c387b7d7af3600683e538893cd04` |

Docker Compose bindet diesen Ordner schreibgeschützt unter `/releases` ein. `APK_VERSION=2.2.0` legt den erwarteten Dateinamen fest. Bei direktem Node-Betrieb kann `APK_PATH` auf die private APK-Datei zeigen.

Ohne hinterlegte APK bleiben Webseite und Registrierung nutzbar. Freigegebenen Nutzern wird angezeigt, dass der Download noch vorbereitet wird. Die vorhandene App wird über `/portal/download` nur mit gültiger Anmeldung und aktueller Betreiberfreigabe ausgeliefert.

Fertige APKs werden deshalb nicht in dieses öffentliche Repository oder öffentliche GitHub Releases eingestellt. Für ein Update über eine bestehende Installation wird der ursprüngliche, separat aufzubewahrende Signierschlüssel benötigt.
