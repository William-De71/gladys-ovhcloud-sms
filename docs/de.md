# OVHcloud SMS

## Überblick

Diese Integration sendet die Benachrichtigungen von Gladys per SMS über die
[SMS-API von OVHcloud](https://www.ovhcloud.com/en-gb/sms/) (Seite auf Englisch), an jede
Mobilnummer und jeden Anbieter. Jeder Gladys-Benutzer gibt seine eigene Nummer
ein; der Administrator gibt die Schlüssel der OVHcloud-API einmal für das Haus
ein.

Außerdem bringt sie:

- drei **Szenenauslöser**: SMS nicht gesendet, SMS empfangen, wenig Guthaben;
- zwei **Szenenaktionen**: eine SMS an eine beliebige Nummer senden (auch an
  jemanden ohne Gladys-Konto), das SMS-Konto lesen;
- zwei **Dashboard-Widgets**: das SMS-Konto und die empfangenen SMS.

![Die zwei Widgets der Integration: das SMS-Konto mit seinem Guthaben und die zuletzt empfangenen SMS (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-ovhcloud-sms/main/docs/assets/widgets.de.png)

Transport: **Cloud**. Die Texte und die Rufnummern laufen über die
OVHcloud-API (`eu.api.ovh.com` oder `ca.api.ovh.com`) und dann über die
Mobilfunkanbieter.

## Voraussetzungen

- Gladys Assistant **5.1.0** oder neuer.
- Ein OVHcloud-Konto mit einem **SMS-Konto** (ein SMS-Paket, bestellt im
  Control Panel unter Telecom → SMS) und etwas Guthaben. Jede SMS verbraucht
  Guthaben, mehr bei einem langen Text oder einer ausländischen Nummer.
- Optional: ein im Control Panel angelegter und freigegebener **Absender**
  (ein Name wie `GLADYS` oder eine virtuelle Nummer). Ohne ihn gehen die SMS
  von einer Kurznummer aus, auf die die Empfänger antworten können.
- Optional, zum Empfangen von SMS: eine **virtuelle Nummer** oder Antworten an
  die Kurznummer.

## Konfiguration

1. Öffnen Sie in Gladys **Integrationen → OVHcloud SMS → Konfiguration**.
2. Wählen Sie die **API-Region** Ihres OVHcloud-Kontos (Europa oder Kanada).
3. Klicken Sie auf **Schlüssel erstellen** für Ihre Region. Melden Sie sich
   bei OVHcloud an: Die Rechte, die die Integration braucht, sind bereits
   ausgefüllt (`GET /sms`, `GET /sms/*`, `POST /sms/*/jobs`). Geben Sie der
   Anwendung einen Namen und eine Beschreibung, wählen Sie die Gültigkeit
   **Unlimited** und erstellen Sie die Schlüssel.
4. Übertragen Sie **Application Key**, **Application Secret** und
   **Consumer Key** in die Konfiguration und speichern Sie.
5. Klicken Sie auf **Verbindung testen**: Es zeigt das SMS-Konto, sein
   Guthaben, seine Absender und den verwendeten. **Test-SMS senden** prüft
   die ganze Kette.
6. Jeder Benutzer öffnet den Block **Mein Konto** desselben Bildschirms und
   gibt seine **Mobilnummer** ein.

| Feld                       | Verwendung                                                                     |
| -------------------------- | ------------------------------------------------------------------------------ |
| API-Region                 | Europa (ovh.com, ovhcloud.com) oder Kanada (ovh.ca)                            |
| Application Key            | Von der Seite zur Schlüsselerstellung                                          |
| Application Secret         | Von der Seite zur Schlüsselerstellung, verschlüsselt gespeichert               |
| Consumer Key               | Von der Seite zur Schlüsselerstellung, verschlüsselt gespeichert               |
| SMS-Konto                  | Optional: `sms-xx12345-1`, nur wenn das OVHcloud-Konto mehrere hat             |
| Absender                   | Optional: ein aktiver Absender; leer = der erste aktive oder die Kurznummer    |
| Standard-Ländervorwahl     | Wird Nummern ohne Vorwahl vorangestellt (`33` als Standard: 06… wird zu +336…) |
| Warnung bei wenig Guthaben | Unter dieser Guthabenzahl löst „Wenig Guthaben“ einmal aus (Standard 20)       |
| Empfangene SMS lesen       | Liest die empfangenen SMS alle 30 Sekunden, für „SMS empfangen“ und das Widget |

Die Integration fügt nie den „STOP“-Hinweis hinzu, den OVHcloud an
Werbe-SMS anhängt: Die Benachrichtigungen eines Hauses sind keine Werbung.

## Verwendung

### Benachrichtigungen

Jede Gladys-Benachrichtigung an einen Benutzer, der eine Nummer eingegeben
hat, geht per SMS raus: Alarme, Szenenaktionen „Nachricht senden“, Antworten
von Gladys. Ein an eine Nachricht angehängtes Bild entfällt (eine SMS
transportiert nur Text).

### Szenenauslöser

| Auslöser           | Wann er auslöst                                                                                                  | Variablen                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| SMS nicht gesendet | Beim ersten Fehler einer Benachrichtigung, danach erst wieder nach einer erfolgreichen SMS (keine Schleife)      | Ursache, HTTP-Status, Fehler, maskierte Nummer |
| SMS empfangen      | Bei jeder neuen SMS des Kontos, gefiltert nach Absender und erstem Wort („Empfangene SMS lesen“ muss aktiv sein) | Absender, Text, erstes Wort, Datum             |
| Wenig Guthaben     | Das Guthaben ist unter die Schwelle gefallen; erneut erst nach einer Aufladung darüber                           | Restguthaben, Schwelle, SMS-Konto              |

**Nutzen Sie „SMS empfangen“ nie, um eine Tür zu öffnen oder eine
Alarmanlage zu entschärfen**: Jeder kann eine SMS mit gefälschter Nummer
senden.

### Szenenaktionen

- **SMS an eine Nummer senden**: eine oder mehrere durch Kommas getrennte
  Nummern und ein Text (Szenenvariablen erlaubt). Gibt die gesendeten SMS,
  die abgelehnten Nummern, das verbrauchte und das restliche Guthaben zurück.
- **SMS-Konto lesen**: gibt das Restguthaben, die in diesem Monat gesendeten
  und empfangenen SMS und das SMS-Konto zurück.

### Szenenbeispiele

- _Wenn der Alarm ausgelöst wird_ → eine SMS an den Nachbarn senden: „Alarm
  bei uns zu Hause, kannst du nachsehen?“.
- _Wenn das Guthaben knapp wird_ → dem Administrator eine Nachricht senden:
  „Nur noch {{triggerEvent.data.credits_left}} SMS-Guthaben“.
- _Wenn eine SMS mit STATUS von meiner Nummer empfangen wird_ → die
  Temperaturen lesen und mit „SMS an eine Nummer senden“ an
  `{{triggerEvent.data.sender}}` antworten.

### Dashboard-Widgets

- **OVHcloud-SMS**: Restguthaben (orange nahe der Schwelle, rot darunter),
  Zustand der API, in diesem Monat gesendete und empfangene SMS, Absender,
  Schwelle und letzter Fehler.
- **Empfangene SMS**: die zuletzt empfangenen SMS; tippen Sie auf eine, um sie
  ganz zu lesen.

## Fehlerbehebung

- **„OVHcloud lehnt die Schlüssel ab“**: Prüfen Sie Region, Application Key
  und Secret und ob der Consumer Key bestätigt wurde (die Erstellungsseite
  muss mit einem Erfolg enden) und nicht abgelaufen oder widerrufen ist.
- **„Dem Consumer Key fehlen Rechte“**: Erstellen Sie einen neuen Schlüssel
  über den Link der Konfiguration, der die drei Rechte ausfüllt.
- **„Kein nutzbares SMS-Konto“**: Bestellen Sie ein SMS-Paket oder geben Sie
  den Dienstnamen ein, wenn Ihr OVHcloud-Konto mehrere SMS-Konten hat (von
  „Verbindung testen“ aufgelistet).
- **„Absender abgelehnt“**: Der Absender der Konfiguration ist noch nicht
  aktiv (wartet auf Freigabe): Leeren Sie das Feld für die automatische Wahl.
- **Keine SMS empfangen**: Der Empfang braucht eine virtuelle Nummer oder
  Antworten an die Kurznummer; prüfen Sie, ob „Empfangene SMS lesen“ aktiv
  ist.
- **Protokolle**: Integrationen → OVHcloud SMS → Reiter Überwachung. Die
  Rufnummern sind maskiert; die Schlüssel erscheinen nie.
