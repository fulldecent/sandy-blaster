import { set, get } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/+esm';

// Config-level rejections (bad key, forbidden, unknown domain): every send would fail, so stop the run
const FATAL_STATUSES = [401, 403, 404];
// Other 4xx responses are final for that email; only these are worth retrying
const RETRYABLE_STATUSES = [408, 429];
const MAX_ATTEMPTS = 3;

export class FatalSendError extends Error {
    /** Results gathered before the abort; unattempted contacts are left undefined. */
    results = [];
}

export default class SendingModel {
    #templatesModel = null;

    /**
     * @param {import('./TemplatesModel').default} templatesModel An instance of the TemplatesModel.
     */
    constructor(templatesModel) {
        if (!templatesModel || typeof templatesModel.render !== 'function') {
            throw new Error('SendingModel requires a valid TemplatesModel instance.');
        }
        this.#templatesModel = templatesModel;
    }

    async set(config) {
        await set('config', { id: 1, ...config });
    }

    async get() {
        const config = await get('config');
        return config || { apiKey: '', domain: '' };
    }

    /**
     * Sends emails to a list of contacts, processed in parallel.
     * @param {object[]} contacts The list of contact objects to send to.
     * @returns {Promise<object[]>} An array of result objects for each contact.
     * @throws {FatalSendError} On a config-level rejection; `results` holds what was attempted before the abort.
     */
    async sendBatch(contacts) {
        const PARALLELISM = 10;
        const config = await this.get();
        const results = new Array(contacts.length); // Preserve order by pre-allocating array
        // Throws here (not per email) if the credentials can't be encoded
        const authorization = `Basic ${btoa(`api:${config.apiKey}`)}`;
        let fatalError = null;

        // Create a queue of tasks, pairing contact with its original index
        const queue = contacts.map((contact, index) => ({ contact, index }));

        const processContact = async (task) => {
            const { contact, index } = task;

            // 1. Render all parts of the email for this specific contact
            let rendered;
            try {
                rendered = await this.#templatesModel.render(contact);
            } catch (err) {
                results[index] = { sent_at: null, status: `failed: ${err.message}` };
                return;
            }
            const missing = ['sender_email', 'recipient_email', 'subject', 'body'].filter(f => !rendered[f]?.trim());
            if (missing.length > 0) {
                results[index] = { sent_at: null, status: `failed: rendered empty ${missing.join(', ')}` };
                return;
            }

            // 2. Prepare FormData for a single email
            const formData = new FormData();
            formData.append('from', `${rendered.sender_name} <${rendered.sender_email}>`);
            formData.append('to', `${rendered.recipient_name} <${rendered.recipient_email}>`);
            if (rendered.recipient_cc && rendered.recipient_cc.trim()) {
                formData.append('cc', rendered.recipient_cc);
            }
            formData.append('subject', rendered.subject);
            formData.append('html', rendered.body);

            // 3. Attempt to send, retrying only transient failures
            let lastError;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS && !fatalError; attempt++) {
                let response;
                try {
                    response = await fetch(`https://api.mailgun.net/v3/${config.domain}/messages`, {
                        method: 'POST',
                        headers: { 'Authorization': authorization },
                        body: formData,
                    });
                } catch (err) {
                    lastError = err; // Network failure: transient
                    continue;
                }

                if (response.ok) {
                    results[index] = { sent_at: new Date().toISOString(), status: 'sent' };
                    return;
                }

                const message = `HTTP ${response.status}: ${await response.text()}`;
                if (FATAL_STATUSES.includes(response.status)) {
                    fatalError ??= new FatalSendError(message);
                    return;
                }
                lastError = new Error(message);
                const transient = response.status >= 500 || RETRYABLE_STATUSES.includes(response.status);
                if (!transient) break;
            }
            if (lastError) {
                results[index] = { sent_at: null, status: `failed: ${lastError.message}` };
            }
        };

        // 4. Create and run the worker pool
        const workers = [];
        for (let i = 0; i < PARALLELISM; i++) {
            const worker = (async () => {
                while (queue.length > 0 && !fatalError) {
                    const task = queue.shift();
                    if (task) {
                        await processContact(task);
                    }
                }
            })();
            workers.push(worker);
        }

        await Promise.all(workers);

        if (fatalError) {
            fatalError.results = results;
            throw fatalError;
        }
        return results;
    }
}