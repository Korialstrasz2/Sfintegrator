# SF Integrator

A lightweight Flask application to manage Salesforce org connections via OAuth 2.0 and run SOQL queries.

## Features

- Configure multiple Salesforce orgs (production, sandbox, or custom domains).
- Perform OAuth 2.0 flows to connect orgs and store tokens securely on disk.
- Run SOQL queries against connected orgs directly from the UI.
- Built-in guide documenting Salesforce and application configuration steps.

## Getting started

1. Create and activate a Python 3.10+ virtual environment.
2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. (Optional) Use the helper script to create/activate a virtual environment,
   install dependencies, and start the server automatically:

   ```bash
   ./setup_and_run.sh
   ```

   The script will create `./venv` if it does not already exist.

4. To run the app manually, set the Flask app and start the development server:

   ```bash
   export FLASK_APP=app
   flask run
   ```

   The app runs on <http://localhost:5000>.

4. Configure your Salesforce connected app with the callback URL `http://localhost:5000/oauth/callback` (or your deployed URL).
5. Use the Org Configuration page to add your org credentials and authorize via OAuth.

## Environment variables

Set `FLASK_SECRET_KEY` to override the default secret key in production deployments.

## Data storage

Org definitions and OAuth tokens are stored in `data/orgs.json`. Treat this file as sensitive because it may contain refresh tokens.

## Troubleshooting

- **"Restricted Domain" during login:** Your Salesforce org likely enforces the *Restrict login domains* policy and rejects credentials on `login.salesforce.com` or `test.salesforce.com`. When adding the org in SF Integrator, choose **Custom Domain** and provide your My Domain login URL (for example `https://your-domain.my.salesforce.com`). Alternatively, relax the policy in **Setup → My Domain** so the OAuth flow can start from the selected host.
