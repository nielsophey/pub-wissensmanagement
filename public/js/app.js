// ===== State =====
let currentRunId = null;
let currentStructure = null;
let previewMode = false;
let currentWikiPage = null;

// ===== DOM Elements =====
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const chatMessages = document.getElementById('chat-messages');
const btnNewRun = document.getElementById('btn-new-run');
const btnLoadRun = document.getElementById('btn-load-run');
const runSelect = document.getElementById('run-select');
const btnSuggest = document.getElementById('btn-suggest');
const btnGenerate = document.getElementById('btn-generate');
const btnDownload = document.getElementById('btn-download');
const btnPreview = document.getElementById('btn-preview-toggle');
const btnPublish = document.getElementById('btn-publish');
const btnPublishTodos = document.getElementById('btn-publish-todos');
const outputPanel = document.getElementById('output-panel');
const refineBar = document.getElementById('refine-bar');
const refineInput = document.getElementById('refine-input');
const btnRefine = document.getElementById('btn-refine');

// ===== Hilfsfunktionen =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function addChatMsg(text, role = 'system') {
  const msg = document.createElement('div');
  msg.className = `chat-msg ${role}`;
  msg.innerHTML = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showLoading(container) {
  const loader = document.createElement('div');
  loader.className = 'loading-overlay';
  loader.id = 'loading';
  loader.innerHTML = '<div class="spinner"></div><span>Verarbeite...</span>';
  container.appendChild(loader);
}

function hideLoading() {
  document.getElementById('loading')?.remove();
}

// ===== Durchlauf-Liste laden =====
async function loadRunList() {
  const res = await fetch('/api/runs');
  const runs = await res.json();
  runSelect.innerHTML = '<option value="">— Durchlauf wählen —</option>';
  for (const r of runs) {
    const label = r.name || r.id;
    const date = r.createdAt ? ` (${new Date(r.createdAt).toLocaleDateString('de-DE')})` : '';
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = label + date;
    runSelect.appendChild(opt);
  }
}

runSelect.addEventListener('change', () => {
  btnLoadRun.disabled = !runSelect.value;
});

btnLoadRun.addEventListener('click', () => {
  if (runSelect.value) openExistingRun(runSelect.value);
});

async function openExistingRun(runId) {
  currentRunId = runId;
  currentStructure = null;
  previewMode = false;

  // UI zurücksetzen
  chatMessages.innerHTML = '';
  outputPanel.innerHTML = '<div class="chat-msg system">Noch kein Wiki generiert.</div>';

  // Durchlauf-Metadaten laden (inkl. gespeicherter Struktur)
  const metaRes = await fetch(`/api/runs/${runId}`);
  const meta = await metaRes.json();
  if (meta.structure && Array.isArray(meta.structure)) {
    currentStructure = meta.structure;
  }

  // Dateien laden
  const filesRes = await fetch(`/api/runs/${runId}/files`);
  const files = await filesRes.json();

  fileList.innerHTML = files.map(f => `
    <li class="file-item">
      <span class="file-name" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</span>
      <button class="file-delete" data-path="${escapeHtml(f.path)}" title="Löschen">✕</button>
    </li>
  `).join('');

  fileList.querySelectorAll('.file-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/runs/${currentRunId}/files/${encodeURIComponent(btn.dataset.path)}`, { method: 'DELETE' });
      loadFileList();
    });
  });

  // Wiki-Output prüfen
  const wikiRes = await fetch(`/api/runs/${runId}/wiki`);
  const wikiFiles = await wikiRes.json();

  if (wikiFiles.length > 0) {
    loadWikiOutput();
    btnDownload.disabled = false;
    btnPreview.disabled = false;
    btnPublish.disabled = false;
    btnPublishTodos.disabled = false;
  }

  btnSuggest.disabled = files.length === 0;
  // Generate-Button aktiv wenn Struktur vorhanden
  btnGenerate.disabled = !currentStructure;
  // Refine-Bar anzeigen wenn Struktur vorhanden
  if (currentStructure) {
    refineBar.style.display = 'block';
    refineInput.value = '';
  }

  // Runs-Dropdown aktualisieren
  runSelect.value = runId;

  // Name aus Dropdown holen
  const selectedOpt = runSelect.options[runSelect.selectedIndex];
  const runName = selectedOpt ? selectedOpt.textContent : runId;
  addChatMsg(`Durchlauf "<strong>${escapeHtml(runName)}</strong>" geladen. ${files.length} Datei(en), ${wikiFiles.length} Wiki-Seite(n).`);
  if (currentStructure) {
    addChatMsg(`Gespeicherte Struktur mit ${currentStructure.length} Seiten geladen. Du kannst anpassen oder neu generieren.`, 'system');
  }
  showToast('Durchlauf geladen');
}

