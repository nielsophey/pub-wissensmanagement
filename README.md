# Wissenmanagement App

KI-gestütztes Wissensmanagement – generiert aus hochgeladenen Dateien ein strukturiertes Markdown-Wiki.

## Features

- 📄 **Datei-Upload** – Dateien und ZIP-Archive hochladen, die als Wissensbasis dienen
- 🤖 **KI-gestützte Strukturierung** – die KI analysiert die Dateien und schlägt eine Wiki-Struktur vor
- 📝 **Wiki-Generierung** – nach Freigabe der Struktur werden vollständige Markdown-Seiten generiert
- ✅ **TODO-Erkennung** – offene Punkte in den Wiki-Artikeln werden automatisch als Aufgaben erkannt
- 🚀 **Veröffentlichung** – Wiki direkt auf GitHub oder Azure DevOps publizieren, TODOs als Issues/Work Items anlegen
- ⬇️ **Download** – generiertes Wiki als ZIP-Archiv herunterladen
- 🔐 **Flexible Authentifizierung** – API Key oder Azure Managed Identity

## Voraussetzungen

- Node.js >= 18
- Zugang zu einem der folgenden KI-Services:
  - **Azure OpenAI** – für GPT-4o, GPT-4, GPT-3.5 Turbo etc.
  - **Azure AI Inference** (Foundry) – für Anthropic Claude, Mistral, Meta Llama und weitere Modelle aus dem Azure AI Foundry Katalog

## Installation

```bash
npm install
```

## Konfiguration

### Schnellstart mit Example-Dateien

Im Verzeichnis `config/` liegen Beispiel-Dateien, die als Vorlage dienen:

```bash
cp config/ai-settings.example.json config/ai-settings.json
cp config/publish-settings.example.json config/publish-settings.json
# wiki-settings.md kann direkt bearbeitet oder über /admin angepasst werden
```

Alternativ lassen sich alle Einstellungen über die Admin-Oberfläche unter `/admin` konfigurieren.

### KI-Provider

| Einstellung | Beispiel |
|---|---|
| Provider | Azure OpenAI |
| Endpoint | `https://your-resource.openai.azure.com` |
| API Key | Dein Azure OpenAI Key |
| Deployment | `gpt-4o` |
| API Version | `2024-08-01-preview` |

#### Azure AI Inference (Foundry)

Für Modelle wie Claude 3.5 Sonnet, Mistral Large, Llama 3 etc., die über den Azure AI Foundry Model Catalog bereitgestellt werden.

| Einstellung | Beispiel |
|---|---|
| Provider | Azure AI Inference |
| Endpoint | `https://your-model.region.models.ai.azure.com` |
| API Key | Dein Modell-Key |
| Modell | `claude-3-5-sonnet` |

Alternativ können die Werte über eine `.env`-Datei gesetzt werden:

```bash
cp .env.example .env
```

## Starten

```bash
# Produktion
npm start

# Entwicklung (auto-reload)
npm run dev
```

Die App läuft unter http://localhost:3000

## Deployment auf Azure

