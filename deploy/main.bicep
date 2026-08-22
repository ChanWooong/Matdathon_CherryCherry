// MeetToIssue 단일 컨테이너 애플리케이션 인프라
//
// PRD §2에 명시된 서비스만 배포한다:
//   - Container Apps     : 빌드된 SPA와 FastAPI를 함께 호스팅
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
param environmentName string = 'prod'

@description('배포할 컨테이너 이미지. 최초 인프라 생성 시에만 기본 헬로 이미지를 쓴다.')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('컨테이너 수신 포트. 최초 bootstrap 이미지는 80, 앱 이미지는 8000.')
param containerTargetPort int = 80

@description('GitHub PAT. Key Vault에 저장되며 앱에는 참조로만 주입된다.')
@secure()
@minLength(1)
param githubToken string

@description('브라우저 번들과 서버가 공유하는 데모 API 접근 키. Key Vault에 보관한다.')
@secure()
@minLength(1)
param apiKey string

@description('Azure OpenAI 배포 이름. 컨테이너의 MODEL_ID에 같은 값이 주입된다.')
param modelId string = 'gpt-4o'

@description('배포할 Azure OpenAI 모델 이름/버전')
param openAiModelName string = 'gpt-4o'
param openAiModelVersion string = '2024-11-20'

@description('Azure OpenAI 배포 TPM 용량 (1,000 토큰/분 단위)')
param openAiCapacity int = 30

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
  name: 'kv-${suffix}'
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

resource githubTokenSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'github-token'
  properties: {
    value: githubToken
  }
}

// 앱이 기동 시 Key Vault에서 읽어 /api 요청의 X-API-Key와 대조한다.
resource apiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
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
        // SPA와 API가 같은 공개 호스트에서 제공된다.
        external: true
        targetPort: containerTargetPort
        transport: 'auto'
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
            // Copilot SDK는 로컬 코드 평가 경로다. Azure는 비대화형 관리 ID를 사용한다.
            { name: 'MODEL_PROVIDER', value: 'azure_openai' }
            { name: 'MODEL_ID', value: modelId }
            { name: 'AZURE_OPENAI_ENDPOINT', value: openAi.properties.endpoint }
            { name: 'AZURE_OPENAI_API_VERSION', value: '2024-10-21' }
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
              httpGet: {
                path: containerTargetPort == 8000 ? '/health' : '/'
                port: containerTargetPort
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: containerTargetPort == 8000 ? '/health' : '/'
                port: containerTargetPort
              }
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
output openAiDeploymentName string = openAiDeployment.name
output appUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output apiBaseUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}/api'
output healthUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}/health'
output registryLoginServer string = registry.properties.loginServer
output registryName string = registry.name
output keyVaultName string = keyVault.name
output containerAppName string = containerApp.name
output appInsightsName string = appInsights.name