// Beim Laden: Durchlauf-Liste befüllen und ggf. aus URL-Parameter öffnen
loadRunList().then(() => {
  const params = new URLSearchParams(window.location.search);
  const runFromUrl = params.get('run');
  if (runFromUrl) openExistingRun(runFromUrl);
});

// ===== Neuer Durchlauf =====
btnNewRun.addEventListener('click', async () => {
  const name = prompt('Name des Durchlaufs:', `Durchlauf ${new Date().toLocaleDateString('de-DE')}`);
  if (!name) return;

  const res = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });

  const data = await res.json();
  currentRunId = data.id;
  currentStructure = null;
  previewMode = false;

  // UI zurücksetzen
  fileList.innerHTML = '';
  chatMessages.innerHTML = '';
  outputPanel.innerHTML = '<div class="chat-msg system">Noch kein Wiki generiert.</div>';
  btnSuggest.disabled = true;
  btnGenerate.disabled = true;
  btnDownload.disabled = true;
  btnPreview.disabled = true;
  btnPublish.disabled = true;
  btnPublishTodos.disabled = true;

  addChatMsg(`Durchlauf "<strong>${escapeHtml(name)}</strong>" erstellt. Lade jetzt Dateien hoch.`);
  showToast('Durchlauf erstellt');
  loadRunList().then(() => { runSelect.value = currentRunId; });
});

// ===== Datei-Upload =====
uploadZone.addEventListener('click', () => {
  if (!currentRunId) {
    showToast('Bitte erst einen Durchlauf erstellen.', 'error');
    return;
  }
  fileInput.click();
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (!currentRunId) {
    showToast('Bitte erst einen Durchlauf erstellen.', 'error');
    return;
  }
  uploadFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
  uploadFiles(fileInput.files);
  fileInput.value = '';
});

async function uploadFiles(files) {
  if (!currentRunId || files.length === 0) return;

  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  addChatMsg(`Lade ${files.length} Datei(en) hoch...`);

  const res = await fetch(`/api/runs/${currentRunId}/upload`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    showToast('Fehler beim Upload', 'error');
    return;
  }

  const data = await res.json();
  showToast(`${data.files.length} Datei(en) hochgeladen`);
  addChatMsg(`${data.files.length} Datei(en) erfolgreich hochgeladen.`, 'system');

  // Dateiliste aktualisieren
  loadFileList();
  btnSuggest.disabled = false;
}

async function loadFileList() {
  if (!currentRunId) return;
  const res = await fetch(`/api/runs/${currentRunId}/files`);
  const files = await res.json();

  fileList.innerHTML = files.map(f => `
    <li class="file-item">
      <span class="file-name" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</span>
      <button class="file-delete" data-path="${escapeHtml(f.path)}" title="Löschen">✕</button>
    </li>
  `).join('');

  fileList.querySelectorAll('.file-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/runs/${currentRunId}/files/${encodeURIComponent(btn.dataset.path)}`, { method: 'DELETE' });
      loadFileList();
    });
  });
}

// ===== Struktur vorschlagen =====
btnSuggest.addEventListener('click', async () => {
  if (!currentRunId) return;

  btnSuggest.disabled = true;
  addChatMsg('Analysiere Dateien und erstelle Wiki-Strukturvorschlag...', 'system');
  showLoading(chatMessages);

  try {
    const res = await fetch(`/api/runs/${currentRunId}/suggest`, { method: 'POST' });
    hideLoading();

    if (!res.ok) {
      const err = await res.json();
      addChatMsg(`Fehler: ${escapeHtml(err.error)}`, 'system');
      btnSuggest.disabled = false;
      return;
    }

    const data = await res.json();
    currentStructure = data.structure;

    // Vorschlag anzeigen
    let html = `<strong>Vorgeschlagene Wiki-Struktur:</strong><br><br>`;
    html += `<em>${escapeHtml(data.summary)}</em><br><br>`;
    html += '<ul class="structure-list">';
    for (const item of data.structure) {
      html += `<li class="structure-item">
        <div class="path">${escapeHtml(item.path)}</div>
        <div class="desc">${escapeHtml(item.title)} – ${escapeHtml(item.description)}</div>
      </li>`;
    }
    html += '</ul>';
    addChatMsg(html, 'ai');
    addChatMsg('Bist du mit dieser Struktur einverstanden? Passe sie an oder klicke "Wiki generieren".', 'system');

    btnGenerate.disabled = false;
    btnSuggest.disabled = false;
    refineBar.style.display = 'block';
    refineInput.value = '';
  } catch (err) {
    hideLoading();
    addChatMsg(`Fehler: ${err.message}`, 'system');
    btnSuggest.disabled = false;
  }
});

