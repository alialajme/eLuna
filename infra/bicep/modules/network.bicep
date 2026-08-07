param prefix string
param location string
param tags object

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: '${prefix}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.20.0.0/16'] }
    subnets: [
      {
        name: 'aks-nodes'
        properties: { addressPrefix: '10.20.0.0/20' }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: '10.20.16.0/24'
          delegations: [
            {
              name: 'pgDelegation'
              properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
            }
          ]
        }
      }
    ]
  }
}

output nodeSubnetId string = vnet.properties.subnets[0].id
output pgSubnetId string = vnet.properties.subnets[1].id
output vnetId string = vnet.id
