# Design specification

## Project overview

This is a web application for sending bulk emails using the Mailgun API. It enables visitors to upload contact lists in CSV format, design email templates with Handlebars, preview emails, and send emails with progress tracking. All data is stored locally in the browser using IndexedDB via the `idb-keyval` library. The application uses vanilla JavaScript (ESM), HTML, and Bootstrap CSS for a responsive UI.

### Objectives

- Provide a browser-based tool for managing and sending bulk email campaigns.
- Support dynamic contact lists with arbitrary columns.
- Enable flexible email templating with Handlebars and real-time previews.
- Ensure reliable email sending with progress tracking and error handling.
- Maintain a clean, modular codebase using ESM.

## Technology stack

- **Frontend**: Vanilla JavaScript (ESM), HTML, Bootstrap CSS
- **Templating**: Handlebars.js (`handlebars@4.7.8`)
- **CSV parsing**: PapaParse (`papaparse@5.4.1`)
- **Storage**: IndexedDB (via `idb-keyval@6.2.1`)
- **Email API**: Mailgun API
- **Dependencies**:
  - `papaparse`: For parsing CSV contact lists.
  - `handlebars`: For templating emails.
  - `idb-keyval`: For simplified IndexedDB operations.

## Project Structure

```
project/
├── src/
│   ├── index.html          # Main HTML with card-based UI for contacts, templates, and sending
│   ├── js/
│   │   ├── app.js          # Wires UI events to model actions and updates DOM
│   │   ├── models/
│   │   │   ├── contacts.js # Manages contact list (CSV parsing, storage)
│   │   │   ├── templates.js# Manages email template (Handlebars, storage)
│   │   │   ├── sending.js  # Manages Mailgun API configuration and email sending
│   │   ├── utils.js        # Shared utilities (error alerts, blob downloads)
├── dist/                   # Production build (bundled files, not included in source)
├── package.json            # Project metadata and scripts
```

## Features

### Contact list management

- **Description**: Visitors upload a CSV contact list with arbitrary columns. The system adds `sent_at` (null) and `status` (null) columns if not present.
- **Functionality**:
  - Upload CSV via file input (max 100MB).
  - Parse CSV using PapaParse with streaming for large files.
  - Store contacts in IndexedDB with auto-incrementing IDs (`contact:${id}`).
  - Display total contacts count (e.g., "100 contacts loaded") on the main page.
  - Clear contacts with confirmation via `window.confirm`.
  - Export contacts as CSV, including `sent_at` and `status` columns.
  - Retrieve column names from the first contact for use in template mapping.
- **Model**: `contacts.js`
- **UI**: Contacts card on the main page with file upload input, clear button, and status text.

### Email template management

- **Description**: Visitors create/edit a single active email template with Handlebars, consisting of fields: `sender_name`, `sender_email`, `subject`, `recipient_name`, `recipient_email`, `body`.
- **Functionality**:
  - Upload JSON template or edit via input fields and textarea.
  - Validate template fields as non-empty and valid Handlebars expressions (red/green styling).
  - Support column mapping via dropdowns with options: "Handlebars" or "Column: [column_name]" (e.g., "Column: email").
  - Insert Handlebars variables (e.g., `{{email}}`) via buttons that appear above focused input/textarea.
  - Store template in IndexedDB.
  - Export template as JSON.
  - Clear template with confirmation via `window.confirm`.
  - Display template status on the main page ("Template not started", "Template started but not complete", "Template ready to send").
- **Model**: `templates.js`
- **UI**: Template card on the main page with load, edit, save, and clear buttons; template view with input fields, textarea, column buttons, and mode dropdowns.

### Email preview

- **Description**: Visitors preview the active template rendered with a selected contact’s data.
- **Functionality**:
  - Select a contact via navigation buttons (previous, next, random) in the template view.
  - Render template fields (`sender_name`, `sender_email`, `subject`, `recipient_name`, `recipient_email`, `body`) using Handlebars.
  - Display preview with sender, recipient, subject, and HTML body.
  - Show "Invalid template for preview" if rendering fails.
  - Disable navigation if no contacts are loaded.
- **Model**: `templates.js`
- **UI**: Preview section in the template view with navigation buttons and rendered email content.

### Email sending

- **Description**: Send emails to all contacts using the Mailgun API.
- **Functionality**:
  - Configure Mailgun API key and domain via form inputs (stored in IndexedDB).
  - Validate API key and domain as non-empty (red/green styling).
  - Send emails in batches (default: min of 100 or 10% of total contacts).
  - Update `sent_at` (ISO timestamp) and `status` ("sent" or "failed: [error]") for each contact.
  - Retry failed sends (max 3 attempts).
  - Display progress bar and ETA (based on elapsed time and remaining contacts).
  - Allow pausing/resuming and stopping the sending process.
  - Export updated contact list as CSV during/after sending.
  - Require confirmation via `window.confirm` before sending.
