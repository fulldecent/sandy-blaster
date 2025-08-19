import { set, get, del, clear, entries } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/+esm';
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';

export default class ContactsModel {
    async init() {
        // No explicit initialization needed; idb-keyval manages the database
        this.nextId = (await get('nextId')) || 1; // Track auto-incrementing ID
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
                    for (const contact of contacts) {
                        const id = this.nextId++;
                        await set(`contact:${id}`, { id, ...contact });
                    }
                    await set('nextId', this.nextId); // Update next ID
                    resolve();
                },
                error: err => reject(new Error(`CSV parsing failed: ${err.message}`))
            });
        });
    }

    async getPage(page, limit) {
        const allEntries = await entries();
        const contacts = allEntries
            .filter(([key]) => key.startsWith('contact:'))
            .map(([_, value]) => value);
        const total = contacts.length;
        const start = (page - 1) * limit;
        const end = start + limit;
        return { contacts: contacts.slice(start, end), total };
    }

    async updateContact(id, updates) {
        const contact = await get(`contact:${id}`);
        if (contact) {
            await set(`contact:${id}`, { ...contact, ...updates });
        }
    }

    async exportCSV() {
        const allEntries = await entries();
        const contacts = allEntries
            .filter(([key]) => key.startsWith('contact:'))
            .map(([_, value]) => {
                const { id, ...rest } = value;
                return { sent_at: rest.sent_at, status: rest.status, ...rest };
            });
        const csv = Papa.unparse(contacts);
        return new Blob([csv], { type: 'text/csv' });
    }

    async clear() {
        const allKeys = await entries();
        for (const [key] of allKeys) {
            if (key.startsWith('contact:') || key === 'nextId') {
                await del(key);
            }
        }
        this.nextId = 1;
        await set('nextId', 1);
    }

    async getColumns() {
        const allEntries = await entries();
        const contact = allEntries
            .find(([key]) => key.startsWith('contact:'));
        return contact ? Object.keys(contact[1]) : [];
    }
}