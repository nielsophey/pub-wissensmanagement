@description('Azure-Region')
param location string
param tags object
param environmentName string

@description('Azure OpenAI / AI Services Endpoint')
param aiEndpoint string

@description('Application Insights Connection String')
param appInsightsConnectionString string

// App Service Plan (B1 – ausreichend für Einzelinstanz; auf P1v3 hochsetzen für Produktion)
resource appServicePlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'asp-${environmentName}'
  location: location
  tags: tags
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true // Linux
  }
}

// Web App mit System-assigned Managed Identity
resource webApp 'Microsoft.Web/sites@2024-04-01' = {
  name: 'app-wissenmanagement-${environmentName}'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node src/server.js'
      appSettings: [
        { name: 'NODE_ENV', value: 'production' }
        { name: 'PORT', value: '8080' }
        // Managed Identity für KI-Zugriff aktivieren
        { name: 'USE_MANAGED_IDENTITY', value: 'true' }
        // Endpoint der Azure OpenAI / AI Services Ressource
        { name: 'AZURE_OPENAI_ENDPOINT', value: aiEndpoint }
        // Application Insights
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        { name: 'ApplicationInsightsAgent_EXTENSION_VERSION', value: '~3' }
        // Oryx Build: npm install beim Deployment ausführen
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
      ]
    }
  }
}

// Logging in Log Stream aktivieren
resource webAppLogs 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: webApp
  name: 'logs'
  properties: {
    applicationLogs: { fileSystem: { level: 'Information' } }
    httpLogs: { fileSystem: { retentionInMb: 35, enabled: true } }
    detailedErrorMessages: { enabled: true }
  }
}

output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output webAppName string = webApp.name
// Principal ID der Managed Identity – wird für RBAC-Rollenzuweisung benötigt
output managedIdentityPrincipalId string = webApp.identity.principalId
