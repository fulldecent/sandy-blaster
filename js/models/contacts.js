import { set, get, del, entries, setMany, getMany } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/+esm';
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';

export default class ContactsModel {
    /**
     * Parses a CSV file and atomically adds the contacts to the database.
     * To avoid memory leaking, the UI should call clear() before loadCSV().
     * @param {File} file The CSV file to process.
     */
    async loadCSV(file) {
        if (!file || file.size > 100 * 1024 * 1024) {
            throw new Error('Invalid or too large CSV file');
        }

        const newContacts = [];
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                step: (row) => {
                    // Ensure core fields have default null values if missing
                    if (!row.data.sent_at) row.data.sent_at = null;
                    if (!row.data.status) row.data.status = null;
                    newContacts.push(row.data);
                },
                complete: async () => {
                    try {
                        // Prepare entries for atomic setMany operation
                        const entriesToSet = newContacts.map((contact, index) => {
                            const id = 1 + index;
                            const key = `contact:${id}`;
                            return [key, contact];
                        });
                        entriesToSet.push(['contact-count', newContacts.length]);
                        await setMany(entriesToSet);
                        resolve();
                    } catch (dbError) {
                        reject(new Error(`Database write failed: ${dbError.message}`));
                    }
                },
                error: (err) => reject(new Error(`CSV parsing failed: ${err.message}`)),
            });
        });
    }

    /**
     * Retrieves a paginated list of contacts.
     * @param {number} page The page number (1-indexed).
     * @param {number} limit The number of items per page.
     * @returns {Promise<{contacts: object[], total: number}>}
     */
    async getPage(page, limit) {
        const total = (await get('contact-count')) || 0;
        const startId = (page - 1) * limit + 1;
        const endId = Math.min(startId + limit - 1, total);

        // Ensure we don't request keys that don't exist
        if (startId > endId) {
            return { contacts: [], total };
        }

        // Generate the specific keys to fetch
        const keysToFetch = [];
        for (let i = startId; i <= endId; i++) {
            keysToFetch.push(`contact:${i}`);
        }

        const contacts = await getMany(keysToFetch);
        return { contacts, total };
    }

    /**
     * Updates a single contact record.
     * @param {number|string} id The ID of the contact.
     * @param {object} updates The properties to update.
     */
    async updateContact(id, updates) {
        const key = `contact:${id}`;
        const contact = await get(key);
        if (contact) {
            await set(key, { ...contact, ...updates });
        }
    }

    /**
     * Retrieves all contacts and converts them to a CSV file blob.
     * @returns {Promise<Blob>} A blob containing the data in CSV format.
     */
    async exportCSV() {
        const total = (await get('contact-count')) || 0;
        if (total === 0) {
            return new Blob([''], { type: 'text/csv' });
        }

        // Generate all keys from 1 to total
        const allContactKeys = Array.from({ length: total }, (_, i) => `contact:${i + 1}`);
        const contacts = await getMany(allContactKeys);
        const csv = Papa.unparse(contacts);
        return new Blob([csv], { type: 'text/csv' });
    }

    /**
     * Clears all contact data from the database.
     * This method iterates through all keys to preserve any non-contact data, as requested.
     */
    async clear() {
        const allDbEntries = await entries();
        for (const [key] of allDbEntries) {
            if (key.startsWith('contact:')) {
                await del(key);
            }
        }
        // Delete or reset the count
        await set('contact-count', 0);
    }

    /**
     * Gets the column headers from the first contact record.
     * @returns {Promise<string[]>} An array of column names.
     */
    async getColumns() {
        const firstContact = await get('contact:1');
        return firstContact ? Object.keys(firstContact) : [];
    }
}