import ContactsModel from './models/contacts.js';
import TemplatesModel from './models/templates.js';
import SendingModel from './models/sending.js';
import { showError, downloadBlob } from './utils.js';

const contactsModel = new ContactsModel();
const templatesModel = new TemplatesModel();
const sendingModel = new SendingModel();
let currentView = 'main';
let currentContactPage = 1;
const contactPageSize = 1;
let currentContact = null;
let sendingState = 'idle'; // idle, sending, paused
let sentCount = 0;
let totalContacts = 0;

async function init() {
    try {
        // Await all model initializations
        await Promise.all([
            contactsModel.init(),
            templatesModel.init(),
            sendingModel.init()
        ]);
        console.log('All models initialized successfully');

        // Set up event listeners and refresh views
        setupEventListeners();
        await Promise.all([
            refreshMain(),
            refreshTemplateView()
        ]);

        // Don't hurt people's eyes
        const matchPrefersLight = window.matchMedia('(prefers-color-scheme:light)');
        if (matchPrefersLight.matches) {
            document.documentElement.setAttribute('data-bs-theme', 'light');
        }
        debugger;
        matchPrefersLight.addEventListener('change', event => {
            document.documentElement.setAttribute('data-bs-theme', event.matches ? "light" : "dark");
        });
    } catch (error) {
        console.error('Initialization failed:', error);
        showError('Failed to initialize application: ' + error.message);
    }
}

