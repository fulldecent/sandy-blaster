import { set, get, del } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/+esm';
import Handlebars from 'https://cdn.jsdelivr.net/npm/handlebars@4.7.8/+esm';

export default class TemplatesModel {
    constructor() {
        // Cache for compiled Handlebars templates to improve performance
        this._compiledCache = null;
        this._lastTemplate = null;
    }

    async init() {
        // No explicit initialization needed; idb-keyval manages the database
    }

    async loadJSON(file) {
        const text = await file.text();
        const template = JSON.parse(text);
        if (!template.sender_name || !template.sender_email || !template.subject ||
            !template.recipient_name || !template.recipient_email || !template.body) {
            throw new Error('Invalid template format');
        }
        await this.set(template);
    }

    async set(template) {
        await set('template', { id: 1, ...template });
        // Clear cache when template changes
        this._compiledCache = null;
        this._lastTemplate = null;
    }

    async get() {
        const template = await get('template');
        return template || {
            sender_name: '',
            sender_email: '',
            subject: '',
            recipient_name: '',
            recipient_email: '',
            body: ''
        };
    }

    _getCompiledTemplates(template) {
        // Check if we can use cached compiled templates
        if (this._compiledCache && this._lastTemplate && 
            this._lastTemplate.sender_name === template.sender_name &&
            this._lastTemplate.sender_email === template.sender_email &&
            this._lastTemplate.subject === template.subject &&
            this._lastTemplate.recipient_name === template.recipient_name &&
            this._lastTemplate.recipient_email === template.recipient_email &&
            this._lastTemplate.body === template.body) {
            return this._compiledCache;
        }

        // Compile templates and cache them
        const compiled = {
            sender_name: Handlebars.compile(template.sender_name),
            sender_email: Handlebars.compile(template.sender_email),
            subject: Handlebars.compile(template.subject),
            recipient_name: Handlebars.compile(template.recipient_name),
            recipient_email: Handlebars.compile(template.recipient_email),
            body: Handlebars.compile(template.body)
        };

        // Cache the compiled templates and the template content for comparison
        this._compiledCache = compiled;
        this._lastTemplate = { ...template };
        
        return compiled;
    }

    async renderPreview(contact) {
        const template = await this.get();
        const compiled = this._getCompiledTemplates(template);
        
        return {
            sender_name: compiled.sender_name(contact),
            sender_email: compiled.sender_email(contact),
            subject: compiled.subject(contact),
            recipient_name: compiled.recipient_name(contact),
            recipient_email: compiled.recipient_email(contact),
            body: compiled.body(contact)
        };
    }

    async exportJSON() {
        const template = await this.get();
        return new Blob([JSON.stringify(template)], { type: 'application/json' });
    }

    async clear() {
        await del('template');
        // Clear cache when template is cleared
        this._compiledCache = null;
        this._lastTemplate = null;
    }
}