// ===== Struktur anpassen =====
async function refineStructure() {
  const feedback = refineInput.value.trim();
  if (!feedback || !currentRunId || !currentStructure) return;

  btnRefine.disabled = true;
  addChatMsg(escapeHtml(feedback), 'user');
  addChatMsg('Passe Struktur an...', 'system');
  showLoading(chatMessages);

  try {
    const res = await fetch(`/api/runs/${currentRunId}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structure: currentStructure, feedback })
    });
    hideLoading();

    if (!res.ok) {
      const err = await res.json();
      addChatMsg(`Fehler: ${escapeHtml(err.error)}`, 'system');
      btnRefine.disabled = false;
      return;
    }

    const data = await res.json();
    currentStructure = data.structure;

    let html = `<strong>Angepasste Wiki-Struktur:</strong><br><br>`;
    html += `<em>${escapeHtml(data.summary)}</em><br><br>`;
    html += '<ul class="structure-list">';
    for (const item of data.structure) {
      html += `<li class="structure-item">
        <div class="path">${escapeHtml(item.path)}</div>
        <div class="desc">${escapeHtml(item.title)} – ${escapeHtml(item.description)}</div>
      </li>`;
    }
    html += '</ul>';
    addChatMsg(html, 'ai');

    refineInput.value = '';
    btnRefine.disabled = false;
  } catch (err) {
    hideLoading();
    addChatMsg(`Fehler: ${err.message}`, 'system');
    btnRefine.disabled = false;
  }
}

btnRefine.addEventListener('click', refineStructure);
refineInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') refineStructure();
});

// ===== Wiki generieren =====
btnGenerate.addEventListener('click', async () => {
  if (!currentRunId || !currentStructure) return;

  // Prüfen ob bereits Wiki-Dateien existieren
  const existingRes = await fetch(`/api/runs/${currentRunId}/wiki`);
  const existingFiles = await existingRes.json();

  if (existingFiles.length > 0) {
    const choice = confirm(
      `Es existieren bereits ${existingFiles.length} Wiki-Datei(en).\n\n` +
      'OK = Bestehende Dateien löschen und neu generieren\n' +
      'Abbrechen = Generierung abbrechen'
    );
    if (!choice) return;

    await fetch(`/api/runs/${currentRunId}/wiki`, { method: 'DELETE' });
    addChatMsg(`${existingFiles.length} bestehende Wiki-Datei(en) gelöscht.`, 'system');
  }

  btnGenerate.disabled = true;
  refineBar.style.display = 'none';
  addChatMsg('Generiere Wiki-Seiten... Das kann einen Moment dauern.', 'system');
  showLoading(chatMessages);

  try {
    const res = await fetch(`/api/runs/${currentRunId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structure: currentStructure })
    });

    hideLoading();

    if (!res.ok) {
      const err = await res.json();
      addChatMsg(`Fehler: ${escapeHtml(err.error)}`, 'system');
      btnGenerate.disabled = false;
      return;
    }

    const data = await res.json();
    addChatMsg(`Wiki mit ${data.pages.length} Seiten erfolgreich generiert!`, 'ai');

    // Output anzeigen
    loadWikiOutput();
    btnGenerate.disabled = false;
    btnDownload.disabled = false;
    btnPreview.disabled = false;
    btnPublish.disabled = false;
    btnPublishTodos.disabled = false;
    showToast('Wiki generiert!');
  } catch (err) {
    hideLoading();
    addChatMsg(`Fehler: ${err.message}`, 'system');
    btnGenerate.disabled = false;
  }
});