function setupEventListeners() {
    document.getElementById('breadcrumbs').addEventListener('click', async e => {
        if (e.target.tagName === 'A') {
            e.preventDefault();
            const view = e.target.dataset.view;
            await switchView(view);
        }
    });

    // Contacts card
    document.getElementById('contacts-load').addEventListener('click', () => {
        document.getElementById('contacts-upload').click();
    });

    document.getElementById('contacts-upload').addEventListener('change', async e => {
        try {
            await contactsModel.loadCSV(e.target.files[0]);
            await refreshMain();
            await refreshTemplateView();
        } catch (err) {
            showError(err.message);
        }
    });

    document.getElementById('contacts-clear').addEventListener('click', async () => {
        if (window.confirm('Clear all contacts?')) {
            await contactsModel.clear();
            currentContactPage = 1;
            currentContact = null;
            await refreshMain();
            await refreshTemplateView();
        }
    });

    // Template card
    document.getElementById('template-load').addEventListener('click', () => {
        document.getElementById('template-upload').click();
    });

    document.getElementById('template-upload').addEventListener('change', async e => {
        try {
            await templatesModel.loadJSON(e.target.files[0]);
            await refreshMain();
            await refreshTemplateView();
        } catch (err) {
            showError(err.message);
        }
    });

    document.getElementById('template-edit').addEventListener('click', async () => {
        await switchView('template');
    });

    document.getElementById('template-download').addEventListener('click', async () => {
        try {
            const blob = await templatesModel.exportJSON();
            downloadBlob(blob, 'template.json');
        } catch (err) {
            showError(err.message);
        }
    });

    document.getElementById('template-clear').addEventListener('click', async () => {
        if (window.confirm('Clear template?')) {
            await templatesModel.clear();
            await refreshMain();
            await refreshTemplateView();
        }
    });

    // Template view: Real-time saving and column buttons
    const templateInputs = ['sender_name', 'sender_email', 'subject', 'recipient_name', 'recipient_email', 'template-text'];
    templateInputs.forEach(id => {
        const input = document.getElementById(id);
        input.addEventListener('input', async () => {
            try {
                const template = {
                    sender_name: document.getElementById('sender_name').value,
                    sender_email: document.getElementById('sender_email').value,
                    subject: document.getElementById('subject').value,
                    recipient_name: document.getElementById('recipient_name').value,
                    recipient_email: document.getElementById('recipient_email').value,
                    body: document.getElementById('template-text').value
                };
                await templatesModel.set(template);
                await refreshTemplateView();
            } catch (err) {
                showError(err.message);
            }
        });
    });

    // Column buttons
    document.getElementById('column-buttons').addEventListener('click', e => {
        if (e.target.classList.contains('column-btn')) {
            const column = e.target.dataset.column;
            const activeElement = document.activeElement;
            if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
                const start = activeElement.selectionStart;
                const end = activeElement.selectionEnd;
                const value = activeElement.value;
                activeElement.value = value.slice(0, start) + `{{${column}}}` + value.slice(end);
                activeElement.selectionStart = activeElement.selectionEnd = start + column.length + 4;
                activeElement.dispatchEvent(new Event('input')); // Trigger save and preview
            }
        }
    });

    // Mode and column dropdowns
    document.querySelectorAll('.mode-select').forEach(select => {
        select.addEventListener('change', async () => {
            const field = select.dataset.field;
            const input = document.getElementById(field);
            const columnSelect = select.parentElement.querySelector('.column-select');
            columnSelect.classList.toggle('d-none', select.value !== 'column');
            if (select.value === 'column') {
                const columns = await contactsModel.getColumns();
                const currentValue = input.value.match(/^{{(.+)}}$/)?.[1];
                columnSelect.innerHTML = columns.map(col =>
                    `<option value="${col}" ${col === currentValue ? 'selected' : ''}>${col}</option>`
                ).join('');
                if (columns.length > 0 && !columns.includes(currentValue)) {
                    input.value = `{{${columns[0]}}}`;
                    input.dispatchEvent(new Event('input')); // Trigger save and preview
                }
            } else {
                input.value = '';
                input.dispatchEvent(new Event('input')); // Trigger save and preview
            }
        });
    });

    document.querySelectorAll('.column-select').forEach(select => {
        select.addEventListener('change', () => {
            const field = select.dataset.field;
            const input = document.getElementById(field);
            input.value = `{{${select.value}}}`;
            input.dispatchEvent(new Event('input')); // Trigger save and preview
        });
    });

    // Template view navigation
    document.getElementById('contact-prev').addEventListener('click', async () => {
        if (currentContactPage > 1) {
            currentContactPage--;
            await refreshTemplateView();
        }
    });

    document.getElementById('contact-next').addEventListener('click', async () => {
        currentContactPage++;
        await refreshTemplateView();
    });

    document.getElementById('contact-random').addEventListener('click', async () => {
        const { total } = await contactsModel.getPage(1, Number.MAX_SAFE_INTEGER);
        currentContactPage = Math.floor(Math.random() * total) + 1;
        await refreshTemplateView();
    });

    // Sending card
    document.getElementById('sending-config').addEventListener('input', async e => {
        const formData = new FormData(e.target);
        const config = {
            apiKey: formData.get('apiKey'),
            domain: formData.get('domain')
        };
        try {
            await sendingModel.set(config);
            await refreshMain();
        } catch (err) {
            showError(err.message);
        }
    });

    document.getElementById('sending-send').addEventListener('click', async () => {
        if (window.confirm('Send emails to all contacts?')) {
            sendingState = 'sending';
            await refreshMain();
            await sendEmails();
        }
    });

    document.getElementById('sending-pause').addEventListener('click', async () => {
        sendingState = sendingState === 'paused' ? 'sending' : 'paused';
        await refreshMain();
    });

    document.getElementById('sending-stop').addEventListener('click', async () => {
        sendingState = 'idle';
        sentCount = 0;
        totalContacts = 0;
        await refreshMain();
    });

    document.getElementById('sending-download').addEventListener('click', async () => {
        try {
            const blob = await contactsModel.exportCSV();
            downloadBlob(blob, 'contacts.csv');
        } catch (err) {
            showError(err.message);
        }
    });
}

async function switchView(view) {
    currentView = view;
    document.getElementById('main-view').classList.toggle('d-none', view !== 'main');
    document.getElementById('template-view').classList.toggle('d-none', view !== 'template');
    const breadcrumbs = document.getElementById('breadcrumbs');
    breadcrumbs.classList.toggle('d-none', view === 'main');
    if (view === 'main') await refreshMain();
    if (view === 'template') await refreshTemplateView();
}

