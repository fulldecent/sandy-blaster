import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8.0.0/+esm';

export default class ContactsModel {
    async init() {
        this.db = await openDB('sendy-blaster', 1, {
            upgrade(db) {
                const store = db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
                store.createIndex('email', 'email');
                store.createIndex('sent_at', 'sent_at');
                store.createIndex('status', 'status');
            }
        });
    }

    async loadCSV(file) {
        if (!file || file.size > 100 * 1024 * 1024) throw new Error('Invalid or too large CSV file');
        const contacts = [];
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                dynamicTyping: true,
                step: async (row) => {
                    if (!row.data.sent_at) row.data.sent_at = null;
                    if (!row.data.status) row.data.status = null;
                    contacts.push(row.data);
                },
                complete: async () => {
                    const tx = this.db.transaction('contacts', 'readwrite');
                    const store = tx.objectStore('contacts');
                    for (const contact of contacts) {
                        await store.put(contact);
                    }
                    await tx.done;
                    resolve();
                },
                error: err => reject(new Error(`CSV parsing failed: ${err.message}`))
            });
        });
    }

    async getPage(page, limit) {
        const store = this.db.transaction('contacts').objectStore('contacts');
        const total = await store.count();
        const contacts = [];
        let cursor = await store.openCursor();
        let i = (page - 1) * limit;
        while (cursor && i > 0) {
            cursor = await cursor.continue();
            i--;
        }
        i = 0;
        while (cursor && i < limit) {
            contacts.push({ id: cursor.key, ...cursor.value });
            cursor = await cursor.continue();
            i++;
        }
        return { contacts, total };
    }

    async updateContact(id, updates) {
        const tx = this.db.transaction('contacts', 'readwrite');
        const store = tx.objectStore('contacts');
        const contact = await store.get(id);
        if (contact) {
            await store.put({ ...contact, ...updates });
        }
        await tx.done;
    }

    async exportCSV() {
        const store = this.db.transaction('contacts').objectStore('contacts');
        const contacts = [];
        let cursor = await store.openCursor();
        while (cursor) {
            const { id, ...rest } = cursor.value;
            contacts.push({ sent_at: rest.sent_at, status: rest.status, ...rest });
            cursor = await cursor.continue();
        }
        const csv = Papa.unparse(contacts);
        return new Blob([csv], { type: 'text/csv' });
    }

    async clear() {
        const tx = this.db.transaction('contacts', 'readwrite');
        await tx.objectStore('contacts').clear();
        await tx.done;
    }

    async getColumns() {
        const store = this.db.transaction('contacts').objectStore('contacts');
        const contact = await store.get(1);
        return contact ? Object.keys(contact) : [];
    }
}