// ===== Wiki-Output =====
async function loadWikiOutput() {
  if (!currentRunId) return;

  const res = await fetch(`/api/runs/${currentRunId}/wiki`);
  const files = await res.json();

  if (files.length === 0) {
    outputPanel.innerHTML = '<div class="chat-msg system">Noch kein Wiki generiert.</div>';
    return;
  }

  // Dateibaum anzeigen
  outputPanel.innerHTML = `
    <ul class="wiki-tree" id="wiki-tree">
      ${files.map(f => `<li data-path="${escapeHtml(f.path)}">
        <span class="wiki-tree-name">${f.path === '_anpassungen.md' ? '✏️ ' : ''}${escapeHtml(f.path)}</span>
        <button class="wiki-file-delete" data-path="${escapeHtml(f.path)}" title="Datei löschen">✕</button>
      </li>`).join('')}
    </ul>
    <hr style="margin:1rem 0; border:none; border-top:1px solid var(--border)">
    <div class="wiki-preview" id="wiki-content">
      <p style="color:var(--text-muted)">Klicke auf eine Datei, um den Inhalt anzuzeigen.</p>
    </div>
  `;

  outputPanel.querySelectorAll('#wiki-tree li .wiki-tree-name').forEach(span => {
    span.addEventListener('click', () => loadWikiPage(span.parentElement.dataset.path));
  });

  outputPanel.querySelectorAll('.wiki-file-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const filePath = btn.dataset.path;
      if (!confirm(`Wiki-Datei "${filePath}" löschen?`)) return;
      await fetch(`/api/runs/${currentRunId}/wiki/${encodeURIComponent(filePath)}`, { method: 'DELETE' });
      if (currentWikiPage === filePath) currentWikiPage = null;
      loadWikiOutput();
    });
  });
}

async function loadWikiPage(filePath) {
  if (!currentRunId) return;

  currentWikiPage = filePath;

  // Aktive Markierung
  outputPanel.querySelectorAll('#wiki-tree li').forEach(l => l.classList.remove('active'));
  outputPanel.querySelector(`#wiki-tree li[data-path="${filePath}"]`)?.classList.add('active');

  const contentDiv = document.getElementById('wiki-content');

  // _anpassungen.md editierbar anzeigen
  if (filePath === '_anpassungen.md') {
    const notesRes = await fetch(`/api/runs/${currentRunId}/notes`);
    const notesData = await notesRes.json();
    contentDiv.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%;">
        <textarea id="notes-editor" style="flex:1; min-height:250px; padding:0.75rem; border:1px solid var(--border); border-radius:6px; font-family:'Cascadia Code','Fira Code',monospace; font-size:0.85rem; line-height:1.6; resize:vertical; color:#1e293b;">${escapeHtml(notesData.content || '')}</textarea>
        <button class="btn btn-primary btn-sm" id="btn-save-notes" style="align-self:flex-end; margin-top:0.75rem;">Anpassungen speichern</button>
      </div>
    `;
    document.getElementById('btn-save-notes').addEventListener('click', async () => {
      const content = document.getElementById('notes-editor').value;
      const res = await fetch(`/api/runs/${currentRunId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) showToast('Anpassungen gespeichert');
      else showToast('Fehler beim Speichern', 'error');
    });
    return;
  }

  if (previewMode) {
    const res = await fetch(`/api/runs/${currentRunId}/wiki/preview/${encodeURIComponent(filePath)}`);
    const data = await res.json();
    contentDiv.innerHTML = data.html;
  } else {
    const res = await fetch(`/api/runs/${currentRunId}/wiki`);
    const files = await res.json();
    const file = files.find(f => f.path === filePath);
    if (file) {
      contentDiv.innerHTML = `<pre style="white-space:pre-wrap; background:#f1f5f9; padding:1rem; border-radius:6px; font-size:0.85rem; color:#1e293b">${escapeHtml(file.content)}</pre>`;
    }
  }
}

// ===== Preview Toggle =====
btnPreview.addEventListener('click', () => {
  previewMode = !previewMode;
  btnPreview.textContent = previewMode ? 'Markdown' : 'Preview';
  btnPreview.className = previewMode ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';

  // Aktive Seite neu laden
  if (currentWikiPage) loadWikiPage(currentWikiPage);
});