async function refreshMain() {
    // Contacts card
    const { total } = await contactsModel.getPage(1, Number.MAX_SAFE_INTEGER);
    const contactsStatus = document.getElementById('contacts-status');
    const contactsClear = document.getElementById('contacts-clear');
    const contactsLoad = document.getElementById('contacts-load');
    contactsStatus.textContent = total === 0 ? 'No contacts loaded' : `${total} contacts loaded`;
    contactsClear.classList.toggle('d-none', total === 0);
    contactsLoad.classList.toggle('d-none', total !== 0);

    // Template card
    const template = await templatesModel.get();
    const templateStatus = document.getElementById('template-status');
    const templateClear = document.getElementById('template-clear');
    const templateLoad = document.getElementById('template-load');
    const templateUpload = document.getElementById('template-upload');
    const templateEdit = document.getElementById('template-edit');
    const templateDownload = document.getElementById('template-download');
    const templateCard = document.getElementById('template-card');
    const isStarted = template.sender_name || template.sender_email || template.subject ||
        template.recipient_name || template.recipient_email || template.body;
    const isValid = template.sender_name && template.sender_email && template.subject &&
        template.recipient_name && template.recipient_email && template.body;
    templateStatus.textContent = !isStarted ? 'Template not started' :
        isValid ? 'Template ready to send' : 'Template started but not complete';
    templateLoad.classList.toggle('d-none', isStarted);
    templateClear.classList.toggle('d-none', !isStarted);
    templateDownload.classList.toggle('d-none', !isStarted);
    templateCard.classList.toggle('disabled', total === 0);
    templateCard.classList.toggle('opacity-50', total === 0);

    // Sending card
    const config = await sendingModel.get();
    const sendBtn = document.getElementById('sending-send');
    const sendStatus = document.getElementById('sending-send-status');
    const progressDiv = document.getElementById('sending-progress');
    const downloadBtn = document.getElementById('sending-download');
    const pauseBtn = document.getElementById('sending-pause');
    const sendingCard = document.getElementById('sending-card');
    const isConfigValid = config.apiKey && config.domain;
    const canSend = total > 0 && isValid && isConfigValid;
    sendBtn.disabled = !canSend || sendingState !== 'idle';
    sendBtn.innerHTML = sendingState === 'sending' ? '<span class="spinner-border spinner-border-sm"></span> Sending...' : 'Send emails';
    sendStatus.textContent = !canSend ? 'Disabled: requires contacts, valid template, and Mailgun configuration' : '';
    progressDiv.classList.toggle('d-none', sendingState === 'idle');
    downloadBtn.classList.toggle('d-none', sendingState === 'idle');
    pauseBtn.textContent = sendingState === 'paused' ? 'Resume' : 'Pause';
    pauseBtn.classList.toggle('btn-warning', sendingState !== 'paused');
    pauseBtn.classList.toggle('btn-success', sendingState === 'paused');
    sendingCard.classList.toggle('disabled', total === 0 || !isValid);
    sendingCard.classList.toggle('opacity-50', total === 0 || !isValid);
    if (sendingState !== 'idle') {
        document.getElementById('sending-progress-bar').style.width = `${(sentCount / totalContacts) * 100}%`;
    }
}

