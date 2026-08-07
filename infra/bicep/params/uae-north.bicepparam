using '../main.bicep'

param location = 'uaenorth'
param prefix = 'eluna'
param pgAdminUser = 'lunaadmin'
param pgAdminPassword = readEnvironmentVariable('PG_ADMIN_PASSWORD', '')
