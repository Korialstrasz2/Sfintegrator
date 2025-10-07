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
                "composer": {
                    "button": "Compose query",
                    "title": "Compose a query",
                    "close": "Close",
                    "query_type": "Query type",
                    "query_types": {
                        "basic": "Basic",
                        "aggregate": "Aggregate",
                        "relationship": "Relationships",
                        "typeof": "TYPEOF",
                    },
                    "distinct": "SELECT DISTINCT",
                    "object": "Base object",
                    "object_placeholder": "Start typing an object name",
                    "object_help": "Use the metadata autocomplete to quickly find standard and custom objects.",
                    "using_scope": {
                        "label": "USING SCOPE",
                        "none": "Default scope",
                        "mine": "Mine",
                        "team": "Team",
                        "mine_and_team": "MineAndMyTeam",
                        "everything": "Everything",
                    },
                    "fields": {
                        "title": "Select fields",
                        "label": "Fields",
                        "placeholder": "Search or type a field",
                        "add": "Add field",
                        "empty": "No fields selected yet.",
                        "remove": "Remove \"{field}\" from SELECT",
                    },
                    "security_enforced": "WITH SECURITY_ENFORCED",
                    "aggregate": {
                        "function": "Aggregate function",
                        "field": "Field",
                        "field_placeholder": "Field for aggregation",
                        "alias": "Alias (optional)",
                        "add": "Add aggregate",
                        "help": "Use aggregate helpers to quickly add COUNT(), SUM(), and other expressions.",
                        "count": "COUNT",
                        "sum": "SUM",
                        "avg": "AVG",
                        "min": "MIN",
                        "max": "MAX",
                    },
                    "conditions": {
                        "title": "WHERE conditions",
                        "add": "Add condition",
                        "empty": "No conditions defined.",
                        "field_placeholder": "Field",
                        "value_placeholder": "Value or expression",
                        "operator_label": "Operator",
                        "logical_label": "Logical operator",
                        "remove": "Remove condition",
                    },
                    "group_by": {
                        "title": "GROUP BY",
                        "add": "Add field",
                        "placeholder": "Field to group by",
                        "apply": "Add",
                        "empty": "No GROUP BY fields yet.",
                        "remove": "Remove \"{field}\" from GROUP BY",
                    },
                    "having": {
                        "title": "HAVING",
                        "add": "Add HAVING clause",
                        "empty": "No HAVING clauses yet.",
                        "field_placeholder": "Aggregate field",
                        "value_placeholder": "Value or expression",
                        "remove": "Remove HAVING clause",
                    },
                    "order_by": {
                        "title": "ORDER BY",
                        "add": "Add sort",
                        "empty": "No ordering configured.",
                        "field_placeholder": "Field or alias",
                        "direction_label": "Direction",
                        "nulls_label": "NULLS handling",
                        "direction": {
                            "asc": "Ascending",
                            "desc": "Descending",
                        },
                        "nulls": {
                            "default": "Default",
                            "first": "NULLS FIRST",
                            "last": "NULLS LAST",
                        },
                        "remove": "Remove sort",
                    },
                    "child_queries": {
                        "title": "Inner (parent-to-child) queries",
                        "add": "Add subquery",
                        "help": "Use relationship names such as Opportunities to include related records.",
                        "empty": "No inner queries yet.",
                        "child_label": "Subquery #{index}",
                        "relationship_label": "Relationship name",
                        "relationship_placeholder": "Opportunities, Contacts, ...",
                        "fields_label": "Fields",
                        "field_placeholder": "Field for the subquery",
                        "add_field": "Add",
                        "empty_fields": "No fields selected for this subquery.",
                        "where_label": "WHERE clause",
                        "order_label": "ORDER BY clause",
                        "limit_label": "Limit",
                        "offset_label": "Offset",
                        "remove": "Remove subquery",
                        "remove_field": "Remove \"{field}\" from inner query",
                    },
                    "limit": "Limit",
                    "offset": "Offset",
                    "for_clause": {
                        "label": "FOR clause",
                        "none": "None",
                        "view": "FOR VIEW",
                        "update": "FOR UPDATE",
                    },
                    "options_help": "Advanced options such as LIMIT, OFFSET, USING SCOPE, and FOR clauses help refine your results.",
                    "templates": {
                        "title": "Templates",
                        "description": "Start from a curated SOQL pattern and adjust it to your needs.",
                        "empty": "No templates available.",
                        "items": {
                            "recent_records": {
                                "label": "Recent records (last 30 days)",
                                "description": "SELECT Id, Name, CreatedDate with a recent filter and LIMIT 50.",
                            },
                            "top_opportunities": {
                                "label": "Top opportunities by amount",
                                "description": "Aggregate SUM(Amount) and COUNT(Id) grouped by StageName.",
                            },
                            "child_opportunities": {
                                "label": "Accounts with closed-won opportunities",
                                "description": "Parent-to-child subquery for closed-won Opportunities with limits.",
                            },
                            "typeof_events": {
                                "label": "TYPEOF Event WhatId example",
                                "description": "Use TYPEOF to display fields based on polymorphic WhatId types.",
                            },
                        },
                    },
                    "capabilities": {
                        "title": "SOQL & SOSL capabilities",
                        "query_type": "Query type",
                        "soql": "SOQL",
                        "sosl": "SOSL",
                        "notes": "Notes",
                        "basic": "Basic SELECT / WHERE / ORDER BY",
                        "inner": "Inner (Parent-to-Child) queries",
                        "parent": "Child-to-Parent traversal",
                        "semi": "Semi-join (IN subquery)",
                        "anti": "Anti-join (NOT IN subquery)",
                        "aggregate": "Aggregate + GROUP BY + HAVING",
                        "typeof": "TYPEOF expression",
                        "polymorphic": "Polymorphic relationships",
                        "cross_object": "Cross-object filtering",
                        "dynamic": "Dynamic SOQL (Apex)",
                        "relationship_depth": "Relationship traversal depth",
                        "count": "COUNT / Aggregate functions",
                        "sosl_multi": "SOSL multi-object search",
                        "basic_notes": "Core SELECT, WHERE, and ORDER BY support.",
                        "inner_notes": "Build parent-to-child subqueries for related records.",
                        "parent_notes": "Use dot notation to traverse up to five parent levels.",
                        "semi_notes": "Add IN subqueries from the conditions builder.",
                        "anti_notes": "Use NOT IN filters to create anti-joins.",
                        "aggregate_notes": "Add GROUP BY, HAVING, and aggregate functions like SUM and COUNT.",
                        "typeof_notes": "TYPEOF available for API versions 30+ in the SELECT clause.",
                        "polymorphic_notes": "Works with polymorphic fields such as WhoId and WhatId.",
                        "cross_object_notes": "Combine cross-object filters through relationships and subqueries.",
                        "dynamic_notes": "Use the preview output as a template for Database.query(...) dynamic SOQL.",
                        "relationship_depth_notes": "Traverse up to five parent levels in a single query.",
                        "count_notes": "COUNT() and other aggregates work with or without GROUP BY.",
                        "sosl_multi_notes": "SOSL supports multi-object text search but no JOIN or GROUP BY.",
                    },
                    "preview": {
                        "title": "Preview",
                        "copy": "Copy preview",
                        "hint": "The preview updates automatically as you edit the builder.",
                        "ready": "Query ready to insert.",
                        "empty": "Fill in the builder to preview your SOQL.",
                    },
                    "reset": "Reset builder",
                    "insert": "Insert into editor",
                    "actions": {
                        "remove_item": "Remove item",
                    },
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
                "composer_field_exists": '"{field}" is already selected.',
                "composer_field_required": "Choose a field to aggregate.",
                "composer_group_exists": '"{field}" is already part of the GROUP BY clause.',
                "composer_child_field_exists": '"{field}" is already included in this subquery.',
                "composer_template_applied": "Template applied to the builder.",
                "composer_missing_object": "Select an object to build a query.",
                "composer_no_fields": "Add at least one field or subquery to the SELECT clause.",
                "composer_copy_failed": "Unable to copy the preview.",
                "composer_copied": "Preview copied to the clipboard.",
                "composer_inserted": "Query inserted into the editor.",
                "composer_no_preview": "Build a query first to copy it.",
                "composer_reset": "Query composer reset.",
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
        },
    },
    "it": {
        "language_name": "Italiano",
        "app": {"title": "SF Integrator"},
        "nav": {
            "brand": "SF Integrator",
            "query": "Query",
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

