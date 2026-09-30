param prefix string
param location string
param tags object
param delegatedSubnetId string
param adminUser string
@secure()
param adminPassword string
param vnetId string

resource pgDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: '${prefix}.private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource pgDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: pgDnsZone
  name: '${prefix}-pg-vnet-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnetId }
  }
}

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: '${prefix}-pg'
  location: location
  tags: tags
  dependsOn: [pgDnsLink]
  sku: { name: 'Standard_D2ds_v5', tier: 'GeneralPurpose' }
  properties: {
    version: '16'
    administratorLogin: adminUser
    administratorLoginPassword: adminPassword
    storage: { storageSizeGB: 128 }
    highAvailability: { mode: 'ZoneRedundant' }
    // DR: 35-day point-in-time restore + geo-redundant backup so a full-region
    // loss is recoverable (see docs/DISASTER-RECOVERY.md). Zone-redundant HA
    // above covers a single-zone failure automatically.
    backup: {
      backupRetentionDays: 35
      geoRedundantBackup: 'Enabled'
    }
    network: {
      delegatedSubnetResourceId: delegatedSubnetId
      privateDnsZoneArmResourceId: pgDnsZone.id
    }
  }
}

resource ayvanaDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: pg
  name: 'ayvana'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

output fqdn string = pg.properties.fullyQualifiedDomainName
