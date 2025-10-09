# GitHub Actions Workflows

This directory contains CI/CD workflows for automated deployment.

**⚠️ Workflows are currently disabled** (`.disabled` extension). Fixed versions are available (`.fixed` extension).

## Status

- ❌ **Original workflows** (`.disabled`) - Had issues with environment variable passing and Secret Manager integration
- ✅ **Fixed workflows** (`.fixed`) - Ready to use once secrets are configured

## Issues Found in Original Workflows

### Firebase Deploy
1. Missing `REACT_APP_API_URL` environment variable during build
2. Overly complex secret handling

### Cloud Run Deploy
1. Using `google-github-actions/deploy-cloudrun@v2` with environment variables instead of Secret Manager
2. Should reference Secret Manager secrets directly (more secure)
3. Missing Docker build step

## Required Repository Secrets

To enable these workflows, you need to configure the following secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

### Frontend Deployment (`firebase-deploy.yml.fixed`)

- `FIREBASE_SERVICE_ACCOUNT_SENSUS_APP_8DB18` - Firebase service account JSON

**How to get it:**
```bash
# Generate and download from Firebase Console
# Project Settings > Service Accounts > Generate New Private Key
# Then add the entire JSON content as a GitHub secret
```

### Backend Deployment (`cloud-run-deploy.yml.fixed`)

- `GCP_SA_KEY` - Google Cloud service account JSON with these permissions:
  - `roles/run.admin` (Cloud Run Admin)
  - `roles/storage.admin` (for GCR - Google Container Registry)
  - `roles/iam.serviceAccountUser`
  - `roles/secretmanager.secretAccessor` (to read Secret Manager secrets)

**How to get it:**
```bash
# Create service account
gcloud iam service-accounts create github-actions-deployer \
  --display-name="GitHub Actions Deployer"

# Grant required roles
gcloud projects add-iam-policy-binding sensus-app-8db18 \
  --member="serviceAccount:github-actions-deployer@sensus-app-8db18.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding sensus-app-8db18 \
  --member="serviceAccount:github-actions-deployer@sensus-app-8db18.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding sensus-app-8db18 \
  --member="serviceAccount:github-actions-deployer@sensus-app-8db18.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Generate key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions-deployer@sensus-app-8db18.iam.gserviceaccount.com

# Add the contents of github-actions-key.json as GCP_SA_KEY secret in GitHub
```

**Note:** The backend workflow uses Secret Manager for runtime secrets (`MONGODB_URI` and `GEMINI_API_KEY`). These should already exist in Secret Manager with versions tagged as `latest`.

## Enabling the Fixed Workflows

1. **Add the required secrets** to your GitHub repository:
   - Go to: `Settings > Secrets and variables > Actions > New repository secret`
   - Add `FIREBASE_SERVICE_ACCOUNT_SENSUS_APP_8DB18`
   - Add `GCP_SA_KEY`

2. **Activate the workflows:**
   ```bash
   # Remove the .fixed extension to activate
   mv .github/workflows/firebase-deploy.yml.fixed .github/workflows/firebase-deploy.yml
   mv .github/workflows/cloud-run-deploy.yml.fixed .github/workflows/cloud-run-deploy.yml
   
   # Commit and push
   git add .github/workflows/*.yml
   git commit -m "Enable CI/CD workflows"
   git push
   ```

3. **Test the workflows:**
   - Firebase deploy will trigger on any push to `main`
   - Cloud Run deploy will only trigger on changes to `server/**` or the workflow itself
   - Both can be manually triggered from the Actions tab

## Manual Deployment (Alternative)

If you prefer manual deployment or want to test locally:

### Frontend
```bash
cd client
# Set the API URL for production
export REACT_APP_API_URL=https://sensus-api-602409653611.us-central1.run.app
npm run build
firebase deploy --only hosting --project sensus-app-8db18
```

### Backend
```bash
cd server
# Build and push image
gcloud builds submit . --tag gcr.io/sensus-app-8db18/sensus-api:latest

# Deploy to Cloud Run with Secret Manager secrets
gcloud run deploy sensus-api \
  --image gcr.io/sensus-app-8db18/sensus-api:latest \
  --region us-central1 \
  --project sensus-app-8db18 \
  --allow-unauthenticated \
  --set-secrets="MONGODB_URI=MONGODB_URI:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

## Troubleshooting

### Firebase Deploy Fails
- **Check:** Service account JSON is valid
- **Check:** Service account has Firebase Hosting Admin role
- **Check:** Project ID matches in `.firebaserc`

### Cloud Run Deploy Fails
- **Check:** Service account has all required roles
- **Check:** Docker image builds successfully locally
- **Check:** Secret Manager secrets exist and are accessible
- **Check:** Runtime service account has `secretAccessor` role

### Build Fails
- **Frontend:** Check that `REACT_APP_API_URL` is set correctly
- **Backend:** Check that `Dockerfile` exists and is valid
