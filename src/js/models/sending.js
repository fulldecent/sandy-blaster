import { set, get } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/+esm';
import Handlebars from 'https://cdn.jsdelivr.net/npm/handlebars@4.7.8/+esm';

export default class SendingModel {
    async init() {
        // No explicit initialization needed; idb-keyval manages the database
    }

    async set(config) {
        if (!config.apiKey || !config.domain) {
            throw new Error('Invalid configuration');
        }
        await set('config', { id: 1, ...config });
    }

    async get() {
        const config = await get('config');
        return config || { apiKey: '', domain: '' };
    }

    async sendBatch(contacts, template) {
        const config = await this.get();
        const results = [];
        for (const contact of contacts) {
            let attempts = 0;
            while (attempts < 3) {
                try {
                    const rendered = {
                        sender_name: Handlebars.compile(template.sender_name)(contact),
                        sender_email: Handlebars.compile(template.sender_email)(contact),
                        subject: Handlebars.compile(template.subject)(contact),
                        recipient_name: Handlebars.compile(template.recipient_name)(contact),
                        recipient_email: Handlebars.compile(template.recipient_email)(contact),
                        body: Handlebars.compile(template.body)(contact)
                    };
                    const response = await fetch(`https://api.mailgun.net/v3/${config.domain}/messages`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Basic ${btoa(`api:${config.apiKey}`)}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: new URLSearchParams({
                            from: `${rendered.sender_name} <${rendered.sender_email}>`,
                            to: `${rendered.recipient_name} <${rendered.recipient_email}>`,
                            subject: rendered.subject,
                            html: rendered.body
                        })
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    results.push({ sent_at: new Date().toISOString(), status: 'sent' });
                    break;
                } catch (err) {
                    attempts++;
                    if (attempts === 3) {
                        results.push({ sent_at: null, status: `failed: ${err.message}` });
                    }
                }
            }
        }
        return results;
    }
}