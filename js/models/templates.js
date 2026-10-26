import { set, get, del } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/+esm';
import Handlebars from 'https://cdn.jsdelivr.net/npm/handlebars@4.7.8/+esm';

export default class TemplatesModel {
    static TEMPLATE_FIELDS = [
        'sender_name',
        'sender_email',
        'subject',
        'recipient_name',
        'recipient_email',
        'recipient_cc',
        'body'
    ];

    // Fields that are allowed to be empty
    static OPTIONAL_FIELDS = ['recipient_cc'];

    #compiledTemplates = null;

    // Returns a syntax error message, or null if the source parses
    static getSyntaxError(source) {
        try {
            Handlebars.precompile(source);
            return null;
        } catch (err) {
            return err.message;
        }
    }

    // strict: missing variables throw instead of silently rendering as empty
    #compileTemplates(template) {
        return Object.fromEntries(
            TemplatesModel.TEMPLATE_FIELDS.map(field => [
                field,
                Handlebars.compile(template?.[field] || '', { strict: true })
            ])
        );
    }

    async loadJSON(file) {
        const text = await file.text();
        const template = JSON.parse(text);
        TemplatesModel.TEMPLATE_FIELDS.forEach(field => {
            if (typeof template[field] !== 'string') {
                throw new Error(`Missing or invalid field: ${field}`);
            }
            // Check that non-optional fields are not empty
            if (!TemplatesModel.OPTIONAL_FIELDS.includes(field) && !template[field].trim()) {
                throw new Error(`Field cannot be empty: ${field}`);
            }
        });
        await this.set(template);
    }

    async set(template) {
        // Invalidate compiled templates cache so they get recompiled on next render
        this.#compiledTemplates = null;
        await set('template', template);
    }

    async get() {
        return await get('template');
    }

    async render(contact) {
        // Lazy initialization: compile templates on first render if not already compiled
        if (!this.#compiledTemplates) {
            const template = await this.get();
            if (template) {
                this.#compiledTemplates = this.#compileTemplates(template);
            } else {
                this.#compiledTemplates = {};
            }
        }

        return Object.fromEntries(
            TemplatesModel.TEMPLATE_FIELDS.map(field => {
                try {
                    return [field, this.#compiledTemplates[field]?.(contact) || ''];
                } catch (err) {
                    throw new Error(`Failed to render "${field}": ${err.message}`, { cause: err });
                }
            })
        );
    }

    async exportJSON() {
        const template = await this.get();
        return new Blob([JSON.stringify(template)], { type: 'application/json' });
    }

    async clear() {
        this.#compiledTemplates = null;
        await del('template');
    }
}