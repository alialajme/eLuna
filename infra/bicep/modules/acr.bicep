param prefix string
param location string
param tags object

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${prefix}acr'
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: { adminUserEnabled: false }
}

output acrId string = acr.id
output loginServer string = acr.properties.loginServer
