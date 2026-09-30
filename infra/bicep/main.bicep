targetScope = 'subscription'

@description('Azure region — UAE North for full AKS + PostgreSQL Flexible Server support')
param location string = 'uaenorth'

@description('Base name prefix for resources')
param prefix string = 'ayvana'

@description('PostgreSQL admin login')
param pgAdminUser string = 'ayvanaadmin'

@description('PostgreSQL admin password')
@secure()
param pgAdminPassword string

@description('Deploy Azure Front Door + WAF in front of the ingress (second step — needs the ingress public host)')
param deployFrontDoor bool = false

@description('Public FQDN/IP of the AKS ingress LoadBalancer (required when deployFrontDoor=true)')
param ingressHostName string = ''

var rgName = '${prefix}-rg'
var tags = { project: 'e-ayvana', managedBy: 'bicep' }

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: rgName
  location: location
  tags: tags
}

module network 'modules/network.bicep' = {
  scope: rg
  name: 'network'
  params: { prefix: prefix, location: location, tags: tags }
}

module acr 'modules/acr.bicep' = {
  scope: rg
  name: 'acr'
  params: { prefix: prefix, location: location, tags: tags }
}

module aks 'modules/aks.bicep' = {
  scope: rg
  name: 'aks'
  params: {
    prefix: prefix
    location: location
    tags: tags
    nodeSubnetId: network.outputs.nodeSubnetId
    acrId: acr.outputs.acrId
  }
}

module keyvault 'modules/keyvault.bicep' = {
  scope: rg
  name: 'keyvault'
  params: { prefix: prefix, location: location, tags: tags }
}

module postgres 'modules/postgres.bicep' = {
  scope: rg
  name: 'postgres'
  params: {
    prefix: prefix
    location: location
    tags: tags
    delegatedSubnetId: network.outputs.pgSubnetId
    vnetId: network.outputs.vnetId
    adminUser: pgAdminUser
    adminPassword: pgAdminPassword
  }
}

module frontdoor 'modules/frontdoor.bicep' = if (deployFrontDoor) {
  scope: rg
  name: 'frontdoor'
  params: {
    prefix: prefix
    tags: tags
    originHostName: ingressHostName
  }
}

output acrLoginServer string = acr.outputs.loginServer
output aksName string = aks.outputs.aksName
output keyVaultName string = keyvault.outputs.keyVaultName
output postgresFqdn string = postgres.outputs.fqdn
