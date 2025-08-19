# Bulk mail center design specification

## Project overview

The Bulk mail center is a web application for sending bulk emails using the Mailgun API. It allows users to upload a contact list (CSV), design email templates with Handlebars, preview emails, and send emails with progress tracking. The application uses vanilla JavaScript (ESM), HTML, and CSS, with all data stored in the browser using IndexedDB.

### Objectives

- Provide a simple, browser-based tool for bulk email campaigns.
- Support large contact lists with flexible column structures.
- Enable dynamic email templating and previews.
- Ensure reliable email sending with progress tracking and error handling.
- Maintain a developer-friendly codebase with ESM and esbuild bundling.

## Technology stack

- **Frontend**: Vanilla JavaScript (ESM), HTML, CSS
- **Templating**: Handlebars.js
- **CSV parsing**: PapaParse
- **Storage**: IndexedDB (via `idb` library)
- **Email API**: Mailgun API
- **Build tool**: esbuild (with live reloading for development)
- Dependencies:
  - `papaparse`: For CSV parsing
  - `handlebars`: For email templating
  - `idb`: For IndexedDB operations
  - `esbuild`: For bundling
  - `serve`: For development server
  - `chokidar`: For live reloading

## Project structure

```
project/
├── src/
│   ├── index.html            # Main HTML file with tab-based UI
│   ├── js/
│   │   ├── app.js          # Wires UI events to model actions
│   │   ├── models/
│   │   │   ├── contacts.js # Manages contact list (CSV, storage)
│   │   │   ├── templates.js # Manages email templates
│   │   │   ├── sending.js  # Manages email sending (Mailgun API)
│   │   ├── utils.js        # Shared utilities (e.g., error handling)
│   ├── assets/
│   │   ├── handlebars.runtime.js # Precompiled Handlebars runtime
├── dist/                    # Production build (bundled files)
├── esbuild.config.js        # Build configuration
├── package.json             # Project metadata and scripts
└── README.md                # Setup and usage instructions
```

## Features

### Contact list management

- **Description**: Users upload a CSV contact list with arbitrary columns. The system adds `sent_at` (null) and `status` (null) columns if not present.
- Functionality:
  - Upload CSV via file input (max 100MB).
  - Parse CSV using PapaParse with streaming for large files.
  - Validate for required `email` column; display errors for invalid CSVs.
  - Store contacts in IndexedDB.
  - Display contacts in a paginated table (50 rows per page) with a "1 of 2000" indicator and forward/backward buttons.
  - Filter contacts via a freeform text box; show first 20 matching rows (any column contains text, case-insensitive).
  - Display "Only first 20 matching rows shown" if more than 20 match.
  - Each row includes a button to jump to the Preview tab for that contact.
  - Download updated CSV with `sent_at` and `status`.
  - Use `window.confirm` before clearing contacts.
- **Model**: `contacts.js`
- **UI**: Contacts tab with file upload, text box and clear button for filtering, paginated table, and download button.

### Email template management

- **Description**: Users create/edit a single active email template using Handlebars, with fields `sender_name`, `sender_email`, `subject`, `recipient_name`, `recipient_email`, `body`.
- Functionality:
  - Upload JSON template or edit via textarea.
  - Map contact columns to template fields (e.g., `{{recipient_name}}` to `name` column) via a form.
  - Store template in IndexedDB.
  - Download template as JSON.
  - Only one active template; users manage multiple templates by saving/loading JSON files.
- **Model**: `templates.js`
- **UI**: Templates tab with textarea, column mapping form, and upload/download buttons.

### Email preview

- **Description**: Users preview an email for a specific contact using the active template.
- Functionality:
  - Select a contact via a Preview button in the Contacts tab’s table.
  - Render the template with contact data using Handlebars.
  - Display the preview (sender_name, sender_email, subject, recipient_name, recipient_email, body).
  - No editing in the preview; only the template can be edited (via Templates tab).
- **Model**: `templates.js`
- **UI**: Preview tab with rendered email.

### Email sending

- **Description**: Send emails to all contacts using the Mailgun API.
- Functionality:
  - Configure Mailgun API key, domain, and batch size via UI form (stored in IndexedDB).
  - Send emails in batches (default: 100 emails per batch).
  - Update `sent_at` and `status` for each contact.
  - Display progress bar and ETA (based on batch timing).
  - Handle API errors with retries (max 3 attempts).
  - Allow downloading updated contact list during/after sending.
  - Use `window.confirm` before sending.
- **Model**: `sending.js`
- **UI**: Sending tab with API key/domain/batch size form, send button, progress bar, ETA, and download button.

## UI design

- **Structure**: Single `index.html` with four tabs (Contacts, Templates, Preview, Sending) toggled via JavaScript.
- **Navigation**: Tab buttons at the top, with active tab highlighted via CSS.
- Components:
  - **Contacts**: File upload input, text box with clear button for filtering, paginated table (dynamic columns, Preview button per row, "1 of 2000" indicator), download button.
  - **Templates**: Textarea for Handlebars code, form for column mapping, upload/download buttons.
  - **Preview**: Div for rendered email (sender_name, sender_email, subject, recipient_name, recipient_email, body).
  - **Sending**: Form for API key, domain, and batch size, send button, progress bar, ETA text, download button.
- **CSS**: Use CSS Grid for layout, Flexbox for tabs, and minimal styles for responsiveness (mobile-friendly).

## Data models

### ContactsModel (contacts.js)

- **Purpose**: Manages contact list storage, CSV/JSON parsing, filtering, and export.

