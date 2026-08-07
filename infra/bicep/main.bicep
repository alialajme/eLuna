targetScope = 'subscription'

@description('Azure region — UAE North for full AKS + PostgreSQL Flexible Server support')
param location string = 'uaenorth'

@description('Base name prefix for resources')
param prefix string = 'eluna'

@description('PostgreSQL admin login')
param pgAdminUser string = 'lunaadmin'

@description('PostgreSQL admin password')
@secure()
param pgAdminPassword string

var rgName = '${prefix}-rg'
var tags = { project: 'e-luna', managedBy: 'bicep' }

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
    adminUser: pgAdminUser
    adminPassword: pgAdminPassword
  }
}

output acrLoginServer string = acr.outputs.loginServer
output aksName string = aks.outputs.aksName
output keyVaultName string = keyvault.outputs.keyVaultName
output postgresFqdn string = postgres.outputs.fqdn
