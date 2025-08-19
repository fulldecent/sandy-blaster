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
    await Promise.all([
        contactsModel.init(),
        templatesModel.init(),
        sendingModel.init()
    ]);
    setupEventListeners();
    await refreshMain();
    await refreshTemplateView();
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

    // Template view
    document.getElementById('template-mapping').addEventListener('submit', async e => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const template = {
            sender_name: formData.get('sender_name'),
            sender_email: formData.get('sender_email'),
            subject: formData.get('subject'),
            recipient_name: formData.get('recipient_name'),
            recipient_email: formData.get('recipient_email'),
            body: document.getElementById('template-text').value
        };
        try {
            await templatesModel.set(template);
            showError('Template saved');
            await refreshMain();
            await refreshTemplateView();
        } catch (err) {
            showError(err.message);
        }
    });

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
    document.getElementById('sending-config').addEventListener('submit', async e => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const config = {
            apiKey: formData.get('apiKey'),
            domain: formData.get('domain')
        };
        try {
            await sendingModel.set(config);
            showError('Configuration saved');
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
    breadcrumbs.innerHTML = `
    <li class="breadcrumb-item"><a href="#" data-view="main">Sendy Blaster</a></li>
    ${view === 'template' ? '<li class="breadcrumb-item active" aria-current="page">View/Edit Template</li>' : ''}
  `;
    if (view === 'main') await refreshMain();
    if (view === 'template') await refreshTemplateView();
}

async function refreshMain() {
    // Contacts card
    const { total } = await contactsModel.getPage(1, Number.MAX_SAFE_INTEGER);
    const contactsStatus = document.getElementById('contacts-status');
    const contactsCount = document.getElementById('contacts-count');
    const contactsClear = document.getElementById('contacts-clear');
    contactsStatus.textContent = total === 0 ? 'Contacts not yet loaded' : 'Contacts loaded';
    contactsCount.textContent = `${total} contacts currently loaded`;
    contactsClear.classList.toggle('d-none', total === 0);

    // Template card
    const template = await templatesModel.get();
    const templateStatus = document.getElementById('template-status');
    const templateClear = document.getElementById('template-clear');
    const isStarted = template.sender_name || template.sender_email || template.subject ||
        template.recipient_name || template.recipient_email || template.body;
    const isValid = template.sender_name && template.sender_email && template.subject &&
        template.recipient_name && template.recipient_email && template.body;
    templateStatus.textContent = !isStarted ? 'Template not yet completed' :
        isValid ? 'Template is ready to send' : 'Template started, but not yet passed validation';
    templateClear.classList.toggle('d-none', !isStarted);

    // Sending card
    const config = await sendingModel.get();
    const sendBtn = document.getElementById('sending-send');
    const sendStatus = document.getElementById('sending-send-status');
    const progressDiv = document.getElementById('sending-progress');
    const downloadBtn = document.getElementById('sending-download');
    const pauseBtn = document.getElementById('sending-pause');
    const isConfigValid = config.apiKey && config.domain;
    const canSend = total > 0 && isValid && isConfigValid;
    sendBtn.disabled = !canSend || sendingState !== 'idle';
    sendBtn.innerHTML = sendingState === 'sending' ? '<span class="spinner-border spinner-border-sm"></span> Sending...' : 'Send Emails';
    sendStatus.textContent = !canSend ? 'Disabled: Requires contacts, valid template, and Mailgun configuration' : '';
    progressDiv.classList.toggle('d-none', sendingState === 'idle');
    downloadBtn.classList.toggle('d-none', sendingState === 'idle');
    pauseBtn.textContent = sendingState === 'paused' ? 'Resume' : 'Pause';
    pauseBtn.classList.toggle('btn-warning', sendingState !== 'paused');
    pauseBtn.classList.toggle('btn-success', sendingState === 'paused');
    if (sendingState !== 'idle') {
        document.getElementById('sending-progress-bar').style.width = `${(sentCount / totalContacts) * 100}%`;
    }
}

async function refreshTemplateView() {
    const template = await templatesModel.get();
    document.getElementById('template-text').value = template.body || '';
    const form = document.getElementById('template-mapping');
    form.sender_name.value = template.sender_name || '';
    form.sender_email.value = template.sender_email || '';
    form.subject.value = template.subject || '';
    form.recipient_name.value = template.recipient_name || '';
    form.recipient_email.value = template.recipient_email || '';

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