- **Storage**: IndexedDB (`contacts` store), every column is indexed

- API:

  - ```
    loadCSV(file: File): Promise<void>
    ```

    - Parses CSV using PapaParse (streaming mode, max 100MB).
    - Validates `email` column; throws error if missing.
    - Adds `sent_at` (null) and `status` (null) if not present.
    - Stores contacts in IndexedDB.

  - ```
    getPage(page: number, limit: number): Promise<{ contacts: Object[], total: number }>
    ```

    - Retrieves a page of contacts for display (e.g., 50 rows).
    - Returns contacts and total count for pagination.

  - ```
    filter(beginsWith: string): Promise<{ contacts: Object[], hasMore: boolean }>
    ```

    - Filters contacts where any column contains begins with  `beginsWith` (case-insensitive).
    - Returns first 20 matching contacts and `hasMore` (true if more than 20 match).
    - Uses IndexedDB indexes for fast lookup

  - ```
    updateContact(id: string, updates: { sent_at?: string|null, status?: string|null }): Promise<void>
    ```

    - Updates a contact’s `sent_at` or `status` after sending.

  - ```
    exportCSV(): Promise<Blob>
    ```

    - Generates a CSV file with all contacts, including `sent_at` and `status`.

  - ```
    clear(): Promise<void>
    ```

    - Clears all contacts from IndexedDB after `window.confirm`.

  - ```
    getColumns(): Promise<string[]>
    ```

    - Retrieves available contact columns (from first contact’s keys).

### TemplatesModel (templates.js)

- **Purpose**: Manages a single active email template, rendering, and preview.

- **Storage**: IndexedDB (`templates` store)

- API:

  - ```
    loadJSON(file: File): Promise<void>
    ```

    - Parses JSON template (`{ sender_name, sender_email, subject, recipient_name, recipient_email, body }`).
    - Stores template in IndexedDB as the active template.

  - ```
    set(template: { sender_name: string, sender_email: string, subject: string, recipient_name: string, recipient_email: string, body: string }): Promise<void>
    ```

    - Saves template from textarea input as the active template.

  - ```
    get(): Promise<{ sender_name: string, sender_email: string, subject: string, recipient_name: string, recipient_email: string, body: string }>
    ```

    - Retrieves the active template.

  - ```
    renderPreview(contact: Object): Promise<{ sender_name: string, sender_email: string, subject: string, recipient_name: string, recipient_email: string, body: string }>
    ```

    - Renders the template with contact data using Handlebars.

  - ```
    exportJSON(): Promise<Blob>
    ```

    - Generates a JSON file with the active template.

### SendingModel (sending.js)

- **Purpose**: Manages Mailgun API configuration and email sending.

- **Storage**: IndexedDB (`config` store)

- API:

  - ```
    set(config: { apiKey: string, domain: string, batchSize: number }): Promise<void>
    ```

    - Saves Mailgun API key, domain, and batch size to IndexedDB.

  - ```
    get(): Promise<{ apiKey: string, domain: string, batchSize: number }>
    ```

    - Retrieves configuration.

  - ```
    sendBatch(contacts: Object[], template: { sender_name: string, sender_email: string, subject: string, recipient_name: string, recipient_email: string, body: string }): Promise<{ sent_at: string|null, status: string|null }[]>
    ```

    - Sends emails for a batch of contacts via Mailgun API.
    - Updates `sent_at` and `status` via `ContactsModel.updateContact()`.
    - Retries failed sends (max 3 attempts).
    - Returns an array of `{ sent_at, status }` objects, same size as input `contacts`.

  - ```
    loadJSON(file: File): Promise<void>
    ```

    - Parses JSON configuration (`{ apiKey, domain, batchSize }`).
    - Stores configuration in IndexedDB.

  - ```
    exportJSON(): Promise<Blob>
    ```

    - Generates a JSON file with configuration (apiKey, domain, batchSize).

## App.js role

- **Responsibility**: Controller that wires UI events (button clicks, form submissions) to model methods and updates HTML based on model data.
- Tasks:
  - Initialize models on page load (open IndexedDB connection).
  - Handle tab switching (show/hide sections).
  - Bind UI events (e.g., CSV upload → `ContactsModel.loadCSV()`, Preview button → `TemplatesModel.renderPreview()`).
  - Update DOM with model data (e.g., render contact table, show preview).

## Build and development

- **Esbuild**: Bundle JavaScript (ESM), CSS, and copy HTML to `dist/`.

- **Live reloading**: Use esbuild’s watch mode with `chokidar` for automatic browser refresh on file changes.

- Scripts:

  - `yarn start`: Run development server (`serve src`) with live reloading.
  - `yarn build`: Generate production build (minified JS/CSS, updated HTML).

- package.json:

  ```json
  {
    "packageManager": "yarn@4.9.2",
    "scripts": {
      "build": "node esbuild.config.js",
      "start": "node esbuild.config.js --watch"
    },
    "type": "module",
    "devDependencies": {
      "esbuild": "^0.25.5",
      "serve": "^14.2.4",
      "chokidar": "^3.6.0",
      "papaparse": "^5.4.1",
      "handlebars": "^4.7.8",
      "idb": "^8.0.0"
    }
  }
  ```

## Next steps

- Implement initial `index.html` with tab-based UI and pagination controls.
- Create model stubs (`contacts.js`, `templates.js`, `sending.js`) with defined APIs.
- Design CSS for responsive tabs, forms, and paginated table.
- Finalize error-handling strategy for CSV/JSON parsing and API requests.
