/**
 * Contacts Module
 * 
 * Handles contact management:
 * - Loading and displaying contacts
 * - Selection management
 * - Search functionality
 * - Deletion
 * - Pagination
 */

function initContacts() {
    const selectAllCheckbox = document.getElementById('selectAllContacts');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const searchInput = document.getElementById('contactSearch');
    
    // Select all checkbox
    selectAllCheckbox.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('#contactsTableBody input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            const contactId = parseInt(cb.dataset.id);
            if (e.target.checked) {
                AppState.selectedContacts.add(contactId);
            } else {
                AppState.selectedContacts.delete(contactId);
            }
        });
        updateDeleteButton();
    });
    
    // Delete selected button
    deleteSelectedBtn.addEventListener('click', async () => {
        const count = AppState.selectedContacts.size;
        
        if (count === 0) return;
        
        if (!confirm(`Are you sure you want to delete ${count} contact(s)?`)) {
            return;
        }
        
        try {
            const ids = Array.from(AppState.selectedContacts);
            const result = await API.delete('/contacts', { ids });
            
            Toast.success('Deleted', `${result.deletedCount} contact(s) deleted`);
            
            AppState.selectedContacts.clear();
            loadContacts();
            
        } catch (error) {
            Toast.error('Delete Failed', error.message);
        }
    });
    
    // Search with debounce
    searchInput.addEventListener('input', debounce((e) => {
        AppState.currentPage = 1;
        loadContacts(e.target.value);
    }, 300));
}

async function loadContacts(search = '') {
    try {
        const params = new URLSearchParams({
            page: AppState.currentPage,
            limit: 50,
            search
        });
        
        const data = await API.get(`/contacts?${params}`);
        
        if (data.success) {
            AppState.contacts = data.contacts;
            AppState.totalPages = data.pagination.totalPages;
            
            renderContactsTable(data.contacts);
            renderPagination(data.pagination);
            updateContactCount(data.pagination.total);
        }
    } catch (error) {
        Toast.error('Failed to load contacts', error.message);
    }
}

function renderContactsTable(contacts) {
    const tbody = document.getElementById('contactsTableBody');
    
    if (contacts.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">No contacts found. Upload a file to get started.</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = contacts.map(contact => `
        <tr data-id="${contact.id}">
            <td class="col-checkbox">
                <input type="checkbox" 
                       data-id="${contact.id}"
                       ${AppState.selectedContacts.has(contact.id) ? 'checked' : ''}>
            </td>
            <td>${escapeHtml(contact.first_name)}</td>
            <td>${escapeHtml(contact.last_name)}</td>
            <td>${escapeHtml(contact.email)}</td>
            <td>${escapeHtml(contact.company_name || '-')}</td>
            <td class="col-actions">
                <button class="delete-btn" data-id="${contact.id}" title="Delete contact">
                    🗑️
                </button>
            </td>
        </tr>
    `).join('');
    
    // Add event listeners
    tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const contactId = parseInt(e.target.dataset.id);
            if (e.target.checked) {
                AppState.selectedContacts.add(contactId);
            } else {
                AppState.selectedContacts.delete(contactId);
            }
            updateDeleteButton();
            updateSelectAllState();
        });
    });
    
    tbody.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const contactId = e.target.dataset.id;
            
            if (!confirm('Are you sure you want to delete this contact?')) {
                return;
            }
            
            try {
                await API.delete(`/contacts/${contactId}`);
                Toast.success('Deleted', 'Contact deleted successfully');
                loadContacts(document.getElementById('contactSearch').value);
            } catch (error) {
                Toast.error('Delete Failed', error.message);
            }
        });
    });
}

function renderPagination(pagination) {
    const container = document.getElementById('contactsPagination');
    
    if (pagination.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Previous button
    html += `
        <button class="page-btn" data-page="${pagination.page - 1}" 
                ${pagination.page === 1 ? 'disabled' : ''}>
            ← Prev
        </button>
    `;
    
    // Page numbers
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.totalPages, pagination.page + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <button class="page-btn ${i === pagination.page ? 'active' : ''}" 
                    data-page="${i}">
                ${i}
            </button>
        `;
    }
    
    // Next button
    html += `
        <button class="page-btn" data-page="${pagination.page + 1}"
                ${pagination.page === pagination.totalPages ? 'disabled' : ''}>
            Next →
        </button>
    `;
    
    container.innerHTML = html;
    
    // Add click handlers
    container.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.disabled) return;
            
            const page = parseInt(e.target.dataset.page);
            AppState.currentPage = page;
            loadContacts(document.getElementById('contactSearch').value);
        });
    });
}

function updateContactCount(total) {
    document.getElementById('contactCount').textContent = `(${total})`;
}

function updateDeleteButton() {
    const btn = document.getElementById('deleteSelectedBtn');
    const count = AppState.selectedContacts.size;
    
    btn.disabled = count === 0;
    btn.textContent = count > 0 ? `🗑️ Delete Selected (${count})` : '🗑️ Delete Selected';
}

function updateSelectAllState() {
    const selectAllCheckbox = document.getElementById('selectAllContacts');
    const checkboxes = document.querySelectorAll('#contactsTableBody input[type="checkbox"]');
    const allChecked = checkboxes.length > 0 && 
                       Array.from(checkboxes).every(cb => cb.checked);
    
    selectAllCheckbox.checked = allChecked;
}
