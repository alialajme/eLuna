param prefix string
param location string
param tags object
param nodeSubnetId string
param acrId string

resource aks 'Microsoft.ContainerService/managedClusters@2024-02-01' = {
  name: '${prefix}-aks'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    dnsPrefix: '${prefix}-aks'
    enableRBAC: true
    oidcIssuerProfile: { enabled: true }
    securityProfile: {
      workloadIdentity: { enabled: true }
    }
    addonProfiles: {
      azureKeyvaultSecretsProvider: {
        enabled: true
        config: { enableSecretRotation: 'true' }
      }
    }
    agentPoolProfiles: [
      {
        name: 'system'
        mode: 'System'
        count: 2
        vmSize: 'Standard_D2s_v5'
        vnetSubnetID: nodeSubnetId
        availabilityZones: ['1', '2', '3']
        type: 'VirtualMachineScaleSets'
      }
      {
        name: 'user'
        mode: 'User'
        vmSize: 'Standard_D4s_v5'
        vnetSubnetID: nodeSubnetId
        availabilityZones: ['1', '2', '3']
        type: 'VirtualMachineScaleSets'
        enableAutoScaling: true
        minCount: 2
        maxCount: 6
      }
    ]
    networkProfile: {
      networkPlugin: 'azure'
      loadBalancerSku: 'standard'
    }
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acrId, aks.id, 'AcrPull')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: aks.properties.identityProfile.kubeletidentity.objectId
    principalType: 'ServicePrincipal'
  }
}

output aksName string = aks.name
output oidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL
