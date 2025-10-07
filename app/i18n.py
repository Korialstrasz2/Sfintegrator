from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict


DEFAULT_LANGUAGE = "en"


_LANGUAGE_PACKS: Dict[str, Dict[str, Any]] = {
    "en": {
        "language_name": "English",
        "app": {"title": "SF Integrator"},
        "nav": {
            "brand": "SF Integrator",
            "query": "Query",
            "complex": "Get Complex Data",
            "org_config": "Org Configuration",
            "guide": "Guide",
            "settings": "Settings",
        },
        "index": {
            "select_org": {
                "title": "Select an org",
                "description": "Choose a configured org to run SOQL queries.",
                "connected_badge": "Connected",
                "not_connected_badge": "Not connected",
                "empty": "No orgs yet. Add one from the org configuration page.",
                "manage_button": "Manage orgs",
            },
            "help": {
                "title": "Need help?",
                "description": "Follow the configuration checklist.",
                "guide_button": "View guide",
            },
            "query": {
                "title": "SOQL Explorer",
                "selected_org_label": "Selected Org",
                "selected_org_placeholder": "Select an org",
                "soql_label": "SOQL Query",
                "soql_placeholder": "SELECT Id\nFROM Account",
                "run_button": "Run query",
                "helpers": {
                    "add_limit": "Add LIMIT 100",
                    "add_order_by": "Add ORDER BY CreatedDate DESC",
                },
                "saved_queries": {
                    "title": "Saved Queries",
                    "name_label": "Name",
                    "name_placeholder": "My SOQL query",
                    "save_button": "Save query",
                    "update_button": "Update query",
                    "reset_button": "Clear",
                    "empty": "No saved queries yet.",
                    "load_button": "Load",
                    "delete_button": "Delete",
                },
                "history": {
                    "title": "Query history",
                    "filter_label": "Filter by object",
                    "filter_all": "All objects",
                    "empty": "No queries run yet.",
                    "object_unknown": "Unknown object",
                    "org_label": "Org",
                },
                "suggestions": {
                    "title": "Suggested fields",
                    "empty": "No suggestions available.",
                    "field_exists_toast": '"{field}" is already present in the SELECT clause',
                },
                "autocomplete": {
                    "title": "Autocomplete",
                    "objects_label": "Objects",
                    "objects_placeholder": "Filter objects",
                    "objects_empty": "Select an org to load objects.",
                    "fields_label": "Fields",
                    "fields_empty": "Select an object to view fields.",
                    "loading": "Loading...",
                },
            },
            "complex": {
                "tab_label": "Get Complex Data",
                "title": "Complex data wizard",
                "description": "Design multi-level Salesforce queries with guided steps, templates, and instant previews.",
                "launch_button": "Launch wizard",
                "resume_button": "Resume setup",
                "resume_disabled": "Generate a query first to enable resume.",
                "reset_button": "Reset wizard",
                "reset_confirm": "Reset the complex data wizard configuration?",
                "last_query": {
                    "title": "Latest generated query",
                    "empty": "Run the wizard to see the generated SOQL query here.",
                    "helper": "Use the buttons to insert or run the query in the SOQL explorer.",
                    "insert_button": "Insert into editor",
                },
                "templates_section": {
                    "title": "Templates",
                    "description": "Start from curated blueprints combining parent and child data.",
                },
                "tasks": {
                    "title": "Guided tasks",
                    "description": "Pick a goal to auto-populate objects, relationships, and filters.",
                    "items": [
                        {
                            "id": "account-connected-data",
                            "label": "Account with contacts, contracts, billing, and touchpoints",
                            "description": "Bring together Accounts, related Contacts, Contracts, Billing Profiles, Individuals, and Contact Points.",
                            "preset": {
                                "base": "Account",
                                "fields": ["Id", "Name", "AccountNumber", "Type", "Industry", "BillingCity"],
                                "parentRelationships": [
                                    {
                                        "relationship": "Owner",
                                        "object": "User",
                                        "label": "Owner",
                                        "fields": ["Name", "Email"],
                                    },
                                    {
                                        "relationship": "Parent",
                                        "object": "Account",
                                        "label": "Parent Account",
                                        "fields": ["Name"],
                                    },
                                ],
                                "childRelationships": [
                                    {
                                        "relationship": "Contacts",
                                        "object": "Contact",
                                        "label": "Contacts",
                                        "fields": ["Id", "FirstName", "LastName", "Email", "Phone"],
                                    },
                                    {
                                        "relationship": "Contracts",
                                        "object": "Contract",
                                        "label": "Contracts",
                                        "fields": ["Id", "ContractNumber", "Status", "StartDate", "EndDate"],
                                    },
                                    {
                                        "relationship": "BillingProfiles",
                                        "object": "BillingProfile",
                                        "label": "Billing Profiles",
                                        "fields": ["Id", "BillingProfileNumber", "Status", "AutoPayEnabled"],
                                    },
                                    {
                                        "relationship": "Individuals",
                                        "object": "Individual",
                                        "label": "Individuals",
                                        "fields": ["Id", "FirstName", "LastName", "IndividualType"],
                                    },
                                    {
                                        "relationship": "ContactPoints",
                                        "object": "ContactPointTypeConsent",
                                        "label": "Contact Points",
                                        "fields": ["Id", "Name", "ContactPointType", "ConsentCapturedDate"],
                                    },
                                ],
                                "filters": [
                                    {"field": "IsActive", "operator": "=", "value": "true"},
                                ],
                                "limit": 200,
                            },
                        },
                        {
                            "id": "opportunity-growth",
                            "label": "Evaluate open opportunities with products and quotes",
                            "description": "Review pipeline Opportunities together with product line items and quotes.",
                            "preset": {
                                "base": "Opportunity",
                                "fields": ["Id", "Name", "StageName", "Amount", "CloseDate", "ForecastCategory"],
                                "parentRelationships": [
                                    {
                                        "relationship": "Account",
                                        "object": "Account",
                                        "label": "Account",
                                        "fields": ["Name", "Industry"],
                                    },
                                    {
                                        "relationship": "Owner",
                                        "object": "User",
                                        "label": "Owner",
                                        "fields": ["Name", "Email"],
                                    },
                                ],
                                "childRelationships": [
                                    {
                                        "relationship": "OpportunityLineItems",
                                        "object": "OpportunityLineItem",
                                        "label": "Products",
                                        "fields": ["Id", "Quantity", "UnitPrice", "TotalPrice"],
                                    },
                                    {
                                        "relationship": "Quotes",
                                        "object": "Quote",
                                        "label": "Quotes",
                                        "fields": ["Id", "Name", "Status", "GrandTotal"],
                                    },
                                ],
                                "filters": [
                                    {"field": "IsClosed", "operator": "=", "value": "false"},
                                    {"field": "Amount", "operator": ">", "value": "10000"},
                                ],
                                "limit": 150,
                            },
                        },
                        {
                            "id": "case-handoff",
                            "label": "Prepare support case hand-off",
                            "description": "Summarize Cases with customer context, comments, and collaboration history.",
                            "preset": {
                                "base": "Case",
                                "fields": ["Id", "CaseNumber", "Subject", "Status", "Priority", "CreatedDate"],
                                "parentRelationships": [
                                    {
                                        "relationship": "Account",
                                        "object": "Account",
                                        "label": "Account",
                                        "fields": ["Name", "Industry"],
                                    },
                                    {
                                        "relationship": "Contact",
                                        "object": "Contact",
                                        "label": "Contact",
                                        "fields": ["FirstName", "LastName", "Email"],
                                    },
                                    {
                                        "relationship": "Owner",
                                        "object": "User",
                                        "label": "Owner",
                                        "fields": ["Name"],
                                    },
                                ],
                                "childRelationships": [
                                    {
                                        "relationship": "CaseComments",
                                        "object": "CaseComment",
                                        "label": "Case Comments",
                                        "fields": ["Id", "CommentBody", "CreatedDate"],
                                    },
                                    {
                                        "relationship": "Feeds",
                                        "object": "CaseFeed",
                                        "label": "Case Feed",
                                        "fields": ["Id", "Body", "CreatedDate"],
                                    },
                                ],
                                "filters": [
                                    {"field": "Status", "operator": "IN", "value": "('New','Working')"},
                                ],
                                "limit": 100,
                            },
                        },
                    ],
                },
                "templates": [
                    {
                        "id": "account-connected",
                        "label": "Account relationship map",
                        "description": "Multi-level view of Accounts with the people and billing structure around them.",
                        "preset": {
                            "base": "Account",
                            "fields": ["Id", "Name", "AccountNumber", "Type", "Industry", "BillingCity"],
                            "parentRelationships": [
                                {
                                    "relationship": "Owner",
                                    "object": "User",
                                    "label": "Owner",
                                    "fields": ["Name", "Email"],
                                },
                                {
                                    "relationship": "Parent",
                                    "object": "Account",
                                    "label": "Parent Account",
                                    "fields": ["Name"],
                                },
                            ],
                            "childRelationships": [
                                {
                                    "relationship": "Contacts",
                                    "object": "Contact",
                                    "label": "Contacts",
                                    "fields": ["Id", "FirstName", "LastName", "Email", "Phone"],
                                },
                                {
                                    "relationship": "Contracts",
                                    "object": "Contract",
                                    "label": "Contracts",
                                    "fields": ["Id", "ContractNumber", "Status", "StartDate", "EndDate"],
                                },
                                {
                                    "relationship": "BillingProfiles",
                                    "object": "BillingProfile",
                                    "label": "Billing Profiles",
                                    "fields": ["Id", "BillingProfileNumber", "Status", "AutoPayEnabled"],
                                },
                                {
                                    "relationship": "Individuals",
                                    "object": "Individual",
                                    "label": "Individuals",
                                    "fields": ["Id", "FirstName", "LastName", "IndividualType"],
                                },
                                {
                                    "relationship": "ContactPoints",
                                    "object": "ContactPointTypeConsent",
                                    "label": "Contact Points",
                                    "fields": ["Id", "Name", "ContactPointType", "ConsentCapturedDate"],
                                },
                            ],
                            "filters": [
                                {"field": "IsActive", "operator": "=", "value": "true"},
                            ],
                            "limit": 200,
                        },
                    },
                    {
                        "id": "opportunity-growth-plan",
                        "label": "Opportunity growth plan",
                        "description": "Blend open Opportunities with products and quotes to prepare forecast reviews.",
                        "preset": {
                            "base": "Opportunity",
                            "fields": ["Id", "Name", "StageName", "Amount", "CloseDate", "ForecastCategory"],
                            "parentRelationships": [
                                {
                                    "relationship": "Account",
                                    "object": "Account",
                                    "label": "Account",
                                    "fields": ["Name", "Industry"],
                                },
                                {
                                    "relationship": "Owner",
                                    "object": "User",
                                    "label": "Owner",
                                    "fields": ["Name", "Email"],
                                },
                            ],
                            "childRelationships": [
                                {
                                    "relationship": "OpportunityLineItems",
                                    "object": "OpportunityLineItem",
                                    "label": "Products",
                                    "fields": ["Id", "Quantity", "UnitPrice", "TotalPrice"],
                                },
                                {
                                    "relationship": "Quotes",
                                    "object": "Quote",
                                    "label": "Quotes",
                                    "fields": ["Id", "Name", "Status", "GrandTotal"],
                                },
                            ],
                            "filters": [
                                {"field": "IsClosed", "operator": "=", "value": "false"},
                                {"field": "Amount", "operator": ">", "value": "10000"},
                            ],
                            "limit": 150,
                        },
                    },
                    {
                        "id": "case-collaboration",
                        "label": "Case collaboration dossier",
                        "description": "Gather case context, customer details, comments, and feed updates for escalations.",
                        "preset": {
                            "base": "Case",
                            "fields": ["Id", "CaseNumber", "Subject", "Status", "Priority", "CreatedDate"],
                            "parentRelationships": [
                                {
                                    "relationship": "Account",
                                    "object": "Account",
                                    "label": "Account",
                                    "fields": ["Name", "Industry"],
                                },
                                {
                                    "relationship": "Contact",
                                    "object": "Contact",
                                    "label": "Contact",
                                    "fields": ["FirstName", "LastName", "Email"],
                                },
                                {
                                    "relationship": "Owner",
                                    "object": "User",
                                    "label": "Owner",
                                    "fields": ["Name"],
                                },
                            ],
                            "childRelationships": [
                                {
                                    "relationship": "CaseComments",
                                    "object": "CaseComment",
                                    "label": "Case Comments",
                                    "fields": ["Id", "CommentBody", "CreatedDate"],
                                },
                                {
                                    "relationship": "Feeds",
                                    "object": "CaseFeed",
                                    "label": "Case Feed",
                                    "fields": ["Id", "Body", "CreatedDate"],
                                },
                            ],
                            "filters": [
                                {"field": "Status", "operator": "IN", "value": "('New','Working')"},
                            ],
                            "limit": 100,
                        },
                    },
                ],
                "modal": {
                    "title": "Complex data wizard",
                    "description": "Follow the guided steps to select base objects, relationships, filters, and preview the data.",
                    "preview_label": "Preview query",
                    "preview_helper": "Every change instantly updates the query preview shown above.",
                    "data_title": "Data preview",
                    "data_empty": "Run the query to preview the results.",
                    "run_button": "Run now",
                    "insert_button": "Insert into editor",
                    "back_button": "Back",
                    "next_button": "Next step",
                    "done_button": "Close wizard",
                    "copy_button": "Copy query",
                    "close_button": "Close",
                    "refresh_button": "Re-run last query",
                    "steps": [
                        {"id": "intent", "label": "Goal"},
                        {"id": "fields", "label": "Fields"},
                        {"id": "relationships", "label": "Relationships"},
                        {"id": "review", "label": "Review"},
                    ],
                },
            },
        },
        "orgs": {
            "form": {
                "title": "Add or update an org",
                "id_label": "Org ID",
                "id_placeholder": "unique-id",
                "id_help": "Use a unique identifier (e.g. prod, sandbox1).",
                "label_label": "Display name",
                "label_placeholder": "Production Org",
                "environment_label": "Environment",
                "environment_production": "Production (login.salesforce.com)",
                "environment_sandbox": "Sandbox (test.salesforce.com)",
                "environment_custom": "Custom Domain",
                "environment_custom_placeholder": "https://your-domain.my.salesforce.com",
                "environment_help": "Select custom to use a My Domain login URL.",
                "client_id_label": "Consumer Key (Client ID)",
                "client_secret_label": "Consumer Secret",
                "client_secret_help": "Leave blank to keep the existing secret when editing.",
                "redirect_uri_label": "Redirect URI",
                "redirect_uri_placeholder": "https://yourapp.com/oauth/callback",
                "scope_label": "OAuth Scope",
                "scope_default": "full refresh_token",
                "save_button": "Save org",
                "clear_button": "Clear form",
                "update_button": "Update org",
            },
            "table": {
                "title": "Configured orgs",
                "empty": "No orgs configured yet.",
                "headers": {
                    "id": "ID",
                    "label": "Label",
                    "environment": "Environment",
                    "status": "Status",
                    "actions": "",
                },
                "connected_badge": "Connected",
                "not_connected_badge": "Not connected",
                "actions": {
                    "connect": "Connect",
                    "edit": "Edit",
                    "delete": "Delete",
                },
            },
        },
        "guide": {
            "title": "Salesforce OAuth Integration Checklist",
            "subtitle": "Follow these steps to connect this app with your Salesforce org.",
            "sections": {
                "prepare": {
                    "title": "1. Prepare Salesforce",
                    "steps": [
                        "Sign in to the Salesforce org that you want to integrate.",
                        "Navigate to <strong>Setup &gt; Apps &gt; App Manager</strong> and click <strong>New Connected App</strong> (Lightning Experience) rather than <em>New Lightning App</em> or <em>New External Client App</em>.",
                        "Fill out the basic information section: enter a descriptive <strong>Connected App Name</strong>, allow Salesforce to auto-populate the <strong>API Name</strong>, and provide a <strong>Contact Email</strong>; the remaining optional fields can stay blank unless your org requires them.",
                        "Enable <strong>OAuth Settings for API Integration</strong> to reveal the integration options.",
                        "Within the OAuth settings, leave <strong>Require Secret for Web Server Flow</strong> checked, keep the default <strong>Selected OAuth Scopes</strong> list empty for now, and skip optional fields such as <em>Start URL</em> or <em>Callback URL for Lightning Apps</em>.",
                        "Set the primary <strong>Callback URL</strong> to <code>http://localhost:5000/oauth/callback</code> for local development; when deploying, replace <code>localhost:5000</code> with your host name while keeping the path <code>/oauth/callback</code>.",
                        "Add the following OAuth scopes to the <strong>Selected OAuth Scopes</strong> list: <code>Full access (full)</code> and <code>Perform requests on your behalf at any time (refresh_token, offline_access)</code>. Other scopes can remain unselected unless your integration needs them.",
                        "Save the connected app and copy the <strong>Consumer Key</strong> and <strong>Consumer Secret</strong>.",
                        "Under <strong>Manage &gt; OAuth Policies</strong>, ensure that the refresh token policy allows refresh token usage.",
                    ],
                },
                "configure": {
                    "title": "2. Configure the integrator",
                    "steps": [
                        "Open the <a href=\"{org_config_url}\">Org Configuration</a> page.",
                        "Fill in the form with:",
                        "Click <strong>Save org</strong>.",
                        "Use the <strong>Connect</strong> button in the table to start OAuth authorization.",
                        "Grant access in Salesforce when prompted; you will be redirected back to the app.",
                    ],
                    "form_details": [
                        "<strong>Org ID</strong>: an internal identifier such as <code>prod</code> or <code>dev</code>.",
                        "<strong>Display name</strong>: friendly name shown in the UI.",
                        "<strong>Environment</strong>: choose Production, Sandbox, or enter your custom My Domain URL.",
                        "<strong>Consumer Key</strong> and <strong>Consumer Secret</strong> from the connected app.",
                        "<strong>Redirect URI</strong>: must match the callback URL configured in Salesforce.",
                        "<strong>OAuth Scope</strong>: default is <code>full refresh_token</code>; adjust if needed.",
                    ],
                },
                "query": {
                    "title": "3. Run SOQL queries",
                    "steps": [
                        "Return to the <a href=\"{query_url}\">Query</a> page.",
                        "Select the org you just authorized and paste a SOQL query, e.g. <code>SELECT Id, Name FROM Account LIMIT 10</code>.",
                        "Click <strong>Run query</strong> to execute. Results appear in a table below the form.",
                    ],
                },
            },
            "tip": {
                "title": "Tip:",
                "content": "For local development, set your callback URL to <code>http://localhost:5000/oauth/callback</code> and add it to the connected app's list of allowed callbacks. When deploying, update the host name to match your environment but keep the path <code>/oauth/callback</code> so the redirect completes successfully.",
            },
        },
        "settings": {
            "title": "Settings",
            "language_label": "Language",
            "theme_label": "Theme",
            "save_button": "Save settings",
            "saved": "Settings updated successfully.",
            "themes": {
                "classic": "Classic",
                "modern": "Modern",
                "dark": "Dark",
                "sci-fi": "Sci-fi",
            },
        },
        "frontend": {
            "toast": {
                "select_org": "Select an org before running a query",
                "enter_query": "Enter a SOQL query",
                "query_failed": "Query failed",
                "org_created": "Org created",
                "org_updated": "Org updated",
                "org_deleted": "Org deleted",
                "delete_failed": "Failed to delete org",
                "fill_required": "Please fill all required fields",
                "enter_secret": "Enter the consumer secret for new orgs",
                "save_failed": "Unable to save org",
                "saved_queries_load_failed": "Unable to load saved queries",
                "saved_query_save_failed": "Unable to save query",
                "saved_query_delete_failed": "Unable to delete saved query",
                "saved_query_saved": "Saved query stored",
                "saved_query_deleted": "Saved query deleted",
                "saved_query_loaded": "Saved query loaded",
                "enter_saved_query_name": "Enter a name for the saved query",
                "metadata_fetch_failed": "Unable to load Salesforce objects",
                "fields_fetch_failed": "Unable to load Salesforce fields",
                "clause_exists": '"{clause}" is already present in the query',
                "field_already_selected": '"{field}" is already present in the SELECT clause',
                "query_history_load_failed": "Unable to load query history",
                "no_results_available": "Run a query first to use this action",
                "results_copy_csv_success": "Results copied as CSV",
                "results_copy_excel_success": "Results copied as Excel",
                "results_copy_failed": "Unable to copy results",
                "results_export_ready_csv": "CSV download started",
                "results_export_ready_excel": "Excel download started",
                "results_export_failed": "Unable to export results",
                "query_without_limit_where": "Add a WHERE or LIMIT clause before running the query.",
            },
            "query": {
                "no_records": "No records returned.",
                "results": {
                    "copy_csv": "Copy as CSV",
                    "copy_excel": "Copy as Excel",
                    "export_csv": "Export CSV",
                    "export_excel": "Export Excel",
                },
            },
            "form": {"update_button": "Update org", "save_button": "Save org"},
            "confirm": {
                "delete_org": "Delete org {orgId}?",
                "query_without_limit_where": "Are you sure you want to run a query without LIMIT nor WHERE?",
            },
            "saved_queries": {"load": "Load", "delete": "Delete"},
            "autocomplete": {"insert": "Insert"},
            "history": {
                "filter_all": "All objects",
                "object_unknown": "Unknown object",
                "org_label": "Org",
            },
            "complex": {
                "step_label": "Step",
                "step_intent": "Goal",
                "step_fields": "Fields",
                "step_relationships": "Relationships",
                "step_review": "Review",
                "intent_base_label": "Base object",
                "intent_base_placeholder": "Start typing an object name",
                "intent_hint": "Choose the primary object you want to explore.",
                "intent_template_label": "Template",
                "intent_template_placeholder": "Select a template",
                "intent_template_hint": "Templates preselect relationships and filters. You can adjust every step.",
                "intent_task_label": "Guided task",
                "intent_task_placeholder": "Select a task",
                "intent_missing_base": "Select a base object first to continue.",
                "loading_metadata": "Loading Salesforce metadata…",
                "fields_title": "{object} fields",
                "fields_selected": "{count} fields selected",
                "fields_search_placeholder": "Filter fields",
                "fields_none_available": "No fields available.",
                "relationships_parents": "Parent relationships",
                "relationships_no_parents": "No parent relationships available.",
                "relationships_parent_details": "Lookup to {object}",
                "relationships_add": "Add",
                "relationships_remove": "Remove",
                "relationships_children": "Child relationships",
                "relationships_no_children": "No child relationships available.",
                "relationships_child_details": "Child object {object}",
                "relationships_selected_empty": "No relationships selected yet.",
                "relationships_selected_title": "{relationship} • {object}",
                "relationships_selected_help": "Select the fields to include for this relationship.",
                "filters_title": "Filters and limits",
                "filters_add": "Add condition",
                "filters_empty": "No filters yet.",
                "filters_field": "Field or path",
                "filters_value": "Value",
                "filters_remove": "Remove",
                "filters_limit": "Limit results (optional)",
                "review_summary": "Summary",
                "review_base": "Base object",
                "review_fields": "Fields",
                "review_fields_empty": "No fields selected",
                "review_relationships": "Relationships",
                "review_filters": "Filters",
                "review_no_filters": "No filters applied",
                "review_ready": "The query preview below updates automatically. Insert it into the editor or run it directly.",
                "back_button": "Back",
                "next_button": "Next",
                "done_button": "Done",
                "run_button": "Run now",
                "insert_button": "Insert into editor",
                "refresh_button": "Re-run last query",
                "templates_empty": "No templates defined yet.",
                "tasks_empty": "No guided tasks defined yet.",
                "data_empty": "Run the query to preview the data.",
                "toast_no_query": "Configure the wizard to generate a query first.",
                "toast_run_failed": "Unable to run the query",
                "toast_run_success": "Query executed successfully",
                "toast_no_editor": "Editor not available",
                "toast_inserted": "Query inserted into the editor",
                "copy_success": "Query copied to the clipboard",
                "copy_failure": "Unable to copy the query",
                "running_query": "Running query…",
                "reset_button": "Reset wizard",
                "reset_confirm": "Reset the complex data wizard configuration?",
                "launch_button": "Launch wizard",
                "resume_button": "Resume setup",
            },
        },
    },
    "it": {
        "language_name": "Italiano",
        "app": {"title": "SF Integrator"},
        "nav": {
            "brand": "SF Integrator",
            "query": "Query",
            "complex": "Dati complessi",
            "org_config": "Configurazione org",
            "guide": "Guida",
            "settings": "Impostazioni",
        },
        "index": {
            "select_org": {
                "title": "Seleziona un'organizzazione",
                "description": "Scegli un'organizzazione configurata per eseguire query SOQL.",
                "connected_badge": "Connessa",
                "not_connected_badge": "Non connessa",
                "empty": "Nessuna organizzazione disponibile. Aggiungine una dalla pagina di configurazione.",
                "manage_button": "Gestisci organizzazioni",
            },
            "help": {
                "title": "Serve aiuto?",
                "description": "Segui la checklist di configurazione.",
                "guide_button": "Apri la guida",
            },
            "query": {
                "title": "Esploratore SOQL",
                "selected_org_label": "Organizzazione selezionata",
                "selected_org_placeholder": "Seleziona un'organizzazione",
                "soql_label": "Query SOQL",
                "soql_placeholder": "SELECT Id\nFROM Account",
                "run_button": "Esegui query",
                "helpers": {
                    "add_limit": "Aggiungi LIMIT 100",
                    "add_order_by": "Aggiungi ORDER BY CreatedDate DESC",
                },
                "saved_queries": {
                    "title": "Query salvate",
                    "name_label": "Nome",
                    "name_placeholder": "La mia query SOQL",
                    "save_button": "Salva query",
                    "update_button": "Aggiorna query",
                    "reset_button": "Pulisci",
                    "empty": "Nessuna query salvata.",
                    "load_button": "Carica",
                    "delete_button": "Elimina",
                },
                "history": {
                    "title": "Cronologia query",
                    "filter_label": "Filtra per oggetto",
                    "filter_all": "Tutti gli oggetti",
                    "empty": "Nessuna query eseguita.",
                    "object_unknown": "Oggetto sconosciuto",
                    "org_label": "Org",
                },
                "suggestions": {
                    "title": "Campi suggeriti",
                    "empty": "Nessun suggerimento disponibile.",
                    "field_exists_toast": '"{field}" è già presente nell\'elenco SELECT',
                },
                "autocomplete": {
                    "title": "Autocompletamento",
                    "objects_label": "Oggetti",
                    "objects_placeholder": "Filtra oggetti",
                    "objects_empty": "Seleziona un'organizzazione per caricare gli oggetti.",
                    "fields_label": "Campi",
                    "fields_empty": "Seleziona un oggetto per vedere i campi.",
                    "loading": "Caricamento...",
                },
            },
            "complex": {
                "tab_label": "Dati complessi",
                "title": "Creazione guidata dati complessi",
                "description": "Progetta query Salesforce multilivello con passaggi guidati, template e anteprime immediate.",
                "launch_button": "Avvia procedura",
                "resume_button": "Riprendi configurazione",
                "resume_disabled": "Genera prima una query per riattivare il pulsante Riprendi.",
                "reset_button": "Reimposta procedura",
                "reset_confirm": "Reimpostare la configurazione della procedura guidata?",
                "last_query": {
                    "title": "Ultima query generata",
                    "empty": "Esegui la procedura guidata per visualizzare qui la query SOQL generata.",
                    "helper": "Usa i pulsanti per inserire o eseguire la query nell'esploratore SOQL.",
                    "insert_button": "Inserisci nell'editor",
                },
                "templates_section": {
                    "title": "Template",
                    "description": "Parti da modelli curati che combinano dati padre e figlio.",
                },
                "tasks": {
                    "title": "Attività guidate",
                    "description": "Scegli un obiettivo per compilare automaticamente oggetti, relazioni e filtri.",
                    "items": [
                        {
                            "id": "account-connected-data",
                            "label": "Account con contatti, contratti, fatturazione e touchpoint",
                            "description": "Riunisci Account, Contatti, Contratti, Profili di fatturazione, Individual e Contact Point correlati.",
                            "preset": {
                                "base": "Account",
                                "fields": ["Id", "Name", "AccountNumber", "Type", "Industry", "BillingCity"],
                                "parentRelationships": [
                                    {
                                        "relationship": "Owner",
                                        "object": "User",
                                        "label": "Proprietario",
                                        "fields": ["Name", "Email"],
                                    },
                                    {
                                        "relationship": "Parent",
                                        "object": "Account",
                                        "label": "Account principale",
                                        "fields": ["Name"],
                                    },
                                ],
                                "childRelationships": [
                                    {
                                        "relationship": "Contacts",
                                        "object": "Contact",
                                        "label": "Contatti",
                                        "fields": ["Id", "FirstName", "LastName", "Email", "Phone"],
                                    },
                                    {
                                        "relationship": "Contracts",
                                        "object": "Contract",
                                        "label": "Contratti",
                                        "fields": ["Id", "ContractNumber", "Status", "StartDate", "EndDate"],
                                    },
                                    {
                                        "relationship": "BillingProfiles",
                                        "object": "BillingProfile",
                                        "label": "Profili di fatturazione",
                                        "fields": ["Id", "BillingProfileNumber", "Status", "AutoPayEnabled"],
                                    },
                                    {
                                        "relationship": "Individuals",
                                        "object": "Individual",
                                        "label": "Individual",
                                        "fields": ["Id", "FirstName", "LastName", "IndividualType"],
                                    },
                                    {
                                        "relationship": "ContactPoints",
                                        "object": "ContactPointTypeConsent",
                                        "label": "Contact Point",
                                        "fields": ["Id", "Name", "ContactPointType", "ConsentCapturedDate"],
                                    },
                                ],
                                "filters": [
                                    {"field": "IsActive", "operator": "=", "value": "true"},
                                ],
                                "limit": 200,
                            },
                        },
                        {
                            "id": "opportunity-growth",
                            "label": "Valuta opportunità aperte con prodotti e preventivi",
                            "description": "Analizza le Opportunità in pipeline insieme alle righe prodotto e ai relativi preventivi.",
                            "preset": {
                                "base": "Opportunity",
                                "fields": ["Id", "Name", "StageName", "Amount", "CloseDate", "ForecastCategory"],
                                "parentRelationships": [
                                    {
                                        "relationship": "Account",
                                        "object": "Account",
                                        "label": "Account",
                                        "fields": ["Name", "Industry"],
                                    },
                                    {
                                        "relationship": "Owner",
                                        "object": "User",
                                        "label": "Proprietario",
                                        "fields": ["Name", "Email"],
                                    },
                                ],
                                "childRelationships": [
                                    {
                                        "relationship": "OpportunityLineItems",
                                        "object": "OpportunityLineItem",
                                        "label": "Prodotti",
                                        "fields": ["Id", "Quantity", "UnitPrice", "TotalPrice"],
                                    },
                                    {
                                        "relationship": "Quotes",
                                        "object": "Quote",
                                        "label": "Preventivi",
                                        "fields": ["Id", "Name", "Status", "GrandTotal"],
                                    },
                                ],
                                "filters": [
                                    {"field": "IsClosed", "operator": "=", "value": "false"},
                                    {"field": "Amount", "operator": ">", "value": "10000"},
                                ],
                                "limit": 150,
                            },
                        },
                        {
                            "id": "case-handoff",
                            "label": "Prepara passaggio di consegne dei casi di assistenza",
                            "description": "Riepiloga i casi con contesto cliente, commenti e cronologia collaborativa.",
                            "preset": {
                                "base": "Case",
                                "fields": ["Id", "CaseNumber", "Subject", "Status", "Priority", "CreatedDate"],
                                "parentRelationships": [
                                    {
                                        "relationship": "Account",
                                        "object": "Account",
                                        "label": "Account",
                                        "fields": ["Name", "Industry"],
                                    },
                                    {
                                        "relationship": "Contact",
                                        "object": "Contact",
                                        "label": "Contatto",
                                        "fields": ["FirstName", "LastName", "Email"],
                                    },
                                    {
                                        "relationship": "Owner",
                                        "object": "User",
                                        "label": "Proprietario",
                                        "fields": ["Name"],
                                    },
                                ],
                                "childRelationships": [
                                    {
                                        "relationship": "CaseComments",
                                        "object": "CaseComment",
                                        "label": "Commenti caso",
                                        "fields": ["Id", "CommentBody", "CreatedDate"],
                                    },
                                    {
                                        "relationship": "Feeds",
                                        "object": "CaseFeed",
                                        "label": "Feed caso",
                                        "fields": ["Id", "Body", "CreatedDate"],
                                    },
                                ],
                                "filters": [
                                    {"field": "Status", "operator": "IN", "value": "('New','Working')"},
                                ],
                                "limit": 100,
                            },
                        },
                    ],
                },
                "templates": [
                    {
                        "id": "account-connected",
                        "label": "Mappa relazioni account",
                        "description": "Vista multilivello degli account con persone e struttura di fatturazione correlate.",
                        "preset": {
                            "base": "Account",
                            "fields": ["Id", "Name", "AccountNumber", "Type", "Industry", "BillingCity"],
                            "parentRelationships": [
                                {
                                    "relationship": "Owner",
                                    "object": "User",
                                    "label": "Proprietario",
                                    "fields": ["Name", "Email"],
                                },
                                {
                                    "relationship": "Parent",
                                    "object": "Account",
                                    "label": "Account principale",
                                    "fields": ["Name"],
                                },
                            ],
                            "childRelationships": [
                                {
                                    "relationship": "Contacts",
                                    "object": "Contact",
                                    "label": "Contatti",
                                    "fields": ["Id", "FirstName", "LastName", "Email", "Phone"],
                                },
                                {
                                    "relationship": "Contracts",
                                    "object": "Contract",
                                    "label": "Contratti",
                                    "fields": ["Id", "ContractNumber", "Status", "StartDate", "EndDate"],
                                },
                                {
                                    "relationship": "BillingProfiles",
                                    "object": "BillingProfile",
                                    "label": "Profili di fatturazione",
                                    "fields": ["Id", "BillingProfileNumber", "Status", "AutoPayEnabled"],
                                },
                                {
                                    "relationship": "Individuals",
                                    "object": "Individual",
                                    "label": "Individual",
                                    "fields": ["Id", "FirstName", "LastName", "IndividualType"],
                                },
                                {
                                    "relationship": "ContactPoints",
                                    "object": "ContactPointTypeConsent",
                                    "label": "Contact Point",
                                    "fields": ["Id", "Name", "ContactPointType", "ConsentCapturedDate"],
                                },
                            ],
                            "filters": [
                                {"field": "IsActive", "operator": "=", "value": "true"},
                            ],
                            "limit": 200,
                        },
                    },
                    {
                        "id": "opportunity-growth-plan",
                        "label": "Piano di crescita opportunità",
                        "description": "Unisci Opportunità aperte, prodotti e preventivi per preparare le revisioni di forecast.",
                        "preset": {
                            "base": "Opportunity",
                            "fields": ["Id", "Name", "StageName", "Amount", "CloseDate", "ForecastCategory"],
                            "parentRelationships": [
                                {
                                    "relationship": "Account",
                                    "object": "Account",
                                    "label": "Account",
                                    "fields": ["Name", "Industry"],
                                },
                                {
                                    "relationship": "Owner",
                                    "object": "User",
                                    "label": "Proprietario",
                                    "fields": ["Name", "Email"],
                                },
                            ],
                            "childRelationships": [
                                {
                                    "relationship": "OpportunityLineItems",
                                    "object": "OpportunityLineItem",
                                    "label": "Prodotti",
                                    "fields": ["Id", "Quantity", "UnitPrice", "TotalPrice"],
                                },
                                {
                                    "relationship": "Quotes",
                                    "object": "Quote",
                                    "label": "Preventivi",
                                    "fields": ["Id", "Name", "Status", "GrandTotal"],
                                },
                            ],
                            "filters": [
                                {"field": "IsClosed", "operator": "=", "value": "false"},
                                {"field": "Amount", "operator": ">", "value": "10000"},
                            ],
                            "limit": 150,
                        },
                    },
                    {
                        "id": "case-collaboration",
                        "label": "Dossier di collaborazione sui casi",
                        "description": "Raccogli contesto, dettagli cliente, commenti e aggiornamenti feed per le escalation.",
                        "preset": {
                            "base": "Case",
                            "fields": ["Id", "CaseNumber", "Subject", "Status", "Priority", "CreatedDate"],
                            "parentRelationships": [
                                {
                                    "relationship": "Account",
                                    "object": "Account",
                                    "label": "Account",
                                    "fields": ["Name", "Industry"],
                                },
                                {
                                    "relationship": "Contact",
                                    "object": "Contact",
                                    "label": "Contatto",
                                    "fields": ["FirstName", "LastName", "Email"],
                                },
                                {
                                    "relationship": "Owner",
                                    "object": "User",
                                    "label": "Proprietario",
                                    "fields": ["Name"],
                                },
                            ],
                            "childRelationships": [
                                {
                                    "relationship": "CaseComments",
                                    "object": "CaseComment",
                                    "label": "Commenti caso",
                                    "fields": ["Id", "CommentBody", "CreatedDate"],
                                },
                                {
                                    "relationship": "Feeds",
                                    "object": "CaseFeed",
                                    "label": "Feed caso",
                                    "fields": ["Id", "Body", "CreatedDate"],
                                },
                            ],
                            "filters": [
                                {"field": "Status", "operator": "IN", "value": "('New','Working')"},
                            ],
                            "limit": 100,
                        },
                    },
                ],
                "modal": {
                    "title": "Creazione guidata dati complessi",
                    "description": "Segui i passaggi per scegliere oggetti di base, relazioni, filtri e visualizzare i dati.",
                    "preview_label": "Anteprima query",
                    "preview_helper": "Ogni modifica aggiorna immediatamente l'anteprima della query.",
                    "data_title": "Anteprima dati",
                    "data_empty": "Esegui la query per vedere un'anteprima dei risultati.",
                    "run_button": "Esegui ora",
                    "insert_button": "Inserisci nell'editor",
                    "back_button": "Indietro",
                    "next_button": "Passaggio successivo",
                    "done_button": "Chiudi procedura",
                    "copy_button": "Copia query",
                    "close_button": "Chiudi",
                    "refresh_button": "Ripeti ultima query",
                    "steps": [
                        {"id": "intent", "label": "Obiettivo"},
                        {"id": "fields", "label": "Campi"},
                        {"id": "relationships", "label": "Relazioni"},
                        {"id": "review", "label": "Riepilogo"},
                    ],
                },
            },
        },
        "orgs": {
            "form": {
                "title": "Aggiungi o aggiorna un'organizzazione",
                "id_label": "ID organizzazione",
                "id_placeholder": "id-univoco",
                "id_help": "Usa un identificatore univoco (es. prod, sandbox1).",
                "label_label": "Nome visualizzato",
                "label_placeholder": "Org di produzione",
                "environment_label": "Ambiente",
                "environment_production": "Produzione (login.salesforce.com)",
                "environment_sandbox": "Sandbox (test.salesforce.com)",
                "environment_custom": "Dominio personalizzato",
                "environment_custom_placeholder": "https://tuo-dominio.my.salesforce.com",
                "environment_help": "Seleziona personalizzato per usare un URL My Domain.",
                "client_id_label": "Consumer Key (Client ID)",
                "client_secret_label": "Consumer Secret",
                "client_secret_help": "Lascia vuoto per mantenere il secret esistente durante la modifica.",
                "redirect_uri_label": "Redirect URI",
                "redirect_uri_placeholder": "https://tuoapp.com/oauth/callback",
                "scope_label": "Ambito OAuth",
                "scope_default": "full refresh_token",
                "save_button": "Salva organizzazione",
                "clear_button": "Pulisci modulo",
                "update_button": "Aggiorna organizzazione",
            },
            "table": {
                "title": "Organizzazioni configurate",
                "empty": "Nessuna organizzazione configurata.",
                "headers": {
                    "id": "ID",
                    "label": "Nome",
                    "environment": "Ambiente",
                    "status": "Stato",
                    "actions": "",
                },
                "connected_badge": "Connessa",
                "not_connected_badge": "Non connessa",
                "actions": {
                    "connect": "Connetti",
                    "edit": "Modifica",
                    "delete": "Elimina",
                },
            },
        },
        "guide": {
            "title": "Lista di controllo per l'integrazione OAuth Salesforce",
            "subtitle": "Segui questi passaggi per collegare l'app alla tua organizzazione Salesforce.",
            "sections": {
                "prepare": {
                    "title": "1. Prepara Salesforce",
                    "steps": [
                        "Accedi all'organizzazione Salesforce che vuoi integrare.",
                        "Vai su <strong>Setup &gt; Apps &gt; App Manager</strong> e fai clic su <strong>New Connected App</strong> (Lightning Experience) invece di <em>New Lightning App</em> o <em>New External Client App</em>.",
                        "Compila la sezione delle informazioni di base: inserisci un <strong>Connected App Name</strong> descrittivo, lascia che Salesforce generi automaticamente l'<strong>API Name</strong> e indica un <strong>Contact Email</strong>; i campi opzionali possono rimanere vuoti salvo necessità specifiche.",
                        "Abilita <strong>OAuth Settings for API Integration</strong> per mostrare le opzioni di integrazione.",
                        "Nelle impostazioni OAuth lascia selezionato <strong>Require Secret for Web Server Flow</strong>, mantieni vuota la lista <strong>Selected OAuth Scopes</strong> per ora e ignora i campi facoltativi come <em>Start URL</em> o <em>Callback URL for Lightning Apps</em>.",
                        "Imposta la <strong>Callback URL</strong> principale su <code>http://localhost:5000/oauth/callback</code> per lo sviluppo locale; in produzione sostituisci <code>localhost:5000</code> con il tuo host mantenendo il percorso <code>/oauth/callback</code>.",
                        "Aggiungi i seguenti ambiti OAuth alla lista <strong>Selected OAuth Scopes</strong>: <code>Full access (full)</code> e <code>Perform requests on your behalf at any time (refresh_token, offline_access)</code>. Altri ambiti possono restare non selezionati salvo necessità.",
                        "Salva la connected app e copia il <strong>Consumer Key</strong> e il <strong>Consumer Secret</strong>.",
                        "In <strong>Manage &gt; OAuth Policies</strong> assicurati che la policy sui refresh token ne consenta l'utilizzo.",
                    ],
                },
                "configure": {
                    "title": "2. Configura l'integratore",
                    "steps": [
                        "Apri la pagina <a href=\"{org_config_url}\">Configurazione org</a>.",
                        "Compila il modulo con:",
                        "Fai clic su <strong>Salva organizzazione</strong>.",
                        "Usa il pulsante <strong>Connetti</strong> nella tabella per avviare l'autorizzazione OAuth.",
                        "Quando richiesto, concedi l'accesso in Salesforce; verrai reindirizzato all'app.",
                    ],
                    "form_details": [
                        "<strong>ID organizzazione</strong>: un identificatore interno come <code>prod</code> o <code>dev</code>.",
                        "<strong>Nome visualizzato</strong>: il nome mostrato nell'interfaccia.",
                        "<strong>Ambiente</strong>: scegli Produzione, Sandbox o inserisci il tuo URL My Domain personalizzato.",
                        "<strong>Consumer Key</strong> e <strong>Consumer Secret</strong> della connected app.",
                        "<strong>Redirect URI</strong>: deve corrispondere alla callback configurata in Salesforce.",
                        "<strong>Ambito OAuth</strong>: il valore predefinito è <code>full refresh_token</code>; modificalo se necessario.",
                    ],
                },
                "query": {
                    "title": "3. Esegui query SOQL",
                    "steps": [
                        "Torna alla pagina <a href=\"{query_url}\">Query</a>.",
                        "Seleziona l'organizzazione appena autorizzata e incolla una query SOQL, ad esempio <code>SELECT Id, Name FROM Account LIMIT 10</code>.",
                        "Fai clic su <strong>Esegui query</strong> per lanciare l'operazione. I risultati compariranno nella tabella sotto il modulo.",
                    ],
                },
            },
            "tip": {
                "title": "Suggerimento:",
                "content": "Per lo sviluppo locale imposta la callback su <code>http://localhost:5000/oauth/callback</code> e aggiungila all'elenco di callback consentite della connected app. In produzione aggiorna il nome host in base all'ambiente mantenendo il percorso <code>/oauth/callback</code> per completare correttamente il reindirizzamento.",
            },
        },
        "settings": {
            "title": "Impostazioni",
            "language_label": "Lingua",
            "theme_label": "Tema",
            "save_button": "Salva impostazioni",
            "saved": "Impostazioni aggiornate correttamente.",
            "themes": {
                "classic": "Classico",
                "modern": "Moderno",
                "dark": "Scuro",
                "sci-fi": "Fantascienza",
            },
        },
        "frontend": {
            "toast": {
                "select_org": "Seleziona un'organizzazione prima di eseguire una query",
                "enter_query": "Inserisci una query SOQL",
                "query_failed": "Query non riuscita",
                "org_created": "Organizzazione creata",
                "org_updated": "Organizzazione aggiornata",
                "org_deleted": "Organizzazione eliminata",
                "delete_failed": "Impossibile eliminare l'organizzazione",
                "fill_required": "Compila tutti i campi obbligatori",
                "enter_secret": "Inserisci il consumer secret per le nuove organizzazioni",
                "save_failed": "Impossibile salvare l'organizzazione",
                "saved_queries_load_failed": "Impossibile caricare le query salvate",
                "saved_query_save_failed": "Impossibile salvare la query",
                "saved_query_delete_failed": "Impossibile eliminare la query salvata",
                "saved_query_saved": "Query salvata",
                "saved_query_deleted": "Query salvata eliminata",
                "saved_query_loaded": "Query salvata caricata",
                "enter_saved_query_name": "Inserisci un nome per la query salvata",
                "metadata_fetch_failed": "Impossibile caricare gli oggetti Salesforce",
                "fields_fetch_failed": "Impossibile caricare i campi Salesforce",
                "clause_exists": '"{clause}" è già presente nella query',
                "field_already_selected": '"{field}" è già presente nell\'elenco SELECT',
                "query_history_load_failed": "Impossibile caricare la cronologia delle query",
                "no_results_available": "Esegui prima una query per usare questa azione",
                "results_copy_csv_success": "Risultati copiati in formato CSV",
                "results_copy_excel_success": "Risultati copiati in formato Excel",
                "results_copy_failed": "Impossibile copiare i risultati",
                "results_export_ready_csv": "Download CSV avviato",
                "results_export_ready_excel": "Download Excel avviato",
                "results_export_failed": "Impossibile esportare i risultati",
                "query_without_limit_where": "Aggiungi una clausola WHERE o LIMIT prima di eseguire la query.",
            },
            "query": {
                "no_records": "Nessun record restituito.",
                "results": {
                    "copy_csv": "Copia come CSV",
                    "copy_excel": "Copia come Excel",
                    "export_csv": "Esporta CSV",
                    "export_excel": "Esporta Excel",
                },
            },
            "form": {"update_button": "Aggiorna organizzazione", "save_button": "Salva organizzazione"},
            "confirm": {
                "delete_org": "Eliminare l'organizzazione {orgId}?",
                "query_without_limit_where": "Sei sicuro di voler eseguire una query senza LIMIT né WHERE?",
            },
            "saved_queries": {"load": "Carica", "delete": "Elimina"},
            "autocomplete": {"insert": "Inserisci"},
            "history": {
                "filter_all": "Tutti gli oggetti",
                "object_unknown": "Oggetto sconosciuto",
                "org_label": "Org",
            },
            "complex": {
                "step_label": "Passo",
                "step_intent": "Obiettivo",
                "step_fields": "Campi",
                "step_relationships": "Relazioni",
                "step_review": "Riepilogo",
                "intent_base_label": "Oggetto di base",
                "intent_base_placeholder": "Inizia a digitare un oggetto",
                "intent_hint": "Scegli l'oggetto principale da analizzare.",
                "intent_template_label": "Template",
                "intent_template_placeholder": "Seleziona un template",
                "intent_template_hint": "I template precompilano relazioni e filtri. Puoi modificarli in ogni passaggio.",
                "intent_task_label": "Attività guidata",
                "intent_task_placeholder": "Seleziona un'attività",
                "intent_missing_base": "Seleziona prima un oggetto di base per continuare.",
                "loading_metadata": "Caricamento metadati Salesforce…",
                "fields_title": "Campi {object}",
                "fields_selected": "{count} campi selezionati",
                "fields_search_placeholder": "Filtra campi",
                "fields_none_available": "Nessun campo disponibile.",
                "relationships_parents": "Relazioni padre",
                "relationships_no_parents": "Nessuna relazione padre disponibile.",
                "relationships_parent_details": "Lookup verso {object}",
                "relationships_add": "Aggiungi",
                "relationships_remove": "Rimuovi",
                "relationships_children": "Relazioni figlio",
                "relationships_no_children": "Nessuna relazione figlio disponibile.",
                "relationships_child_details": "Oggetto figlio {object}",
                "relationships_selected_empty": "Nessuna relazione selezionata.",
                "relationships_selected_title": "{relationship} • {object}",
                "relationships_selected_help": "Seleziona i campi da includere per questa relazione.",
                "filters_title": "Filtri e limiti",
                "filters_add": "Aggiungi condizione",
                "filters_empty": "Nessun filtro impostato.",
                "filters_field": "Campo o percorso",
                "filters_value": "Valore",
                "filters_remove": "Rimuovi",
                "filters_limit": "Limita risultati (opzionale)",
                "review_summary": "Riepilogo",
                "review_base": "Oggetto di base",
                "review_fields": "Campi",
                "review_fields_empty": "Nessun campo selezionato",
                "review_relationships": "Relazioni",
                "review_filters": "Filtri",
                "review_no_filters": "Nessun filtro applicato",
                "review_ready": "L'anteprima della query qui sotto si aggiorna automaticamente. Inseriscila nell'editor o eseguila direttamente.",
                "back_button": "Indietro",
                "next_button": "Avanti",
                "done_button": "Fine",
                "run_button": "Esegui ora",
                "insert_button": "Inserisci nell'editor",
                "refresh_button": "Ripeti ultima query",
                "templates_empty": "Nessun template disponibile.",
                "tasks_empty": "Nessuna attività guidata disponibile.",
                "data_empty": "Esegui la query per visualizzare i dati.",
                "toast_no_query": "Configura la procedura guidata per generare una query.",
                "toast_run_failed": "Impossibile eseguire la query",
                "toast_run_success": "Query eseguita con successo",
                "toast_no_editor": "Editor non disponibile",
                "toast_inserted": "Query inserita nell'editor",
                "copy_success": "Query copiata negli appunti",
                "copy_failure": "Impossibile copiare la query",
                "running_query": "Esecuzione query…",
                "reset_button": "Reimposta procedura",
                "reset_confirm": "Reimpostare la configurazione della procedura guidata?",
                "launch_button": "Avvia procedura",
                "resume_button": "Riprendi configurazione",
            },
        },
    },
}


