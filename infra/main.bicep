targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name der Umgebung (z.B. dev, prod)')
param environmentName string

@minLength(1)
@description('Azure-Region für alle Ressourcen')
param location string

@description('Name der Azure OpenAI / AI Services Ressource (muss bereits existieren)')
param aiEndpoint string = ''

// Abgeleitete Namen aus dem Environment-Namen
var resourceGroupName = 'rg-${environmentName}'
var tags = { 'azd-env-name': environmentName }

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    location: location
    tags: tags
    environmentName: environmentName
  }
}

module appService 'modules/appservice.bicep' = {
  name: 'appservice'
  scope: rg
  params: {
    location: location
    tags: tags
    environmentName: environmentName
    aiEndpoint: aiEndpoint
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
  }
}

// RBAC: App Service Managed Identity bekommt "Cognitive Services OpenAI User" auf Subscription-Ebene.
// Für eine engere Scope-Vergabe muss die Ressource-ID der AI-Ressource bekannt sein.
// Diese Rolle kann alternativ manuell im Azure Portal vergeben werden.

output webAppUrl string = appService.outputs.webAppUrl
output webAppName string = appService.outputs.webAppName
output resourceGroupName string = rg.name
output managedIdentityPrincipalId string = appService.outputs.managedIdentityPrincipalId
