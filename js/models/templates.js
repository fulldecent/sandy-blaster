import { set, get, del } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/+esm';
import Handlebars from 'https://cdn.jsdelivr.net/npm/handlebars@4.7.8/+esm';

export default class TemplatesModel {
    static REQUIRED_FIELDS = [
        'sender_name',
        'sender_email',
        'subject',
        'recipient_name',
        'recipient_email',
        'body'
    ];

    #compiledTemplates = {};

    #compileTemplates(template) {
        return Object.fromEntries(
            TemplatesModel.REQUIRED_FIELDS.map(field => [
                field,
                Handlebars.compile(template?.[field] || '')
            ])
        );
    }

    // MAYBE: could instead do this one time in render() if not initialized
    // and reset during reset/clear
    async init() {
        const template = await get('template');
        if (template) {
            this.#compiledTemplates = this.#compileTemplates(template);
        }
    }

    async loadJSON(file) {
        const text = await file.text();
        const template = JSON.parse(text);
        TemplatesModel.REQUIRED_FIELDS.forEach(field => {
            if (typeof template[field] !== 'string') {
                throw new Error(`Missing or invalid field: ${field}`);
            }
        });
        await this.set(template);
    }

    async set(template) {
        this.#compiledTemplates = this.#compileTemplates(template);
        await set('template', template);
    }

    async get() {
        return await get('template');
    }

    async render(contact) {
        return Object.fromEntries(
            TemplatesModel.REQUIRED_FIELDS.map(field => [
                field,
                this.#compiledTemplates[field]?.(contact) || ''
            ])
        );
    }

    async exportJSON() {
        const template = await this.get();
        return new Blob([JSON.stringify(template)], { type: 'application/json' });
    }

    async clear() {
        this.#compiledTemplates = {};
        await del('template');
    }
}