using '../main.bicep'

param location = 'uaenorth'
param prefix = 'ayvana'
param pgAdminUser = 'ayvanaadmin'
param pgAdminPassword = readEnvironmentVariable('PG_ADMIN_PASSWORD', '')
