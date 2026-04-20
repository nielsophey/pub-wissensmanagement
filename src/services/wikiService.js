const fileService = require('./fileService');
const aiService = require('./aiService');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config');

/**
 * Wiki-Einstellungen lesen
 */
function getWikiSettings() {
  const settingsPath = path.join(CONFIG_DIR, 'wiki-settings.md');
  if (fs.existsSync(settingsPath)) {
    return fs.readFileSync(settingsPath, 'utf-8');
  }
  return null;
}

/**
 * Wiki-Struktur vorschlagen lassen
 */
async function suggestStructure(runId) {
  const files = fileService.processUploads(runId);
  if (files.length === 0) {
    throw new Error('Keine Dateien im Durchlauf gefunden.');
  }
  const wikiSettings = getWikiSettings();
  return await aiService.suggestStructure(files, wikiSettings);
}

/**
 * Wiki-Seiten generieren nach Freigabe
 */
async function generateWiki(runId, structure) {
  const files = fileService.processUploads(runId);
  const wikiSettings = getWikiSettings();
  const notes = fileService.getRunNotes(runId);
  const pages = await aiService.generateWikiPages(files, structure, wikiSettings, notes);

  // Anpassungs-Notizen als Datei im Output ablegen (falls vorhanden)
  if (notes) {
    pages.push({ path: '_anpassungen.md', content: notes, title: 'Anpassungen' });
  }

  // Wiki-Dateien speichern
  fileService.saveWikiOutput(runId, pages);

  return pages;
}

/**
 * Wiki-Struktur anpassen basierend auf Benutzer-Feedback
 */
async function refineStructure(runId, structure, feedback) {
  const files = fileService.processUploads(runId);
  const wikiSettings = getWikiSettings();
  return await aiService.refineStructure(structure, feedback, files, wikiSettings);
}

module.exports = { suggestStructure, generateWiki, refineStructure, getWikiSettings };
