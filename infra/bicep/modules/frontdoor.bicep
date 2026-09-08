// Azure Front Door (Premium) + WAF in front of the AKS ingress (§18/§19 outer
// layer). Premium SKU is used so the full managed rule sets + bot protection are
// available (Standard supports only a limited DRS). The WAF adds a per-IP rate
// limit on top of the app-level limiter.
//
// NOTE: `originHostName` is the public FQDN/IP of the ingress-nginx LoadBalancer,
// which only exists after the cluster + ingress are up — so this module is
// deployed as a second step (opt-in via main.bicep `deployFrontDoor`).

param prefix string
param tags object
@description('Public FQDN or IP of the AKS ingress (origin)')
param originHostName string
@description('Requests per minute per client IP before the WAF blocks')
param rateLimitThreshold int = 600

var afdSku = 'Premium_AzureFrontDoor'

resource profile 'Microsoft.Cdn/profiles@2023-05-01' = {
  name: '${prefix}-afd'
  location: 'global'
  tags: tags
  sku: { name: afdSku }
}

resource waf 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2022-05-01' = {
  name: '${replace(prefix, '-', '')}wafpolicy'
  location: 'global'
  tags: tags
  sku: { name: afdSku }
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: 'Prevention'
    }
    managedRules: {
      managedRuleSets: [
        { ruleSetType: 'Microsoft_DefaultRuleSet', ruleSetVersion: '2.1' }
        { ruleSetType: 'Microsoft_BotManagerRuleSet', ruleSetVersion: '1.0' }
      ]
    }
    customRules: {
      rules: [
        {
          name: 'PerIpRateLimit'
          priority: 1
          enabledState: 'Enabled'
          ruleType: 'RateLimitRule'
          rateLimitDurationInMinutes: 1
          rateLimitThreshold: rateLimitThreshold
          matchConditions: [
            {
              matchVariable: 'RemoteAddr'
              operator: 'IPMatch'
              negateCondition: true
              matchValue: ['0.0.0.0/0', '::/0']
            }
          ]
          action: 'Block'
        }
      ]
    }
  }
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = {
  parent: profile
  name: '${prefix}-endpoint'
  location: 'global'
  properties: { enabledState: 'Enabled' }
}

resource originGroup 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = {
  parent: profile
  name: 'ingress-origin-group'
  properties: {
    loadBalancingSettings: { sampleSize: 4, successfulSamplesRequired: 3 }
    healthProbeSettings: {
      probePath: '/api/health/ready'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 30
    }
  }
}

resource origin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = {
  parent: originGroup
  name: 'ingress-origin'
  properties: {
    hostName: originHostName
    originHostHeader: originHostName
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource route 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  parent: endpoint
  name: 'default-route'
  dependsOn: [origin]
  properties: {
    originGroup: { id: originGroup.id }
    supportedProtocols: ['Http', 'Https']
    patternsToMatch: ['/*']
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
  }
}

resource securityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2023-05-01' = {
  parent: profile
  name: 'waf-security-policy'
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: { id: waf.id }
      associations: [
        {
          domains: [{ id: endpoint.id }]
          patternsToMatch: ['/*']
        }
      ]
    }
  }
}

output endpointHostName string = endpoint.properties.hostName
output wafPolicyId string = waf.id
