const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config');

class AiService {
  constructor() {
    this.client = null;
    this.provider = null;
    this.model = null;
  }

  /**
   * Client initialisieren basierend auf Provider-Auswahl
   */
  async init() {
    const settings = this.getAzureSettings();
    if (!settings.endpoint) {
      throw new Error('KI-Endpoint fehlt. Bitte in der Administration konfigurieren.');
    }
    if (!settings.useManagedIdentity && !settings.apiKey) {
      throw new Error('API Key fehlt. Bitte in der Administration einen API Key hinterlegen oder Managed Identity aktivieren.');
    }

    this.provider = settings.provider || 'openai';
    this.model = settings.deployment || 'gpt-4o';

    if (this.provider === 'inference') {
      // Azure AI Inference SDK – für Anthropic, Mistral, Llama und andere Foundry-Modelle
      const ModelClient = require('@azure-rest/ai-inference').default;
      let credential;
      if (settings.useManagedIdentity) {
        const { DefaultAzureCredential } = require('@azure/identity');
        credential = new DefaultAzureCredential();
      } else {
        const { AzureKeyCredential } = require('@azure/core-auth');
        credential = new AzureKeyCredential(settings.apiKey);
      }
      this.client = ModelClient(settings.endpoint, credential);
    } else {
      // Azure OpenAI SDK – für OpenAI-Modelle (GPT-4o, GPT-4, etc.)
      const { AzureOpenAI } = require('openai');
      if (settings.useManagedIdentity) {
        const { DefaultAzureCredential, getBearerTokenProvider } = require('@azure/identity');
        const credential = new DefaultAzureCredential();
        const azureADTokenProvider = getBearerTokenProvider(
          credential,
          'https://cognitiveservices.azure.com/.default'
        );
        this.client = new AzureOpenAI({
          endpoint: settings.endpoint,
          azureADTokenProvider,
          apiVersion: settings.apiVersion || '2024-08-01-preview'
        });
      } else {
        this.client = new AzureOpenAI({
          endpoint: settings.endpoint,
          apiKey: settings.apiKey,
          apiVersion: settings.apiVersion || '2024-08-01-preview'
        });
      }
    }
  }

  /**
   * Azure-Einstellungen aus der Konfig lesen
   */
  getAzureSettings() {
    const settingsPath = path.join(CONFIG_DIR, 'ai-settings.json');
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
    // Fallback auf Umgebungsvariablen
    return {
      provider: process.env.AI_PROVIDER || 'openai',
      endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
      apiKey: process.env.AZURE_OPENAI_API_KEY || '',
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview',
      useManagedIdentity: process.env.USE_MANAGED_IDENTITY === 'true'
    };
  }

  /**
   * Azure-Einstellungen speichern und Client zurücksetzen
   */
  saveAzureSettings(settings) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const settingsPath = path.join(CONFIG_DIR, 'ai-settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    // Client zurücksetzen, damit beim nächsten Aufruf neu initialisiert wird
    this.client = null;
    this.provider = null;
    this.model = null;
  }

  /**
   * Chat-Completion senden – delegiert an den aktiven Provider
   */
  async chat(messages) {
    if (!this.client) await this.init();

    if (this.provider === 'inference') {
      return this._chatInference(messages);
    }
    return this._chatOpenAI(messages);
  }

