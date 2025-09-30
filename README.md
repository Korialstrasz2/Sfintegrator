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

3. Set the Flask app and run the development server:

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
