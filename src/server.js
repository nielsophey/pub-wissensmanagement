const express = require('express');
const path = require('path');
const fs = require('fs');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Sicherstellen, dass benötigte Verzeichnisse existieren
const dataDir = path.join(__dirname, '..', 'data', 'runs');
fs.mkdirSync(dataDir, { recursive: true });

// API-Routen
app.use('/api', apiRouter);

// SPA-Fallback: Hauptseiten ausliefern
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/files', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'files.html'));
});

app.listen(PORT, () => {
  console.log(`Wissenmanagement-Server läuft auf http://localhost:${PORT}`);
});
