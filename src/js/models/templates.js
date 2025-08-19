import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8.0.0/+esm';
import Handlebars from 'https://cdn.jsdelivr.net/npm/handlebars@4.7.8/+esm';

export default class TemplatesModel {
    async init() {
        this.db = await openDB('sendy-blaster', 1, {
            upgrade(db) {
                db.createObjectStore('templates', { keyPath: 'id' });
            }
        });
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
        const tx = this.db.transaction('templates', 'readwrite');
        await tx.objectStore('templates').put({ id: 1, ...template });
        await tx.done;
    }

    async get() {
        const template = await this.db.transaction('templates').objectStore('templates').get(1);
        return template || {
            sender_name: '',
            sender_email: '',
            subject: '',
            recipient_name: '',
            recipient_email: '',
            body: ''
        };
    }

    async renderPreview(contact) {
        const template = await this.get();
        const compiled = {
            sender_name: Handlebars.compile(template.sender_name),
            sender_email: Handlebars.compile(template.sender_email),
            subject: Handlebars.compile(template.subject),
            recipient_name: Handlebars.compile(template.recipient_name),
            recipient_email: Handlebars.compile(template.recipient_email),
            body: Handlebars.compile(template.body)
        };
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
        const tx = this.db.transaction('templates', 'readwrite');
        await tx.objectStore('templates').clear();
        await tx.done;
    }
}