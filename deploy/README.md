# Azure deployment

`deploy/` is the single deployment entry point. Its multi-stage image builds the
Vite SPA and FastAPI API, then serves both from one non-root Azure Container
App. These files are deployment-ready, but they have **not** deployed Azure
resources.

## Runtime architecture

The Bicep template creates exactly these required resources:

- Azure Container Apps and Azure Container Registry (ACR)
- Key Vault and a user-assigned managed identity
- Azure OpenAI plus a model deployment
- Application Insights and its Log Analytics workspace

The Azure container always receives:

- `MODEL_PROVIDER=azure_openai`
- `MODEL_ID=<Bicep-created Azure OpenAI deployment name>` (`gpt-4o` by default)
- `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_VERSION`
- `AZURE_KEY_VAULT_URL` and `AZURE_CLIENT_ID`
- `APPLICATIONINSIGHTS_CONNECTION_STRING` and `ENVIRONMENT`

Azure OpenAI uses managed identity; no OpenAI API key is created or preferred.
The image does not install or run Copilot CLI. Local/code evaluation may default
to `MODEL_PROVIDER=copilot_sdk` and `MODEL_ID=gpt-5-mini`, but those settings
must not be carried into Azure.

GitHub access is server-side only. `GITHUB_TOKEN` becomes the Key Vault secret
`github-token`; it is never built into the SPA or image. There is no OAuth or
authentication endpoint. The frontend uses its local mock identity with
`VITE_DEMO_BYPASS_AUTH=true`.

The current API can resolve public repository URLs without a token, but the
deployment still requires `GITHUB_TOKEN` because the complete evaluation path
creates approved issues and loads repository policy data.

The SPA and API share one origin. The build uses `VITE_API_URL=/api` and does
not depend on CORS.

## Security model for the demo

Every `/api` route in production requires `X-API-Key`. `API_KEY` becomes the
Key Vault secret `api-key`, while the same value is embedded as `VITE_API_KEY`
in public browser JavaScript so the demo works.

**This browser-visible key is not a user secret or strong authentication.** It
is only demo abuse deterrence. Scope the GitHub token to the minimum required
repositories and permissions, rotate both values after exposure or handoff,
and never reuse them elsewhere. A public production product must replace the
shared browser key and mock identity with real user authentication and
authorization. Changing `API_KEY` requires rebuilding the image so browser and
server remain in sync.

## Prerequisites

- An Azure subscription and permission to create resource groups, resources,
  deployments, and role assignments
- Azure CLI with Bicep and the `containerapp` extension
- `bash`, `curl`, `openssl`, `python3`, and `tar`
- An Azure region with Azure OpenAI availability and quota for the selected
  model/version (availability differs by subscription and region)
- A narrowly scoped GitHub token that the server can use for the required
  repository and issue operations

## Handoff checklist

1. Sign in and verify the intended subscription:

   ```bash
   az login
   az account show -o table
   # If needed:
   az account set --subscription '<subscription-id-or-name>'
   az extension add --name containerapp --upgrade
   az bicep install
   ```

2. Register providers if the subscription has not used them:

   ```bash
   for provider in Microsoft.App Microsoft.ContainerRegistry Microsoft.KeyVault \
     Microsoft.ManagedIdentity Microsoft.CognitiveServices Microsoft.Insights \
     Microsoft.OperationalInsights; do
     az provider register --namespace "$provider" --wait
   done
   ```

3. Check files/tools without credentials, then perform the authenticated check:

   ```bash
   ./deploy/preflight.sh --check-only
   export GITHUB_TOKEN='...'
   # Optional: generated and printed once if omitted.
   export API_KEY='a-long-random-demo-value'
   ./deploy/preflight.sh
   ```

4. Optionally make the clean handoff archive:

   ```bash
   ./deploy/package.sh
   tar -tzf artifacts/meettoissue-deploy.tar.gz
   ```

   The archive contains only `deploy/`, frontend build inputs, backend runtime
   inputs/package metadata, and root `.dockerignore`. It excludes tests, other
   docs, dependencies, histories/runtime data, secrets, environment files, and
   Git data.

5. Confirm the default model is available in the target region, then deploy:

   ```bash
   ./deploy/deploy.sh rg-meettoissue-prod koreacentral
   ```

   To select another supported model, set all matching deployment values:

   ```bash
   export AZURE_OPENAI_DEPLOYMENT='my-deployment-name'
   export AZURE_OPENAI_MODEL_NAME='gpt-4o'
   export AZURE_OPENAI_MODEL_VERSION='2024-11-20'
   export AZURE_OPENAI_CAPACITY='30'
   ./deploy/deploy.sh rg-meettoissue-prod koreacentral
   ```

The script builds remotely from the repository root with `deploy/Dockerfile`,
updates the single Container App, checks `/health`, and prints the deployment
name, application URL, `/api` base URL, health URL, Key Vault, and Azure OpenAI
deployment. Defaults are `ENVIRONMENT=prod`, `NAME_PREFIX=meettoissue`, and a
timestamp image tag. No `azd` configuration is claimed or required.

## Logs and outputs

```bash
az deployment group list -g rg-meettoissue-prod -o table
az deployment group show -g rg-meettoissue-prod \
  -n <deployment-name> --query properties.outputs
az containerapp logs show -g rg-meettoissue-prod \
  -n ca-meettoissue-prod --follow
az containerapp revision list -g rg-meettoissue-prod \
  -n ca-meettoissue-prod -o table
```

## Rollback

Single-revision mode rolls back by redeploying a retained immutable ACR image:

```bash
az containerapp update -g rg-meettoissue-prod \
  -n ca-meettoissue-prod \
  --image <registry>.azurecr.io/meettoissue:<previous-tag>
curl -fsS https://<container-app-fqdn>/health
```

Keep prior image tags until rollback is no longer needed.

## Cleanup and cost

Container Apps, ACR, Log Analytics/Application Insights, Key Vault, and
especially Azure OpenAI can incur charges. Review pricing, quotas, logs, and
minimum replicas before leaving the demo running. To irreversibly remove the
entire dedicated resource group:

```bash
az group delete -n rg-meettoissue-prod --yes --no-wait
```

Verify the group contains nothing that must be retained before running cleanup.