async function refreshTemplateView() {
    const template = await templatesModel.get();
    document.getElementById('template-text').value = template.body || '';
    const inputs = {
        sender_name: document.getElementById('sender_name'),
        sender_email: document.getElementById('sender_email'),
        subject: document.getElementById('subject'),
        recipient_name: document.getElementById('recipient_name'),
        recipient_email: document.getElementById('recipient_email')
    };
    Object.entries(inputs).forEach(([key, input]) => {
        input.value = template[key] || '';
    });

    // Populate column buttons
    const columns = await contactsModel.getColumns();
    const columnButtons = document.getElementById('column-buttons');
    columnButtons.innerHTML = columns.length > 0 ? columns.map(col =>
        `<button class="btn btn-outline-secondary btn-sm me-1 column-btn" data-column="${col}">{{${col}}}</button>`
    ).join('') : '<p class="text-muted">No contact columns available</p>';

    // Populate column dropdowns
    document.querySelectorAll('.column-select').forEach(select => {
        const currentValue = document.getElementById(select.dataset.field).value.match(/^{{(.+)}}$/)?.[1];
        select.innerHTML = columns.map(col =>
            `<option value="${col}" ${col === currentValue ? 'selected' : ''}>${col}</option>`
        ).join('');
        select.classList.toggle('d-none', select.parentElement.querySelector('.mode-select').value !== 'column');
    });

    // Set mode dropdowns based on input values
    document.querySelectorAll('.mode-select').forEach(select => {
        const input = document.getElementById(select.dataset.field);
        const isColumn = input.value.match(/^{{(.+)}}$/) && columns.includes(input.value.match(/^{{(.+)}}$/)?.[1]);
        select.value = isColumn ? 'column' : 'handlebars';
        select.parentElement.querySelector('.column-select').classList.toggle('d-none', !isColumn);
    });

    const { contacts, total } = await contactsModel.getPage(currentContactPage, contactPageSize);
    const selectorStatus = document.getElementById('contact-selector-status');
    const pageInfo = document.getElementById('contact-page-info');
    const prevBtn = document.getElementById('contact-prev');
    const nextBtn = document.getElementById('contact-next');
    const randomBtn = document.getElementById('contact-random');
    const previewContent = document.getElementById('preview-content');

    if (total === 0) {
        selectorStatus.textContent = 'No contacts loaded. Preview is not available.';
        pageInfo.textContent = '';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        randomBtn.disabled = true;
        previewContent.innerHTML = '';
        currentContact = null;
    } else {
        selectorStatus.textContent = '';
        pageInfo.textContent = `Contact ${currentContactPage} of ${total}`;
        prevBtn.disabled = currentContactPage === 1;
        nextBtn.disabled = currentContactPage === total;
        randomBtn.disabled = false;
        currentContact = contacts[0];
        try {
            const preview = await templatesModel.renderPreview(currentContact);
            previewContent.innerHTML = `
        <p><strong>Sender:</strong> ${preview.sender_name} &lt;${preview.sender_email}&gt;</p>
        <p><strong>Recipient:</strong> ${preview.recipient_name} &lt;${preview.recipient_email}&gt;</p>
        <p><strong>Subject:</strong> ${preview.subject}</p>
        <p><em>Showing HTML, your email will send as an HTML message</em></p>
        <div><strong>Body:</strong><div>${preview.body}</div></div>
      `;
        } catch (err) {
            previewContent.innerHTML = '<p class="text-muted">Invalid template for preview</p>';
        }
    }
}

async function sendEmails() {
    const progressBar = document.getElementById('sending-progress-bar');
    const etaText = document.getElementById('sending-eta');
    const template = await templatesModel.get();
    const { total } = await contactsModel.getPage(1, Number.MAX_SAFE_INTEGER);
    sentCount = 0;
    totalContacts = total;
    const batchSize = Math.min(100, Math.ceil(total / 10)); // Optimize: 100 or 10% of total

    const startTime = Date.now();
    let page = 1;
    while (sentCount < total && sendingState === 'sending') {
        const { contacts } = await contactsModel.getPage(page, batchSize);
        if (contacts.length === 0) break;

        const results = await sendingModel.sendBatch(contacts, template);
        for (let i = 0; i < contacts.length; i++) {
            await contactsModel.updateContact(contacts[i].id, results[i]);
        }

        sentCount += contacts.length;
        progressBar.style.width = `${(sentCount / total) * 100}%`;
        const elapsed = (Date.now() - startTime) / 1000;
        const eta = ((total - sentCount) * elapsed) / sentCount;
        etaText.textContent = `ETA: ${Math.round(eta)} seconds`;
        page++;

        if (sendingState === 'paused') {
            while (sendingState === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    if (sendingState !== 'idle') {
        sendingState = 'idle';
        sentCount = 0;
        totalContacts = 0;
        showError('Sending complete');
        await refreshMain();
    }
}

init();