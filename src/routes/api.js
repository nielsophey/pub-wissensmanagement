const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const upload = require('../middleware/upload');
const fileService = require('../services/fileService');
const wikiService = require('../services/wikiService');
const aiService = require('../services/aiService');
const publishService = require('../services/publishService');
const { extractFromWiki } = require('../services/todoExtractor');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config');

// ===== Durchläufe =====

// Neuen Durchlauf erstellen
router.post('/runs', (req, res) => {
  const runId = uuidv4();
  const name = req.body.name || `Durchlauf ${new Date().toLocaleDateString('de-DE')}`;
  fileService.saveRunMeta(runId, { name, createdAt: new Date().toISOString() });
  res.json({ id: runId, name });
});

// Alle Durchläufe auflisten
router.get('/runs', (req, res) => {
  const runs = fileService.listRuns();
  res.json(runs);
});

// Einzelnen Durchlauf laden (inkl. gespeicherter Struktur)
router.get('/runs/:runId', (req, res) => {
  const runs = fileService.listRuns();
  const run = runs.find(r => r.id === req.params.runId);
  if (!run) return res.status(404).json({ error: 'Durchlauf nicht gefunden.' });
  res.json(run);
});

// Durchlauf löschen
router.delete('/runs/:runId', (req, res) => {
  fileService.deleteRun(req.params.runId);
  res.json({ success: true });
});

// ===== Datei-Upload =====

// Dateien hochladen
router.post('/runs/:runId/upload', upload.array('files', 50), (req, res) => {
  const runId = req.params.runId;
  const uploadedFiles = req.files.map(f => ({
    name: f.originalname,
    size: f.size,
    mimetype: f.mimetype
  }));
  res.json({ runId, files: uploadedFiles });
});

// Dateien eines Durchlaufs auflisten
router.get('/runs/:runId/files', (req, res) => {
  const files = fileService.listRunFiles(req.params.runId);
  res.json(files);
});

// Datei löschen
router.delete('/runs/:runId/files/:filePath(*)', (req, res) => {
  const deleted = fileService.deleteRunFile(req.params.runId, req.params.filePath);
  res.json({ success: deleted });
});

// ===== Wiki-Generierung =====