def get_language_codes() -> list[str]:
    return list(_LANGUAGE_PACKS.keys())


def get_language_name(code: str) -> str:
    return _LANGUAGE_PACKS.get(code, {}).get("language_name", code)


def get_language_pack(code: str) -> Dict[str, Any]:
    return deepcopy(_LANGUAGE_PACKS.get(code, _LANGUAGE_PACKS[DEFAULT_LANGUAGE]))


def translate(key: str, language: str | None = None) -> str:
    for code in filter(None, [language, DEFAULT_LANGUAGE]):
        pack = _LANGUAGE_PACKS.get(code)
        if not pack:
            continue
        value: Any = pack
        found = True
        for part in key.split('.'):
            if isinstance(value, dict) and part in value:
                value = value[part]
            else:
                found = False
                break
        if found and isinstance(value, str):
            return value
    return key


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    for key, value in override.items():
        if (
            key in base
            and isinstance(base[key], dict)
            and isinstance(value, dict)
        ):
            base[key] = _deep_merge(base[key], value)
        else:
            base[key] = deepcopy(value)
    return base


def get_frontend_translations(language: str) -> Dict[str, Any]:
    base = deepcopy(_LANGUAGE_PACKS[DEFAULT_LANGUAGE].get("frontend", {}))
    if language == DEFAULT_LANGUAGE:
        return base
    language_pack = _LANGUAGE_PACKS.get(language, {})
    frontend = language_pack.get("frontend", {})
    return _deep_merge(base, frontend)

