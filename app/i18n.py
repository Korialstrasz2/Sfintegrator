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
                "soql_placeholder": "SELECT Id, Name FROM Account",
                "run_button": "Run query",
                "helpers": {
                    "add_limit": "Add LIMIT 100",
                    "add_order_by": "Add ORDER BY Created DESC",
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
            "language_submit": "Save settings",
            "language_saved": "Language updated successfully.",
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
            },
            "query": {"no_records": "No records returned."},
            "form": {"update_button": "Update org", "save_button": "Save org"},
            "confirm": {"delete_org": "Delete org {orgId}?"},
            "saved_queries": {"load": "Load", "delete": "Delete"},
            "autocomplete": {"insert": "Insert"},
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
                "soql_placeholder": "SELECT Id, Name FROM Account",
                "run_button": "Esegui query",
                "helpers": {
                    "add_limit": "Aggiungi LIMIT 100",
                    "add_order_by": "Aggiungi ORDER BY Created DESC",
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
            "language_submit": "Salva impostazioni",
            "language_saved": "Lingua aggiornata correttamente.",
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
            },
            "query": {"no_records": "Nessun record restituito."},
            "form": {"update_button": "Aggiorna organizzazione", "save_button": "Salva organizzazione"},
            "confirm": {"delete_org": "Eliminare l'organizzazione {orgId}?"},
            "saved_queries": {"load": "Carica", "delete": "Elimina"},
            "autocomplete": {"insert": "Inserisci"},
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