- **Model**: `sending.js`
- **UI**: Sending card on the main page with API key/domain inputs, send/pause/stop buttons, progress bar, ETA text, and download button.

## UI design

- **Structure**: Single `index.html` with two views toggled via JavaScript:
  - Main view: Three cards (Contacts, Template, Sending).
  - Template view: Form for editing template fields, column buttons, mode dropdowns, and preview section.
- **Navigation**: Breadcrumb links to switch between main and template views.
- **Components**:
  - **Contacts card**: File upload input, clear button, and status text (e.g., "No contacts loaded" or "100 contacts loaded").
  - **Template card**: Load, edit, save, clear buttons, and status text (e.g., "Template not started").
  - **Sending card**: Form for API key/domain, send/pause/stop buttons, progress bar, ETA text, download button, and status text (e.g., "Disabled: requires contacts, valid template, and Mailgun configuration").
  - **Template view**: Input fields for `sender_name`, `sender_email`, `subject`, `recipient_name`, `recipient_email`; textarea for `body`; mode dropdowns per input (Handlebars or Column: [column_name]); column buttons (appear above focused input/textarea); preview section with navigation (previous/next/random) and rendered email.
- **CSS**: Bootstrap for layout (cards, forms, grid). Uses `is-valid`/`is-invalid` classes for red/green input validation.

## Data models

### ContactsModel (contacts.js)

- **Purpose**: Manages contact list storage, CSV parsing, and export.
- **Storage**: IndexedDB (`contact:${id}` keys for contacts, `nextId` for auto-incrementing IDs).
- **API**:
  - `init(): Promise<void>`
    - Initializes `nextId` from IndexedDB or defaults to 1.
  - `loadCSV(file: File): Promise<void>`
    - Parses CSV using PapaParse (streaming mode, max 100MB).
    - Stores contacts with auto-incrementing IDs.
    - Adds `sent_at` (null) and `status` (null) if not present.
  - `getPage(page: number, limit: number): Promise<{ contacts: Object[], total: number }>`
    - Retrieves a page of contacts (e.g., 1 contact for preview).
    - Returns contacts and total count.
  - `updateContact(id: number, updates: { sent_at?: string|null, status?: string|null }): Promise<void>`
    - Updates a contact’s `sent_at` or `status`.
  - `exportCSV(): Promise<Blob>`
    - Exports all contacts as CSV, including `sent_at` and `status`.
  - `clear(): Promise<void>`
    - Deletes all contacts and resets `nextId` to 1.
  - `getColumns(): Promise<string[]>`
    - Returns column names from the first contact’s keys.

### TemplatesModel (templates.js)

- **Purpose**: Manages a single active email template, rendering, and export.
- **Storage**: IndexedDB (`template` key).
- **API**:
  - `init(): Promise<void>`
    - No explicit initialization (handled by `idb-keyval`).
  - `loadJSON(file: File): Promise<void>`
    - Parses JSON template with required fields (`sender_name`, `sender_email`, `subject`, `recipient_name`, `recipient_email`, `body`).
    - Throws error if any field is missing.
    - Stores template in IndexedDB.
  - `set(template: { sender_name: string, sender_email: string, subject: string, recipient_name: string, recipient_email: string, body: string }): Promise<void>`
    - Saves template to IndexedDB.
  - `get(): Promise<{ sender_name: string, sender_email: string, subject: string, recipient_name: string, recipient_email: string, body: string }>`
    - Retrieves the active template or returns empty defaults.
  - `renderPreview(contact: Object): Promise<{ sender_name: string, sender_email: string, subject: string, recipient_name: string, recipient_email: string, body: string }>`
    - Renders template with contact data using Handlebars.
  - `exportJSON(): Promise<Blob>`
    - Exports template as JSON.
  - `clear(): Promise<void>`
    - Deletes the active template.

### SendingModel (sending.js)

- **Purpose**: Manages Mailgun API configuration and email sending.
- **Storage**: IndexedDB (`config` key).
- **API**:
  - `init(): Promise<void>`
    - No explicit initialization (handled by `idb-keyval`).
  - `set(config: { apiKey: string, domain: string }): Promise<void>`
    - Saves API key and domain to IndexedDB.
  - `get(): Promise<{ apiKey: string, domain: string }>`
    - Retrieves configuration or returns empty defaults.
  - `sendBatch(contacts: Object[], template: { sender_name: string, sender_email: string, subject: string, recipient_name: string, recipient_email: string, body: string }): Promise<{ sent_at: string|null, status: string }[]>`
    - Sends emails for a batch of contacts via Mailgun API.
    - Renders template fields with contact data using Handlebars.
    - Retries failed sends (max 3 attempts).
    - Returns results with `sent_at` (ISO timestamp or null) and `status` ("sent" or "failed: [error]").