  /**
   * Chat über Azure OpenAI SDK
   */
  async _chatOpenAI(messages) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.3,
      max_tokens: 4096
    });
    return response.choices[0].message.content;
  }

  /**
   * Chat über Azure AI Inference SDK (Anthropic, Mistral, Llama, etc.)
   */
  async _chatInference(messages) {
    const { isUnexpected } = require('@azure-rest/ai-inference');
    const response = await this.client.path('/chat/completions').post({
      body: {
        messages,
        temperature: 0.3,
        max_tokens: 4096,
        model: this.model
      }
    });

    if (isUnexpected(response)) {
      throw new Error(`AI Inference Fehler: ${response.body?.error?.message || response.status}`);
    }

    return response.body.choices[0].message.content;
  }

  /**
   * Wiki-Struktur aus Dateien vorschlagen
   */
  async suggestStructure(files, wikiSettings) {
    const fileList = files
      .map(f => `- ${f.path} (${f.type})${f.content ? '\n  Inhalt (Auszug): ' + f.content.substring(0, 500) : ''}`)
      .join('\n');

    const messages = [
      {
        role: 'system',
        content: `Du bist ein Experte für Wissensmanagement und Wiki-Strukturierung.
Deine Aufgabe ist es, aus den bereitgestellten Dateien eine sinnvolle Wiki-Struktur im Markdown-Format vorzuschlagen.

${wikiSettings ? 'Wiki-Konfiguration:\n' + wikiSettings : ''}

Antworte im folgenden JSON-Format:
{
  "structure": [
    { "path": "ordner/datei.md", "title": "Seitentitel", "description": "Kurzbeschreibung des Inhalts" }
  ],
  "summary": "Kurze Zusammenfassung der vorgeschlagenen Struktur"
}`
      },
      {
        role: 'user',
        content: `Hier sind die hochgeladenen Dateien:\n\n${fileList}\n\nBitte schlage eine Wiki-Struktur vor.`
      }
    ];

    const response = await this.chat(messages);
    // KI-Antwort bereinigen: Markdown-Code-Fences entfernen
    const cleaned = response.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  }

  /**
   * Wiki-Seiten generieren basierend auf genehmigter Struktur
   */
  async generateWikiPages(files, structure, wikiSettings, notes) {
    const generatedPages = [];

    // Strukturübersicht für Kontext
    const structureOverview = structure
      .map(s => `- [${s.title}](${s.path}): ${s.description}`)
      .join('\n');

    const notesContext = notes
      ? `\n\nBenutzer-Anpassungen (diese Wünsche MÜSSEN berücksichtigt werden):\n${notes}`
      : '';

    for (const page of structure) {
      // Relevante Quell-Dateien finden
      const relevantFiles = files
        .filter(f => f.content)
        .map(f => `### ${f.path}\n${f.content}`)
        .join('\n\n---\n\n');

      const isIndexPage = /^(index|readme|home|übersicht)\.md$/i.test(page.path.split('/').pop());

      const systemPrompt = isIndexPage
        ? `Du bist ein Experte für technische Dokumentation und Wissensmanagement.
Erstelle eine Wiki-Startseite (Index) im Markdown-Format.

${wikiSettings ? 'Wiki-Konfiguration:\n' + wikiSettings : ''}

Diese Seite ist die STARTSEITE des Wikis und soll:
- Eine kurze Einleitung zum Wiki geben
- Alle Wiki-Seiten auflisten und mit relativen Markdown-Links verlinken
- Für jede verlinkte Seite eine kurze Beschreibung enthalten
- Gut strukturiert sein mit Überschriften und Listen

Hier sind alle Seiten des Wikis:
${structureOverview}${notesContext}

Antworte NUR mit dem Markdown-Inhalt der Seite, ohne Code-Blöcke drumherum.`
        : `Du bist ein Experte für technische Dokumentation und Wissensmanagement.
Erstelle eine Wiki-Seite im Markdown-Format basierend auf den bereitgestellten Quelldateien.

${wikiSettings ? 'Wiki-Konfiguration:\n' + wikiSettings : ''}

Die Seite soll:
- Gut strukturiert sein mit Überschriften, Listen und Tabellen wo sinnvoll
- Verweise auf andere Wiki-Seiten als relative Markdown-Links enthalten
- Fachlich korrekt und verständlich sein

Andere Seiten im Wiki (für Verlinkungen):
${structureOverview}${notesContext}

Antworte NUR mit dem Markdown-Inhalt der Seite, ohne Code-Blöcke drumherum.`;

      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Erstelle die Wiki-Seite "${page.title}" (${page.path}).
Beschreibung: ${page.description}

Quelldateien:
${relevantFiles}`
        }
      ];

      const content = await this.chat(messages);
      generatedPages.push({ path: page.path, content, title: page.title });
    }

    return generatedPages;
  }

  /**
   * Wiki-Struktur anpassen basierend auf Benutzer-Feedback
   */
  async refineStructure(currentStructure, feedback, files, wikiSettings) {
    const fileList = files
      .map(f => `- ${f.path} (${f.type})${f.content ? '\n  Inhalt (Auszug): ' + f.content.substring(0, 300) : ''}`)
      .join('\n');

    const structureJson = JSON.stringify(currentStructure, null, 2);

    const messages = [
      {
        role: 'system',
        content: `Du bist ein Experte für Wissensmanagement und Wiki-Strukturierung.
Der Benutzer hat bereits eine Wiki-Struktur erhalten und möchte diese anpassen.

${wikiSettings ? 'Wiki-Konfiguration:\n' + wikiSettings : ''}

Passe die bestehende Struktur basierend auf dem Feedback des Benutzers an.
Du kannst Seiten hinzufügen, entfernen, umbenennen oder die Beschreibungen ändern.

Antworte im folgenden JSON-Format:
{
  "structure": [
    { "path": "ordner/datei.md", "title": "Seitentitel", "description": "Kurzbeschreibung des Inhalts" }
  ],
  "summary": "Kurze Beschreibung der vorgenommenen Änderungen"
}`
      },
      {
        role: 'user',
        content: `Aktuelle Struktur:\n${structureJson}\n\nVerfügbare Quelldateien:\n${fileList}\n\nMein Feedback:\n${feedback}`
      }
    ];

    const response = await this.chat(messages);
    const cleaned = response.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  }
}

module.exports = new AiService();
