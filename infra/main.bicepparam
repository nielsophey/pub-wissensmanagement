using './main.bicep'

// Diese Werte werden von azd über Umgebungsvariablen befüllt.
// Eigene Werte können hier oder über "azd env set <KEY> <VALUE>" gesetzt werden.
param environmentName = readEnvironmentVariable('AZURE_ENV_NAME', 'dev')
param location = readEnvironmentVariable('AZURE_LOCATION', 'germanywestcentral')

// Endpoint der Azure OpenAI / AI Services Ressource.
// Entweder hier eintragen oder via: azd env set AI_ENDPOINT https://...
param aiEndpoint = readEnvironmentVariable('AI_ENDPOINT', '')
