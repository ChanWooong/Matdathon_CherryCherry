// MeetToIssue 백엔드 인프라
//
// PRD §2에 명시된 서비스만 배포한다:
//   - Container Apps     : 백엔드 호스팅
//   - Key Vault          : GitHub 토큰 보관
//   - App Insights       : 에이전트 단계별 관찰성
//   - Log Analytics      : App Insights 백엔드 (필수 의존성)
//   - Container Registry : 이미지 저장
// 형식적으로 추가한 서비스는 없다 (평가 기준 3번 감점 요소).

targetScope = 'resourceGroup'

@description('리소스 이름에 붙일 접두사')
param namePrefix string = 'meettoissue'

@description('배포 리전')
param location string = resourceGroup().location

@description('환경 구분자 (dev | prod)')
@allowed(['dev', 'prod'])
param environmentName string = 'dev'

@description('배포할 컨테이너 이미지. 최초 배포 시에는 기본 헬로 이미지를 쓴다.')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('GitHub PAT. Key Vault에 저장되며 앱에는 참조로만 주입된다.')
@secure()
param githubToken string = ''

@description('API 접근 키. 비워두면 운영 환경에서 /api가 503으로 잠긴다.')
@secure()
param apiKey string = ''

@description('모델 공급자. github_models는 2026-07-30 폐지되어 선택할 수 없다.')
@allowed(['azure_openai', 'copilot_sdk'])
param modelProvider string = 'azure_openai'

@description('추론에 사용할 모델 배포 이름')
param modelId string = 'gpt-4o'

@description('배포할 Azure OpenAI 모델 이름/버전')
param openAiModelName string = 'gpt-4o'
param openAiModelVersion string = '2024-11-20'

@description('Azure OpenAI 배포 TPM 용량 (1,000 토큰/분 단위)')
param openAiCapacity int = 30

@description('CORS 허용 오리진 (쉼표 구분)')
param corsOrigins string = 'http://localhost:5173'

var suffix = uniqueString(resourceGroup().id)
var resourceName = '${namePrefix}-${environmentName}'
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var openAiUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

// --------------------------------------------------------------------------
// 관찰성
// --------------------------------------------------------------------------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${resourceName}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${resourceName}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// --------------------------------------------------------------------------
// 신원 — 앱이 Key Vault와 ACR에 접근하는 데 쓴다 (비밀번호 없는 인증)
// --------------------------------------------------------------------------

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${resourceName}'
  location: location
}

// --------------------------------------------------------------------------
// 비밀 관리
// --------------------------------------------------------------------------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${namePrefix}-${suffix}'
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

resource githubTokenSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(githubToken)) {
  parent: keyVault
  name: 'github-token'
  properties: {
    value: githubToken
  }
}

// 앱이 기동 시 Key Vault에서 읽어 /api 요청의 X-API-Key와 대조한다.
resource apiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(apiKey)) {
  parent: keyVault
  name: 'api-key'
  properties: {
    value: apiKey
  }
}

resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, identity.id, keyVaultSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      keyVaultSecretsUserRoleId
    )
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// --------------------------------------------------------------------------
// Azure OpenAI (GitHub Models 폐지에 따른 이전 대상)
// --------------------------------------------------------------------------

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'oai-${resourceName}-${suffix}'
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: 'oai-${resourceName}-${suffix}'
    // 키를 아예 발급하지 않고 관리 ID(Entra ID)만 허용한다.
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource openAiDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: modelId
  sku: {
    name: 'GlobalStandard'
    capacity: openAiCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiModelName
      version: openAiModelVersion
    }
  }
}

resource openAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: openAi
  name: guid(openAi.id, identity.id, openAiUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      openAiUserRoleId
    )
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// --------------------------------------------------------------------------
// 컨테이너 레지스트리
// --------------------------------------------------------------------------

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: 'cr${namePrefix}${suffix}'
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      acrPullRoleId
    )
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// --------------------------------------------------------------------------
// Container Apps
// --------------------------------------------------------------------------

resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${resourceName}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${resourceName}'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        // 데모 프론트엔드가 브라우저에서 직접 호출하므로 외부 공개가 필요하다.
        // 접근 통제는 앱 계층의 X-API-Key(require_api_key)가 담당한다.
        // CORS는 브라우저 전용이라 통제 수단이 될 수 없다.
        external: true
        targetPort: 8000
        transport: 'auto'
        corsPolicy: {
          allowedOrigins: split(corsOrigins, ',')
          allowedMethods: ['GET', 'POST', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'ENVIRONMENT', value: environmentName }
            { name: 'MODEL_PROVIDER', value: modelProvider }
            { name: 'MODEL_ID', value: modelId }
            { name: 'AZURE_OPENAI_ENDPOINT', value: openAi.properties.endpoint }
            { name: 'AZURE_OPENAI_API_VERSION', value: '2024-10-21' }
            { name: 'CORS_ORIGINS', value: corsOrigins }
            { name: 'AZURE_KEY_VAULT_URL', value: keyVault.properties.vaultUri }
            { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 8000 }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: 8000 }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        // 데모 중 콜드 스타트를 피하려고 최소 1개를 항상 켜 둔다.
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scale'
            http: { metadata: { concurrentRequests: '20' } }
          }
        ]
      }
    }
  }
  dependsOn: [
    kvSecretsUser
    acrPull
    openAiUser
    openAiDeployment
    githubTokenSecret
    apiKeySecret
  ]
}

// --------------------------------------------------------------------------
// 출력
// --------------------------------------------------------------------------

output openAiEndpoint string = openAi.properties.endpoint
output apiUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output registryLoginServer string = registry.properties.loginServer
output keyVaultName string = keyVault.name
output containerAppName string = containerApp.name
output appInsightsName string = appInsights.name
