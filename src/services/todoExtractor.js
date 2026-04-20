/**
 * TODO-Extraktor – findet TODO-Einträge in Markdown-Dateien
 * Unterstützt:
 *   - [ ] Checkbox-Syntax
 *   - TODO: / TODO(name): Inline-Marker
 */

const TODO_PATTERNS = [
  // Markdown Checkboxen: - [ ] Text
  { regex: /^[\s]*[-*]\s\[\s\]\s+(.+)$/gm, type: 'checkbox' },
  // TODO: oder TODO(xyz): Marker
  { regex: /TODO(?:\([^)]*\))?:\s*(.+)$/gm, type: 'marker' }
];

/**
 * TODOs aus einer einzelnen Wiki-Seite extrahieren
 */
function extractFromPage(content, pagePath) {
  const todos = [];

  for (const pattern of TODO_PATTERNS) {
    // Regex muss pro Durchlauf neu erstellt werden (global flag)
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const text = match[1].trim();
      // Zeilennummer ermitteln
      const line = content.substring(0, match.index).split('\n').length;
      todos.push({
        text,
        type: pattern.type,
        source: pagePath,
        line
      });
    }
  }

  return todos;
}

/**
 * TODOs aus allen Wiki-Seiten eines Durchlaufs extrahieren
 */
function extractFromWiki(wikiFiles) {
  const allTodos = [];

  for (const file of wikiFiles) {
    if (file.content) {
      const todos = extractFromPage(file.content, file.path);
      allTodos.push(...todos);
    }
  }

  return allTodos;
}

module.exports = { extractFromPage, extractFromWiki };
