const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const RUNS_DIR = path.join(__dirname, '..', '..', 'data', 'runs');
const NOTES_FILENAME = '_anpassungen.md';

/**
 * ZIP-Datei entpacken in den Upload-Ordner des Durchlaufs
 */
function extractZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
  // ZIP-Datei selbst entfernen nach Entpacken
  fs.unlinkSync(zipPath);
}

/**
 * Alle hochgeladenen Dateien eines Durchlaufs verarbeiten.
 * ZIPs werden entpackt, danach werden alle Textdateien gelesen.
 */
function processUploads(runId) {
  const uploadDir = path.join(RUNS_DIR, runId, 'uploads');
  if (!fs.existsSync(uploadDir)) return [];

  // ZIPs entpacken
  const files = fs.readdirSync(uploadDir);
  for (const file of files) {
    const filePath = path.join(uploadDir, file);
    if (file.endsWith('.zip')) {
      extractZip(filePath, uploadDir);
    }
  }

  // Alle Dateien rekursiv einlesen
  return readDirRecursive(uploadDir);
}

/**
 * Verzeichnis rekursiv lesen, Textdateien mit Inhalten zurückgeben
 */
function readDirRecursive(dir, basePath = dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      results.push(...readDirRecursive(fullPath, basePath));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      const textExts = ['.txt', '.md', '.csv', '.json', '.html', '.xml', '.yml', '.yaml', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.css'];
      
      if (textExts.includes(ext)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        results.push({ path: relativePath, content, type: 'text' });
      } else {
        results.push({ path: relativePath, content: null, type: 'binary' });
      }
    }
  }

  return results;
}

/**
 * Dateien eines Durchlaufs auflisten
 */
function listRunFiles(runId) {
  const uploadDir = path.join(RUNS_DIR, runId, 'uploads');
  if (!fs.existsSync(uploadDir)) return [];
  return readDirRecursive(uploadDir).map(f => ({ path: f.path, type: f.type }));
}

/**
 * Datei aus einem Durchlauf löschen
 */
function deleteRunFile(runId, filePath) {
  const fullPath = path.resolve(RUNS_DIR, runId, 'uploads', filePath);
  // Sicherheitsprüfung: Pfad muss innerhalb des Durchlauf-Ordners liegen
  const runDir = path.resolve(RUNS_DIR, runId);
  if (!fullPath.startsWith(runDir)) {
    throw new Error('Ungültiger Dateipfad');
  }
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}

/**
 * Wiki-Output eines Durchlaufs speichern
 */
function saveWikiOutput(runId, wikiFiles) {
  const outputDir = path.join(RUNS_DIR, runId, 'wiki');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const file of wikiFiles) {
    const filePath = path.join(outputDir, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, 'utf-8');
  }
}

/**
 * Wiki-Output eines Durchlaufs lesen
 */
function getWikiOutput(runId) {
  const outputDir = path.join(RUNS_DIR, runId, 'wiki');
  if (!fs.existsSync(outputDir)) return [];
  return readDirRecursive(outputDir);
}

/**
 * Alle Durchläufe auflisten
 */
function listRuns() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs.readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const metaPath = path.join(RUNS_DIR, d.name, 'meta.json');
      let meta = { id: d.name, createdAt: null, name: d.name };
      if (fs.existsSync(metaPath)) {
        meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf-8')) };
      }
      return meta;
    });
}

/**
 * Durchlauf-Meta speichern
 */
function saveRunMeta(runId, meta) {
  const metaPath = path.join(RUNS_DIR, runId, 'meta.json');
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify({ id: runId, ...meta }, null, 2), 'utf-8');
}

/**
 * ZIP aus Wiki-Output erstellen
 */
function createWikiZip(runId) {
  const outputDir = path.join(RUNS_DIR, runId, 'wiki');
  if (!fs.existsSync(outputDir)) return null;

  const zip = new AdmZip();
  addDirToZip(zip, outputDir, '');
  return zip.toBuffer();
}

function addDirToZip(zip, dir, zipPath) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const entryZipPath = zipPath ? `${zipPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addDirToZip(zip, fullPath, entryZipPath);
    } else {
      zip.addLocalFile(fullPath, zipPath || undefined);
    }
  }
}

/**
 * Durchlauf komplett löschen
 */
function deleteRun(runId) {
  const runDir = path.resolve(RUNS_DIR, runId);
  if (!runDir.startsWith(path.resolve(RUNS_DIR))) {
    throw new Error('Ungültiger Durchlauf-Pfad');
  }
  if (fs.existsSync(runDir)) {
    fs.rmSync(runDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * Einzelne Wiki-Datei löschen
 */
function deleteWikiFile(runId, filePath) {
  const fullPath = path.resolve(RUNS_DIR, runId, 'wiki', filePath);
  const wikiDir = path.resolve(RUNS_DIR, runId, 'wiki');
  if (!fullPath.startsWith(wikiDir)) {
    throw new Error('Ungültiger Dateipfad');
  }
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}

/**
 * Gesamten Wiki-Output eines Durchlaufs löschen
 */
function clearWikiOutput(runId) {
  const outputDir = path.resolve(RUNS_DIR, runId, 'wiki');
  if (!outputDir.startsWith(path.resolve(RUNS_DIR))) {
    throw new Error('Ungültiger Pfad');
  }
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * Anpassungs-Notizen eines Durchlaufs lesen
 */
function getRunNotes(runId) {
  const notesPath = path.join(RUNS_DIR, runId, NOTES_FILENAME);
  if (fs.existsSync(notesPath)) {
    return fs.readFileSync(notesPath, 'utf-8');
  }
  return '';
}

/**
 * Anpassungs-Notizen eines Durchlaufs speichern
 */
function saveRunNotes(runId, content) {
  const runDir = path.join(RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, NOTES_FILENAME), content, 'utf-8');
}

/**
 * Feedback an die Anpassungs-Notizen anhängen
 */
function appendRunNote(runId, feedback) {
  const existing = getRunNotes(runId);
  const timestamp = new Date().toLocaleString('de-DE');
  const entry = `\n- **${timestamp}:** ${feedback}`;
  const updated = existing
    ? existing + entry
    : `# Anpassungen\n\nÄnderungswünsche für die Wiki-Generierung:\n${entry}`;
  saveRunNotes(runId, updated);
  return updated;
}

module.exports = {
  processUploads,
  listRunFiles,
  deleteRunFile,
  saveWikiOutput,
  getWikiOutput,
  listRuns,
  saveRunMeta,
  createWikiZip,
  deleteRun,
  deleteWikiFile,
  clearWikiOutput,
  getRunNotes,
  saveRunNotes,
  appendRunNote
};
