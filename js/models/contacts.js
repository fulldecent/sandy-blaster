import { set, get, del, clear, entries, setMany, getMany, keys } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/+esm';
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';

export default class ContactsModel {
    async init() {
        this.nextId = (await get('nextId')) || 1; // Track auto-incrementing ID
    }

    async loadCSV(file, progressCallback = null) {
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
                    // Report progress during parsing
                    if (progressCallback && contacts.length % 1000 === 0) {
                        progressCallback(`Parsing CSV: ${contacts.length} contacts...`);
                    }
                },
                complete: async () => {
                    try {
                        if (progressCallback) {
                            progressCallback(`Saving ${contacts.length} contacts to database...`);
                        }
                        
                        // Prepare entries for bulk insert
                        const entries = [];
                        for (const contact of contacts) {
                            const id = this.nextId++;
                            entries.push([`contact:${id}`, contact]);
                        }
                        
                        // Use setMany for bulk operation - much faster than individual sets
                        await setMany(entries);
                        await set('nextId', this.nextId); // Update next ID
                        
                        if (progressCallback) {
                            progressCallback(`Successfully loaded ${contacts.length} contacts!`);
                        }
                        
                        resolve();
                    } catch (err) {
                        reject(new Error(`Failed to save contacts: ${err.message}`));
                    }
                },
                error: err => reject(new Error(`CSV parsing failed: ${err.message}`))
            });
        });
    }

    async getPage(page, limit) {
        // Get all contact keys without loading the data
        const allKeys = await keys();
        const contactKeys = allKeys.filter(key => typeof key === 'string' && key.startsWith('contact:'));
        
        const total = contactKeys.length;
        const start = (page - 1) * limit;
        const end = start + limit;
        
        // Get only the keys for the requested page
        const pageKeys = contactKeys.slice(start, end);
        
        if (pageKeys.length === 0) {
            return { contacts: [], total };
        }
        
        // Load only the contacts for this page
        const pageContacts = await getMany(pageKeys);
        
        return { contacts: pageContacts, total };
    }

    async updateContact(id, updates) {
        const contact = await get(`contact:${id}`);
        if (contact) {
            await set(`contact:${id}`, { ...contact, ...updates });
        }
    }

    async exportCSV() {
        // Get contact keys without loading all data first
        const allKeys = await keys();
        const contactKeys = allKeys.filter(key => typeof key === 'string' && key.startsWith('contact:'));
        
        if (contactKeys.length === 0) {
            return new Blob([''], { type: 'text/csv' });
        }
        
        // Load all contacts at once using getMany
        const contacts = await getMany(contactKeys);
        
        // Ensure sent_at and status are in the correct order
        const processedContacts = contacts.map(contact => {
            return { sent_at: contact.sent_at, status: contact.status, ...contact };
        });
        
        const csv = Papa.unparse(processedContacts);
        return new Blob([csv], { type: 'text/csv' });
    }

    async clear() {
        // Get only the keys without loading all data
        const allKeys = await keys();
        const keysToDelete = allKeys.filter(key => 
            (typeof key === 'string' && key.startsWith('contact:')) || key === 'nextId'
        );
        
        // Delete the keys
        for (const key of keysToDelete) {
            await del(key);
        }
        
        this.nextId = 1;
        await set('nextId', 1);
    }

    async getColumns() {
        // Get contact keys without loading all data
        const allKeys = await keys();
        const contactKey = allKeys.find(key => typeof key === 'string' && key.startsWith('contact:'));
        
        if (!contactKey) {
            return [];
        }
        
        // Load only one contact to get column names
        const contact = await get(contactKey);
        return contact ? Object.keys(contact) : [];
    }
}