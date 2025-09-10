import { set, get } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/+esm';

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
     */
    async sendBatch(contacts) {
        const PARALLELISM = 10;
        const config = await this.get();
        const results = new Array(contacts.length); // Preserve order by pre-allocating array

        // Create a queue of tasks, pairing contact with its original index
        const queue = contacts.map((contact, index) => ({ contact, index }));

        const processContact = async (task) => {
            const { contact, index } = task;

            // 1. Render all parts of the email for this specific contact
            const rendered = await this.#templatesModel.render(contact);
            if (!rendered || !rendered.sender_email || !rendered.recipient_email || !rendered.subject || !rendered.body) {
                throw new Error('Template rendering failed or produced incomplete email fields.');
            }

            // 2. Prepare FormData for a single email
            const formData = new FormData();
            formData.append('from', `${rendered.sender_name} <${rendered.sender_email}>`);
            formData.append('to', `${rendered.recipient_name} <${rendered.recipient_email}>`);
            formData.append('subject', rendered.subject);
            formData.append('html', rendered.body);

            // 3. Attempt to send with retries
            let attempts = 0;
            while (attempts < 3) {
                try {
                    const response = await fetch(`https://api.mailgun.net/v3/${config.domain}/messages`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Basic ${btoa(`api:${config.apiKey}`)}`,
                        },
                        body: formData,
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP ${response.status}: ${errorText}`);
                    }

                    // Success: store result and stop retrying
                    results[index] = { sent_at: new Date().toISOString(), status: 'sent' };
                    return;

                } catch (err) {
                    attempts++;
                    if (attempts === 3) {
                        // All retries failed
                        results[index] = { sent_at: null, status: `failed: ${err.message}` };
                    }
                }
            }
        };

        // 4. Create and run the worker pool
        const workers = [];
        for (let i = 0; i < PARALLELISM; i++) {
            const worker = (async () => {
                while (queue.length > 0) {
                    const task = queue.shift();
                    if (task) {
                        await processContact(task);
                    }
                }
            })();
            workers.push(worker);
        }

        await Promise.all(workers);

        return results;
    }
}