// ===== Download =====
btnDownload.addEventListener('click', () => {
  if (!currentRunId) return;
  window.location.href = `/api/runs/${currentRunId}/wiki/download`;
});

// ===== Wiki publizieren =====
btnPublish.addEventListener('click', async () => {
  if (!currentRunId) return;

  if (!confirm('Wiki auf der konfigurierten Plattform veröffentlichen?')) return;

  btnPublish.disabled = true;
  addChatMsg('Veröffentliche Wiki...', 'system');
  showLoading(chatMessages);

  try {
    const res = await fetch(`/api/runs/${currentRunId}/publish`, { method: 'POST' });
    hideLoading();

    if (!res.ok) {
      const err = await res.json();
      addChatMsg(`Fehler: ${escapeHtml(err.error)}`, 'system');
      btnPublish.disabled = false;
      return;
    }

    const data = await res.json();
    const succeeded = data.results.filter(r => r.success).length;
    const failed = data.results.filter(r => !r.success).length;

    let html = `<strong>Wiki auf ${escapeHtml(data.platform)} veröffentlicht:</strong><br>`;
    html += `✅ ${succeeded} Seiten erfolgreich`;
    if (failed > 0) {
      html += ` · ❌ ${failed} fehlgeschlagen`;
      const errors = data.results.filter(r => !r.success);
      html += '<ul style="margin-top:0.5rem; font-size:0.8rem;">';
      for (const e of errors) {
        html += `<li>${escapeHtml(e.path)}: ${escapeHtml(e.error)}</li>`;
      }
      html += '</ul>';
    }
    addChatMsg(html, 'ai');
    showToast(`Wiki veröffentlicht (${succeeded}/${data.results.length})`);
    btnPublish.disabled = false;
  } catch (err) {
    hideLoading();
    addChatMsg(`Fehler: ${err.message}`, 'system');
    btnPublish.disabled = false;
  }
});

// ===== TODOs als Aufgaben anlegen =====
btnPublishTodos.addEventListener('click', async () => {
  if (!currentRunId) return;

  // Erst TODOs anzeigen
  const todosRes = await fetch(`/api/runs/${currentRunId}/todos`);
  const todos = await todosRes.json();

  if (todos.length === 0) {
    addChatMsg('Keine TODOs in den Wiki-Artikeln gefunden.', 'system');
    return;
  }

  let confirmMsg = `${todos.length} TODO(s) gefunden:\n\n`;
  for (const t of todos) {
    confirmMsg += `• ${t.text} (${t.source}:${t.line})\n`;
  }
  confirmMsg += '\nAufgaben auf der konfigurierten Plattform anlegen?';

  if (!confirm(confirmMsg)) return;

  btnPublishTodos.disabled = true;
  addChatMsg(`Erstelle ${todos.length} Aufgabe(n)...`, 'system');
  showLoading(chatMessages);

  try {
    const res = await fetch(`/api/runs/${currentRunId}/publish-todos`, { method: 'POST' });
    hideLoading();

    if (!res.ok) {
      const err = await res.json();
      addChatMsg(`Fehler: ${escapeHtml(err.error)}`, 'system');
      btnPublishTodos.disabled = false;
      return;
    }

    const data = await res.json();
    const succeeded = data.results.filter(r => r.success).length;
    const failed = data.results.filter(r => !r.success).length;

    let html = `<strong>Aufgaben auf ${escapeHtml(data.platform)} erstellt:</strong><br>`;
    html += `✅ ${succeeded} Aufgaben angelegt`;
    if (failed > 0) html += ` · ❌ ${failed} fehlgeschlagen`;

    if (data.results.some(r => r.url)) {
      html += '<ul style="margin-top:0.5rem; font-size:0.8rem;">';
      for (const r of data.results.filter(r => r.success && r.url)) {
        const label = r.number ? `#${r.number}` : `#${r.id}`;
        html += `<li><a href="${escapeHtml(r.url)}" target="_blank">${label}</a> – ${escapeHtml(r.text)}</li>`;
      }
      html += '</ul>';
    }
    addChatMsg(html, 'ai');
    showToast(`${succeeded} Aufgabe(n) erstellt`);
    btnPublishTodos.disabled = false;
  } catch (err) {
    hideLoading();
    addChatMsg(`Fehler: ${err.message}`, 'system');
    btnPublishTodos.disabled = false;
  }
});