// Struktur vorschlagen
router.post('/runs/:runId/suggest', async (req, res) => {
  try {
    const suggestion = await wikiService.suggestStructure(req.params.runId);
    // Struktur im Durchlauf speichern
    const meta = fileService.listRuns().find(r => r.id === req.params.runId) || {};
    fileService.saveRunMeta(req.params.runId, { ...meta, structure: suggestion.structure });
    res.json(suggestion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Struktur anpassen basierend auf Benutzer-Feedback
router.post('/runs/:runId/refine', async (req, res) => {
  try {
    const { structure, feedback } = req.body;
    if (!structure || !Array.isArray(structure) || !feedback) {
      return res.status(400).json({ error: 'Struktur-Array und Feedback-Text erforderlich.' });
    }
    // Feedback in Anpassungs-Notizen speichern
    fileService.appendRunNote(req.params.runId, feedback);
    const refined = await wikiService.refineStructure(req.params.runId, structure, feedback);
    // Aktualisierte Struktur speichern
    const meta = fileService.listRuns().find(r => r.id === req.params.runId) || {};
    fileService.saveRunMeta(req.params.runId, { ...meta, structure: refined.structure });
    res.json(refined);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wiki generieren (nach Freigabe)
router.post('/runs/:runId/generate', async (req, res) => {
  try {
    const structure = req.body.structure;
    if (!structure || !Array.isArray(structure)) {
      return res.status(400).json({ error: 'Struktur-Array erforderlich.' });
    }
    const pages = await wikiService.generateWiki(req.params.runId, structure);
    res.json({ pages: pages.map(p => ({ path: p.path, title: p.title })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wiki-Output abrufen
router.get('/runs/:runId/wiki', (req, res) => {
  const files = fileService.getWikiOutput(req.params.runId);
  res.json(files);
});

// Wiki-Seite als HTML-Preview rendern
router.get('/runs/:runId/wiki/preview/:filePath(*)', (req, res) => {
  const files = fileService.getWikiOutput(req.params.runId);
  const file = files.find(f => f.path === req.params.filePath);
  if (!file || !file.content) {
    return res.status(404).json({ error: 'Seite nicht gefunden.' });
  }
  const html = marked(file.content);
  res.json({ html, markdown: file.content, path: file.path });
});

// Gesamten Wiki-Output löschen
router.delete('/runs/:runId/wiki', (req, res) => {
  const deleted = fileService.clearWikiOutput(req.params.runId);
  res.json({ success: deleted });
});

// Einzelne Wiki-Datei löschen
router.delete('/runs/:runId/wiki/:filePath(*)', (req, res) => {
  const deleted = fileService.deleteWikiFile(req.params.runId, req.params.filePath);
  res.json({ success: deleted });
});

// Wiki als ZIP herunterladen
router.get('/runs/:runId/wiki/download', (req, res) => {
  const zipBuffer = fileService.createWikiZip(req.params.runId);
  if (!zipBuffer) {
    return res.status(404).json({ error: 'Kein Wiki-Output vorhanden.' });
  }
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="wiki-${req.params.runId}.zip"`
  });
  res.send(zipBuffer);
});

// ===== Anpassungs-Notizen =====

// Notizen eines Durchlaufs lesen
router.get('/runs/:runId/notes', (req, res) => {
  const content = fileService.getRunNotes(req.params.runId);
  res.json({ content });
});

// Notizen eines Durchlaufs speichern
router.put('/runs/:runId/notes', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content muss ein String sein.' });
  }
  fileService.saveRunNotes(req.params.runId, content);
  res.json({ success: true });
});

// ===== Administration =====

// Wiki-Einstellungen lesen
router.get('/config/wiki-settings', (req, res) => {
  const settingsPath = path.join(CONFIG_DIR, 'wiki-settings.md');
  if (fs.existsSync(settingsPath)) {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    res.json({ content });
  } else {
    res.json({ content: '' });
  }
});

// Wiki-Einstellungen speichern
router.put('/config/wiki-settings', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content muss ein String sein.' });
  }
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(CONFIG_DIR, 'wiki-settings.md'), content, 'utf-8');
  res.json({ success: true });
});

// AI-Einstellungen lesen
router.get('/config/ai-settings', (req, res) => {
  const settings = aiService.getAzureSettings();
  // API-Key maskieren
  if (settings.apiKey) {
    settings.apiKey = settings.apiKey.substring(0, 4) + '****';
  }
  res.json(settings);
});

// AI-Einstellungen speichern
router.put('/config/ai-settings', (req, res) => {
  const { provider, endpoint, apiKey, deployment, apiVersion, useManagedIdentity } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint ist erforderlich.' });
  }
  if (useManagedIdentity) {
    // Managed Identity: kein API Key benötigt
    aiService.saveAzureSettings({ provider: provider || 'openai', endpoint, apiKey: '', deployment, apiVersion, useManagedIdentity: true });
  } else {
    // API Key: neu übermittelten Key verwenden oder bestehenden erhalten
    const existingSettings = aiService.getAzureSettings();
    const effectiveApiKey = apiKey || existingSettings.apiKey;
    if (!effectiveApiKey) {
      return res.status(400).json({ error: 'API Key ist erforderlich. Bitte einen API Key eingeben oder Managed Identity aktivieren.' });
    }
    aiService.saveAzureSettings({ provider: provider || 'openai', endpoint, apiKey: effectiveApiKey, deployment, apiVersion, useManagedIdentity: false });
  }
  res.json({ success: true });
});

// ===== KI-Verbindungstest =====
router.post('/config/ai-test', async (req, res) => {
  try {
    // Client neu initialisieren mit aktuellen Einstellungen
    aiService.client = null;
    await aiService.init();
    const reply = await aiService.chat([
      { role: 'user', content: 'Antworte nur mit: Verbindung erfolgreich.' }
    ]);
    res.json({ success: true, message: reply });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== Publish-Einstellungen =====

// Publish-Einstellungen lesen
router.get('/config/publish-settings', (req, res) => {
  const settings = publishService.getPublishSettings();
  // Tokens maskieren
  if (settings.github?.token) {
    settings.github.token = settings.github.token.substring(0, 6) + '****';
  }
  if (settings.azureDevops?.token) {
    settings.azureDevops.token = settings.azureDevops.token.substring(0, 6) + '****';
  }
  res.json(settings);
});

// Publish-Einstellungen speichern
router.put('/config/publish-settings', (req, res) => {
  const settings = req.body;
  if (!settings.platform) {
    return res.status(400).json({ error: 'Plattform erforderlich.' });
  }
  publishService.savePublishSettings(settings);
  res.json({ success: true });
});

// ===== Wiki publizieren & TODOs =====

// TODOs aus Wiki extrahieren
router.get('/runs/:runId/todos', (req, res) => {
  const wikiFiles = fileService.getWikiOutput(req.params.runId);
  const todos = extractFromWiki(wikiFiles);
  res.json(todos);
});

// Wiki auf Plattform publizieren
router.post('/runs/:runId/publish', async (req, res) => {
  try {
    const wikiFiles = fileService.getWikiOutput(req.params.runId);
    if (wikiFiles.length === 0) {
      return res.status(400).json({ error: 'Kein Wiki-Output vorhanden.' });
    }
    const result = await publishService.publishWiki(wikiFiles);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aufgaben aus TODOs erstellen
router.post('/runs/:runId/publish-todos', async (req, res) => {
  try {
    const wikiFiles = fileService.getWikiOutput(req.params.runId);
    const todos = extractFromWiki(wikiFiles);
    if (todos.length === 0) {
      return res.json({ results: [], message: 'Keine TODOs gefunden.' });
    }
    const result = await publishService.createTasksFromTodos(todos);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