## App.js Role

- **Responsibility**: Controller that coordinates UI events, model interactions, and DOM updates.
- **Tasks**:
  - Initialize models (`ContactsModel`, `TemplatesModel`, `SendingModel`) on page load.
  - Handle view switching (main vs. template view) using `d-none` class toggling.
  - Bind UI events:
    - Contacts: Upload CSV, clear contacts.
    - Template: Upload JSON, edit fields, save, clear, insert column variables.
    - Sending: Update API key/domain, send/pause/stop emails, download report.
  - Update DOM:
    - Contacts card: Show contact count, toggle buttons.
    - Template card: Show template status, toggle buttons based on validity.
    - Sending card: Show config validity, progress, ETA; toggle buttons.
    - Template view: Populate inputs, validate fields, render preview, update column buttons and mode dropdowns.
  - Validate inputs:
    - Template fields: Non-empty and valid Handlebars (red/green styling).
    - API key/domain: Non-empty (red/green styling).

## UI implementation details

- **Main View**:
  - **Contacts card**:
    - File input for CSV upload (`contacts-upload`).
    - Clear button (`contacts-clear`) shown if contacts exist.
    - Status text (`contacts-status`) shows "No contacts loaded" or "[count] contacts loaded".
  - **Template card**:
    - Buttons: Load (`template-load`), Edit (`template-edit`), Save (`template-download`), Clear (`template-clear`).
    - Status text (`template-status`) reflects template state.
    - Disabled (`disabled` class, `opacity-50`) if no contacts loaded.
  - **Sending card**:
    - Form (`sending-config`) with inputs for API key (`apiKey`) and domain (`domain`).
    - Inputs styled with `is-valid`/`is-invalid` based on non-empty validation.
    - Buttons: Send (`sending-send`), Pause/Resume (`sending-pause`), Stop (`sending-stop`), Download (`sending-download`).
    - Progress bar (`sending-progress-bar`) and ETA text (`sending-eta`) shown during sending.
    - Status text (`sending-send-status`) shown if send button is disabled.
    - Disabled (`disabled` class, `opacity-50`) if no contacts or invalid template.
- **Template view**:
  - Form with inputs for `sender_name`, `sender_email`, `subject`, `recipient_name`, `recipient_email`, and textarea for `body` (`template-text`).
  - Inputs styled with `is-valid`/`is-invalid` based on non-empty and valid Handlebars checks.
  - Mode dropdowns (`mode-select`) per input with options: "Handlebars" or "Column: [column_name]".
  - Column buttons (`column-btn`) appear above focused input/textarea, inserting `{{column}}` at the end and refocusing with cursor at the end.
  - Preview section with navigation buttons (previous: `contact-prev`, next: `contact-next`, random: `contact-random`) and rendered email (`preview-content`).
  - Breadcrumbs for navigating back to main view.

## Validation

- **Template fields**:
  - Must be non-empty and valid Handlebars expressions.
  - Validated in `app.js` using `isValidHandlebars`:
    - Checks for non-empty (`str.trim()`).
    - Rejects incomplete Handlebars syntax (`{{[^}]*$`).
    - Tests compilation with empty context (`Handlebars.compile(str)({})`).
  - Inputs styled with `is-valid` (green) or `is-invalid` (red).
- **API key/domain**:
  - Must be non-empty.
  - Validated in `app.js` using `updateConfigValidation`.
  - Inputs styled with `is-valid` (green) or `is-invalid` (red).
  - Validation triggered on input and page load (via `loadConfig`).

## Error handling

- **CSV parsing**: Errors (e.g., invalid format, missing `email` column) shown via `showError` (alert).
- **JSON template**: Errors (e.g., missing fields) shown via `showError`.
- **Mailgun API**: Failed sends retried 3 times; errors logged in `status` field.
- **UI feedback**: Invalid inputs highlighted in red; send button disabled until all conditions met (contacts, valid template, valid config).

## Notes

- The application does not include a paginated contact table or filtering as described in the original design, focusing instead on a simple contact count display.
- Batch size is calculated dynamically (`min(100, ceil(total / 10))`) rather than configurable.
- No separate JSON configuration loading/exporting for `SendingModel`; config is managed via form inputs.
- All comments in the source code have been preserved to maintain production intent.

## Next steps

- In `ContactsModel`, add API for getting just the number of contacts.
- In `ContactsModel`, update `getPage` implementation to rely on contacts numbered 1..<`nextId`, in app; remove `contactPageSize`.
- Keep sending report shown after sending completes, with a button to download the report.
- Use a real JS build tool and package management.
