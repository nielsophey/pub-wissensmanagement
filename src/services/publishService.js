const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config');

class PublishService {

  // ===== Konfiguration =====

  getPublishSettings() {
    const settingsPath = path.join(CONFIG_DIR, 'publish-settings.json');
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
    return { platform: 'github', github: {}, azureDevops: {} };
  }

  savePublishSettings(settings) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(CONFIG_DIR, 'publish-settings.json'),
      JSON.stringify(settings, null, 2),
      'utf-8'
    );
  }

  // ===== Wiki publizieren =====

  async publishWiki(wikiFiles) {
    const settings = this.getPublishSettings();

    if (settings.platform === 'github') {
      return this._publishToGitHub(wikiFiles, settings.github);
    } else if (settings.platform === 'azureDevops') {
      return this._publishToAzureDevops(wikiFiles, settings.azureDevops);
    }
    throw new Error(`Unbekannte Plattform: ${settings.platform}`);
  }

  // ===== Aufgaben aus TODOs anlegen =====

  async createTasksFromTodos(todos) {
    const settings = this.getPublishSettings();

    if (settings.platform === 'github') {
      return this._createGitHubIssues(todos, settings.github);
    } else if (settings.platform === 'azureDevops') {
      return this._createAzureDevopsWorkItems(todos, settings.azureDevops);
    }
    throw new Error(`Unbekannte Plattform: ${settings.platform}`);
  }

  // ===== GitHub =====

  _getGitHubHeaders(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  }

  async _publishToGitHub(wikiFiles, config) {
    if (!config.token || !config.owner || !config.repo) {
      throw new Error('GitHub-Konfiguration unvollständig (Token, Owner, Repo erforderlich).');
    }

    const headers = this._getGitHubHeaders(config.token);
    const results = [];

    for (const file of wikiFiles) {
      if (!file.content) continue;

      const filePath = file.path;
      const apiUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodeURIComponent(filePath)}`;

      // Prüfen ob Datei existiert (für SHA bei Update)
      let sha = null;
      const checkRes = await fetch(apiUrl, { headers });
      if (checkRes.ok) {
        const existing = await checkRes.json();
        sha = existing.sha;
      }

      const body = {
        message: sha ? `Wiki aktualisiert: ${filePath}` : `Wiki erstellt: ${filePath}`,
        content: Buffer.from(file.content, 'utf-8').toString('base64'),
        branch: config.branch || 'main'
      };
      if (sha) body.sha = sha;

      const res = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json();
        results.push({ path: filePath, success: false, error: err.message });
      } else {
        results.push({ path: filePath, success: true });
      }
    }

    return { platform: 'github', results };
  }

  async _createGitHubIssues(todos, config) {
    if (!config.token || !config.owner || !config.repo) {
      throw new Error('GitHub-Konfiguration unvollständig.');
    }

    const headers = this._getGitHubHeaders(config.token);
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/issues`;
    const results = [];

    for (const todo of todos) {
      const body = {
        title: todo.text,
        body: `Automatisch erstellt aus Wiki-Artikel.\n\n**Quelle:** \`${todo.source}\` (Zeile ${todo.line})\n**Typ:** ${todo.type === 'checkbox' ? 'Checkbox' : 'TODO-Marker'}`,
        labels: config.labels || ['wiki-todo']
      };

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json();
        results.push({ text: todo.text, success: false, error: err.message });
      } else {
        const issue = await res.json();
        results.push({ text: todo.text, success: true, number: issue.number, url: issue.html_url });
      }
    }

    return { platform: 'github', results };
  }

  // ===== Azure DevOps =====

  _getAzureDevopsHeaders(token) {
    const encoded = Buffer.from(`:${token}`).toString('base64');
    return {
      'Authorization': `Basic ${encoded}`,
      'Content-Type': 'application/json'
    };
  }

  async _publishToAzureDevops(wikiFiles, config) {
    if (!config.token || !config.organization || !config.project) {
      throw new Error('Azure DevOps-Konfiguration unvollständig (Token, Organization, Project erforderlich).');
    }

    const headers = this._getAzureDevopsHeaders(config.token);
    const results = [];
    const wikiId = config.wikiId || config.project + '.wiki';
    const baseUrl = `https://dev.azure.com/${encodeURIComponent(config.organization)}/${encodeURIComponent(config.project)}/_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages`;

    for (const file of wikiFiles) {
      if (!file.content) continue;

      // Azure DevOps Wiki: Pfad ohne .md Extension, mit / Prefix
      const pagePath = '/' + file.path.replace(/\.md$/i, '');
      const url = `${baseUrl}?path=${encodeURIComponent(pagePath)}&api-version=7.1`;

      // Erst versuchen per PUT (erstellen), bei Konflikt mit If-Match Header updaten
      let res = await fetch(url, {
        method: 'PUT',
        headers: { ...headers, 'If-Match': '' },
        body: JSON.stringify({ content: file.content })
      });

      if (res.status === 409) {
        // Seite existiert → ETag holen und updaten
        const getRes = await fetch(url, { headers });
        if (getRes.ok) {
          const etag = getRes.headers.get('ETag');
          res = await fetch(url, {
            method: 'PUT',
            headers: { ...headers, 'If-Match': etag },
            body: JSON.stringify({ content: file.content })
          });
        }
      }

      if (res.ok || res.status === 201) {
        results.push({ path: file.path, success: true });
      } else {
        const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        results.push({ path: file.path, success: false, error: err.message });
      }
    }

    return { platform: 'azureDevops', results };
  }

  async _createAzureDevopsWorkItems(todos, config) {
    if (!config.token || !config.organization || !config.project) {
      throw new Error('Azure DevOps-Konfiguration unvollständig.');
    }

    const headers = this._getAzureDevopsHeaders(config.token);
    const workItemType = config.workItemType || 'Task';
    const results = [];

    for (const todo of todos) {
      const url = `https://dev.azure.com/${encodeURIComponent(config.organization)}/${encodeURIComponent(config.project)}/_apis/wit/workitems/$${encodeURIComponent(workItemType)}?api-version=7.1`;

      const patchDoc = [
        { op: 'add', path: '/fields/System.Title', value: todo.text },
        { op: 'add', path: '/fields/System.Description', value: `<p>Automatisch erstellt aus Wiki-Artikel.</p><p><b>Quelle:</b> ${todo.source} (Zeile ${todo.line})</p>` }
      ];

      // Optionales Area Path
      if (config.areaPath) {
        patchDoc.push({ op: 'add', path: '/fields/System.AreaPath', value: config.areaPath });
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify(patchDoc)
      });

      if (res.ok) {
        const item = await res.json();
        results.push({ text: todo.text, success: true, id: item.id, url: item._links?.html?.href });
      } else {
        const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        results.push({ text: todo.text, success: false, error: err.message });
      }
    }

    return { platform: 'azureDevops', results };
  }
}

module.exports = new PublishService();