Die App kann mit dem [Azure Developer CLI (azd)](https://aka.ms/azd) vollständig auf Azure ausgerollt werden.

### Voraussetzungen

- [Azure Developer CLI](https://aka.ms/azd/install) (`azd`) installiert
- Azure-Subscription mit Berechtigungen zum Erstellen von Ressourcen
- Eine bestehende **Azure OpenAI** oder **Azure AI Services** Ressource

### Provisionierte Azure-Ressourcen

| Ressource | Zweck |
|---|---|
| Resource Group | Container für alle Ressourcen |
| App Service Plan (B1) | Hosting der Node.js App |
| Web App | Laufzeitumgebung mit System-assigned Managed Identity |
| Log Analytics Workspace | Basis für Application Insights |
| Application Insights | App-Monitoring & Fehleranalyse |

### Deployment (3 Schritte)

**Schritt 1 – Einmalig einloggen und Endpoint hinterlegen**

```bash
azd auth login

# Endpoint der Azure OpenAI / AI Services Ressource setzen
azd env set AI_ENDPOINT https://your-resource.openai.azure.com
```

**Schritt 2 – Provision & Deploy**

```bash
# Dry-run (zeigt was erstellt wird, ohne etwas zu ändern)
azd provision --preview

# Ressourcen erstellen und App bereitstellen
azd up
```

`azd up` fragt interaktiv nach Umgebungsname, Azure-Subscription und Region und erstellt anschließend alle Ressourcen sowie den ersten Deployment-Build automatisch.

**Schritt 3 – RBAC-Rolle für Managed Identity vergeben**

Nach dem ersten `azd up` gibt der Output die `managedIdentityPrincipalId` der Web App aus. Diese Managed Identity benötigt die Rolle **Cognitive Services OpenAI User** auf der Azure OpenAI Ressource, damit die App ohne API Key auf den KI-Service zugreifen kann:

```bash
az role assignment create \
  --role "Cognitive Services OpenAI User" \
  --assignee <managedIdentityPrincipalId> \
  --scope /subscriptions/<subscriptionId>/resourceGroups/<resourceGroup>/providers/Microsoft.CognitiveServices/accounts/<aiResourceName>
```

Die Principal ID ist auch im Azure Portal unter **Web App → Identität → System-seitig zugewiesen** zu finden.

### Authentifizierung wählen

In der Admin-Oberfläche (`/admin`) kann unter **KI-Modell Einstellungen → Authentifizierung** zwischen zwei Optionen gewechselt werden:

- **API Key** – klassische Authentifizierung über einen statisch hinterlegten Schlüssel (lokal und Azure)
- **Managed Identity** – schlüssellose Authentifizierung über die Azure Managed Identity (nur im Azure-Deployment)

Beim Deployment via `azd` wird `USE_MANAGED_IDENTITY=true` automatisch als App-Setting gesetzt.

### Updates deployen

```bash
azd deploy
```

### Ressourcen entfernen

```bash
azd down
```

---

## Projektstruktur

```
src/
  server.js          - Express-Server & Routing
  routes/
    api.js           - API-Endpunkte
  services/
    aiService.js     - KI-Integration (Azure OpenAI + AI Inference)
    fileService.js   - Datei- & ZIP-Verarbeitung
    wikiService.js   - Wiki-Generierung
  middleware/
    upload.js        - Multer Upload-Konfiguration
public/
  index.html         - Hauptseite (Durchlauf)
  admin.html         - Administration
  files.html         - Dateiverwaltung
  css/style.css      - Styles
  js/app.js          - Frontend-Logik
config/
  wiki-settings.md   - Wiki-Konfiguration (Markdown)
  *.example.*        - Beispiel-Konfigurationen als Vorlage
data/
  runs/              - Durchlauf-Daten
infra/
  main.bicep         - Azure-Infrastruktur (Einstiegspunkt)
  modules/           - Bicep-Module (App Service, Monitoring)
azure.yaml           - Azure Developer CLI Konfiguration
```

## Wiki veröffentlichen

Das generierte Wiki kann direkt auf eine Plattform publiziert werden. Die Konfiguration erfolgt unter `/admin` → **Plattform-Konfiguration**.

| Plattform | Wiki-Ziel | TODO-Ziel |
|---|---|---|
| **GitHub** | Markdown-Dateien ins Repository | GitHub Issues |
| **Azure DevOps** | Projekt-Wiki Seiten | Work Items (Task, Bug, etc.) |

TODOs werden automatisch aus den Wiki-Artikeln extrahiert (Checkbox-Syntax `- [ ]` und `TODO:`-Marker).

## Wiki-Konfiguration

Über die Datei `config/wiki-settings.md` (oder `/admin`) kann gesteuert werden, wie die KI das Wiki erstellt:

- Sprache und Zielgruppe
- Strukturvorgaben (Überschriften, Tabellen, Codeblöcke)
- Inhaltsvorgaben (Zusammenfassungen, Fachbegriffe, Checklisten)
- Ordnerstruktur-Regeln

Ein Beispiel liegt unter `config/wiki-settings.example.md`.

## Lizenz

Dieses Projekt steht unter der [MIT-Lizenz](LICENSE).
