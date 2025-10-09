# GitHub Actions Workflows

This directory contains CI/CD workflows for automated deployment.

**⚠️ Workflows are currently disabled** (`.disabled` extension). To enable them, rename the files back to `.yml` and configure the required secrets below.

## Required Repository Secrets

To enable these workflows, you need to configure the following secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

### Frontend Deployment (`firebase-deploy.yml`)

- `FIREBASE_SERVICE_ACCOUNT_SENSUS_APP_8DB18` - Firebase service account JSON
- `FIREBASE_PROJECT_ID` - Your Firebase project ID (e.g., `sensus-app-8db18`)

### Backend Deployment (`cloud-run-deploy.yml`)

- `GCP_SA_KEY` - Google Cloud service account JSON with Cloud Run permissions
- `MONGODB_URI` - MongoDB connection string (Atlas or other)
- `GEMINI_API_KEY` - Google Gemini API key

## Disabling Workflows

If you want to disable these workflows temporarily:

1. Rename the workflow files to add `.disabled` extension (e.g., `firebase-deploy.yml.disabled`)
2. Or delete the workflows entirely if you prefer manual deployment

## Manual Deployment

### Frontend
```bash
cd client
npm run build
firebase deploy --only hosting
```

### Backend
```bash
cd server
gcloud builds submit . --tag gcr.io/sensus-app-8db18/sensus-api:latest
gcloud run deploy sensus-api --image gcr.io/sensus-app-8db18/sensus-api:latest --region us-central1
```
