# ki-ff-ext

Firefox-Erweiterung zum direkten Überarbeiten von Texten in Eingabefeldern und Rich-Text-Editoren mit OpenAI.

Die Erweiterung fügt ein Kontextmenü hinzu, mit dem markierter Text oder der gesamte Inhalt eines editierbaren Feldes direkt verbessert, korrigiert oder als Prompt an OpenAI gesendet werden kann.

## Features

- Kontextmenü **OpenAI Text**
- Aktionen:
  - **Rechtschreibung**
  - **Optimieren**
  - **Prompt**
- Funktioniert in:
  - `textarea`
  - Text-`input`-Feldern
  - `contenteditable`-Feldern
  - vielen Rich-Text-Editoren wie z. B. CKEditor
- Speicherung von:
  - OpenAI API-Key
  - gewünschtem Modell
- API-Key-Test direkt in den Optionen
- Einfaches Undo nach dem Ersetzen mit **Strg+Z** / **Cmd+Z**

## So funktioniert es

Nach der Installation kannst du in ein bearbeitbares Feld klicken oder Text markieren und dann per Rechtsklick das neue Kontextmenü verwenden:

- **Rechtschreibung**  
  Korrigiert Rechtschreibung, Grammatik, Zeichensetzung und offensichtliche Tippfehler.

- **Optimieren**  
  Verbessert Stil, Lesbarkeit und sprachliche Qualität, ohne die Kernaussage zu verändern.

- **Prompt**  
  Sendet den ausgewählten Text oder den gesamten Feldinhalt direkt als Prompt an OpenAI und ersetzt ihn durch die Antwort.

## Installation für lokale Entwicklung

1. Repository klonen oder herunterladen
2. Firefox öffnen
3. `about:debugging` aufrufen
4. **Dieser Firefox**
5. **Temporäres Add-on laden**
6. Die `manifest.json` der Erweiterung auswählen

## Einrichtung

1. Erweiterung installieren / temporär laden
2. Optionen der Erweiterung öffnen
3. OpenAI API-Key eintragen
4. Modell auswählen
5. Auf **API-Key testen und speichern** klicken

Der API-Key wird lokal in Firefox über `browser.storage.local` gespeichert.

## Unterstützte Modelle

Aktuell sind in der Erweiterung folgende Modelle auswählbar:

- `gpt-4o-mini`
- `gpt-4.1-mini`
- `gpt-4.1`

## Nutzung

### Beispiel 1: Rechtschreibung korrigieren

1. In ein Textfeld klicken
2. Optional einen Abschnitt markieren
3. Rechtsklick
4. **OpenAI Text → Rechtschreibung**

### Beispiel 2: Text optimieren

1. Text eingeben oder vorhandenen Text auswählen
2. Rechtsklick
3. **OpenAI Text → Optimieren**

### Beispiel 3: Prompt direkt ausführen

Wenn in einem Editor z. B. folgender Text steht:

> Schreib einen Lorem Ipsum mit 400 Zeichen und gib nur den Lorem Ipsum zurück.

Dann:

1. Rechtsklick im Editor
2. **OpenAI Text → Prompt**

Die Erweiterung sendet den Text direkt an OpenAI und ersetzt den Inhalt des Felds durch die Antwort.

## Technische Hinweise

- Die Erweiterung verwendet die OpenAI **Responses API**
- Aus Sicherheitsgründen wird der API-Key **nicht extern**, sondern nur lokal im Browser gespeichert
- Bei `contenteditable`-Feldern und Rich-Text-Editoren wird versucht, Änderungen editor-kompatibel einzufügen
- Falls ein Editor direkte DOM-Änderungen nicht akzeptiert, nutzt die Erweiterung native Eingabe-/Einfügepfade als Fallback

## Bekannte Einschränkungen

- Nicht jeder Web-Editor reagiert identisch auf externe Texteingaben
- Bei sehr stark angepassten Rich-Text-Editoren kann das Zurückschreiben eingeschränkt sein
- Formatierungen können je nach Editor ganz oder teilweise verloren gehen, wenn reiner Text ersetzt wird
- Die Funktion hängt davon ab, dass die Seite Eingaben und Script-Events im Editor korrekt verarbeitet

## Datenschutz

- Der OpenAI API-Key wird lokal in Firefox gespeichert
- Texte werden nur dann an OpenAI gesendet, wenn du die Funktion aktiv per Kontextmenü ausführst
- Es erfolgt keine automatische Hintergrundanalyse von Eingaben

## Geplante nächste Schritte

- Eigene benutzerdefinierte Prompts
- Bessere Unterstützung weiterer Rich-Text-Editoren
- Optionales Toast-/Status-Feedback statt `alert()`
- Mehr Undo-/Redo-Kompatibilität
- Verbesserte Fehlerdiagnose bei Editor-Integrationen
- Mistral AI hinzufügen
- Veröfentlichen bei Firefox Extensions

## Release

**First Release / v0.1.0**

Enthalten:
- OpenAI-Anbindung
- Modellwahl in den Optionen
- API-Key-Test und lokale Speicherung
- Kontextmenü mit 3 Aktionen
- Unterstützung für Textfelder und `contenteditable`
- Undo mit Strg/Cmd+Z

## Lizenz

MIT

## Hinweise für Contributor

Verbesserungsvorschläge, Bugreports und PRs sind willkommen.

Besonders interessant:
- Unterstützung weiterer Editoren
- robustere Auswahl-/Einfügelogik
- bessere UX in der Optionsseite
- Tests für unterschiedliche Webseiten und Eingabefelder
