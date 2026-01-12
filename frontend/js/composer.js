/**
 * Composer Module
 * 
 * Handles email composition:
 * - Recipient selection
 * - Subject and body editing
 * - Variable insertion
 * - Preview functionality
 * - Email sending
 */

function initComposer() {
    // DOM elements
    const selectRecipientsBtn = document.getElementById('selectRecipientsBtn');
    const recipientsModal = document.getElementById('recipientsModal');
    const closeModalBtn = document.getElementById('closeRecipientsModal');
    const cancelRecipientsBtn = document.getElementById('cancelRecipientsBtn');
    const confirmRecipientsBtn = document.getElementById('confirmRecipientsBtn');
    const recipientSearch = document.getElementById('recipientSearch');
    const selectAllRecipients = document.getElementById('selectAllRecipients');
    const recipientsList = document.getElementById('recipientsList');
    const modalSelectedCount = document.getElementById('modalSelectedCount');
    
    const subjectInput = document.getElementById('emailSubject');
    const bodyInput = document.getElementById('emailBody');
    const previewContact = document.getElementById('previewContact');
    const previewSubject = document.getElementById('previewSubject');
    const previewBody = document.getElementById('previewBody');
    
    const sendEmailsBtn = document.getElementById('sendEmailsBtn');
    const sendCount = document.getElementById('sendCount');
    
    const sendProgressModal = document.getElementById('sendProgressModal');
    const sendProgressFill = document.getElementById('sendProgressFill');
    const sendProgressText = document.getElementById('sendProgressText');
    const sendResults = document.getElementById('sendResults');
    const sendResultIcon = document.getElementById('sendResultIcon');
    const sendResultMessage = document.getElementById('sendResultMessage');
    const sendResultDetails = document.getElementById('sendResultDetails');
    const sendResultsFooter = document.getElementById('sendResultsFooter');
    const closeSendModalBtn = document.getElementById('closeSendModalBtn');
    
    // Temporary selection state for modal
    let tempSelectedRecipients = new Set();
    
    // Open recipients modal
    selectRecipientsBtn.addEventListener('click', () => {
        tempSelectedRecipients = new Set(AppState.selectedRecipients);
        renderRecipientsList();
        updateModalSelectedCount();
        recipientsModal.classList.add('active');
    });
    
    // Close modal handlers
    closeModalBtn.addEventListener('click', closeRecipientsModal);
    cancelRecipientsBtn.addEventListener('click', closeRecipientsModal);
    
    recipientsModal.querySelector('.modal-backdrop').addEventListener('click', closeRecipientsModal);
    
    function closeRecipientsModal() {
        recipientsModal.classList.remove('active');
    }
    
    // Confirm selection
    confirmRecipientsBtn.addEventListener('click', () => {
        AppState.selectedRecipients = new Set(tempSelectedRecipients);
        updateRecipientsDisplay();
        updateSendButton();
        closeRecipientsModal();
    });
    
    // Search recipients
    recipientSearch.addEventListener('input', debounce((e) => {
        renderRecipientsList(e.target.value);
    }, 200));
    
    // Select all recipients
    selectAllRecipients.addEventListener('change', (e) => {
        const filteredContacts = getFilteredContacts(recipientSearch.value);
        
        if (e.target.checked) {
            filteredContacts.forEach(c => tempSelectedRecipients.add(c.id));
        } else {
            filteredContacts.forEach(c => tempSelectedRecipients.delete(c.id));
        }
        
        renderRecipientsList(recipientSearch.value);
        updateModalSelectedCount();
    });
    
    function getFilteredContacts(search = '') {
        if (!search) return AppState.contacts;
        
        const searchLower = search.toLowerCase();
        return AppState.contacts.filter(c => 
            c.first_name.toLowerCase().includes(searchLower) ||
            c.last_name.toLowerCase().includes(searchLower) ||
            c.email.toLowerCase().includes(searchLower) ||
            (c.company_name && c.company_name.toLowerCase().includes(searchLower))
        );
    }
    
    function renderRecipientsList(search = '') {
        const filtered = getFilteredContacts(search);
        
        if (filtered.length === 0) {
            recipientsList.innerHTML = '<div class="empty-state" style="padding: 2rem; text-align: center; color: var(--text-muted);">No contacts found</div>';
            return;
        }
        
        recipientsList.innerHTML = filtered.map(contact => `
            <div class="recipient-item ${tempSelectedRecipients.has(contact.id) ? 'selected' : ''}"
                 data-id="${contact.id}">
                <input type="checkbox" 
                       ${tempSelectedRecipients.has(contact.id) ? 'checked' : ''}>
                <div class="recipient-item-info">
                    <div class="recipient-item-name">
                        ${escapeHtml(contact.first_name)} ${escapeHtml(contact.last_name)}
                    </div>
                    <div class="recipient-item-email">
                        ${escapeHtml(contact.email)}
                        ${contact.company_name ? `• ${escapeHtml(contact.company_name)}` : ''}
                    </div>
                </div>
            </div>
        `).join('');
        
        // Add click handlers
        recipientsList.querySelectorAll('.recipient-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                
                const contactId = parseInt(item.dataset.id);
                const checkbox = item.querySelector('input[type="checkbox"]');
                
                checkbox.checked = !checkbox.checked;
                
                if (checkbox.checked) {
                    tempSelectedRecipients.add(contactId);
                    item.classList.add('selected');
                } else {
                    tempSelectedRecipients.delete(contactId);
                    item.classList.remove('selected');
                }
                
                updateModalSelectedCount();
            });
            
            item.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                const contactId = parseInt(item.dataset.id);
                
                if (e.target.checked) {
                    tempSelectedRecipients.add(contactId);
                    item.classList.add('selected');
                } else {
                    tempSelectedRecipients.delete(contactId);
                    item.classList.remove('selected');
                }
                
                updateModalSelectedCount();
            });
        });
    }
    
    function updateModalSelectedCount() {
        modalSelectedCount.textContent = `${tempSelectedRecipients.size} selected`;
        
        // Update select all checkbox state
        const filtered = getFilteredContacts(recipientSearch.value);
        const allSelected = filtered.length > 0 && 
                           filtered.every(c => tempSelectedRecipients.has(c.id));
        selectAllRecipients.checked = allSelected;
    }
    
    function updateRecipientsDisplay() {
        const count = AppState.selectedRecipients.size;
        const recipientsInfo = document.getElementById('recipientsInfo');
        const selectedList = document.getElementById('selectedRecipientsList');
        
        recipientsInfo.querySelector('.recipient-count').textContent = 
            `${count} contact${count !== 1 ? 's' : ''} selected`;
        
        // Show selected recipients as tags
        if (count > 0 && count <= 10) {
            const selected = AppState.contacts.filter(c => 
                AppState.selectedRecipients.has(c.id)
            );
            
            selectedList.innerHTML = selected.map(c => `
                <span class="recipient-tag" data-id="${c.id}">
                    ${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}
                    <button onclick="removeRecipient(${c.id})">&times;</button>
                </span>
            `).join('');
        } else if (count > 10) {
            selectedList.innerHTML = `
                <span class="recipient-tag">
                    ${count} recipients selected
                </span>
            `;
        } else {
            selectedList.innerHTML = '';
        }
    }
    
    // Global function to remove recipient
    window.removeRecipient = function(contactId) {
        AppState.selectedRecipients.delete(contactId);
        updateRecipientsDisplay();
        updateSendButton();
    };
    
    // Variable buttons
    document.querySelectorAll('.var-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const variable = btn.dataset.var;
            const activeElement = document.activeElement;
            
            // Insert into focused field
            if (activeElement === subjectInput || activeElement === bodyInput) {
                insertAtCursor(activeElement, variable);
                updatePreview();
            } else {
                // Default to subject if nothing focused
                subjectInput.focus();
                insertAtCursor(subjectInput, variable);
                updatePreview();
            }
        });
    });
    
    function insertAtCursor(field, text) {
        const start = field.selectionStart;
        const end = field.selectionEnd;
        const value = field.value;
        
        field.value = value.substring(0, start) + text + value.substring(end);
        field.selectionStart = field.selectionEnd = start + text.length;
        field.focus();
    }
    
    // Preview updates
    subjectInput.addEventListener('input', updatePreview);
    bodyInput.addEventListener('input', updatePreview);
    previewContact.addEventListener('change', updatePreview);
    
    function updatePreview() {
        const contactId = parseInt(previewContact.value);
        const subject = subjectInput.value;
        const body = bodyInput.value;
        
        if (!contactId) {
            previewSubject.textContent = personalizeText(subject, {
                first_name: 'John',
                last_name: 'Doe',
                company_name: 'Acme Corp'
            });
            previewBody.innerHTML = personalizeText(body, {
                first_name: 'John',
                last_name: 'Doe',
                company_name: 'Acme Corp'
            });
            return;
        }
        
        const contact = AppState.contacts.find(c => c.id === contactId);
        
        if (contact) {
            previewSubject.textContent = personalizeText(subject, contact);
            previewBody.innerHTML = personalizeText(body, contact);
        }
    }
    
    function personalizeText(text, contact) {
        if (!text) return text;
        
        return text
            .replace(/\{first_name\}/gi, contact.first_name || '')
            .replace(/\{last_name\}/gi, contact.last_name || '')
            .replace(/\{company_name\}/gi, contact.company_name || '');
    }
    
    function updateSendButton() {
        const recipientCount = AppState.selectedRecipients.size;
        const hasSubject = subjectInput.value.trim().length > 0;
        const hasBody = bodyInput.value.trim().length > 0;
        
        sendCount.textContent = recipientCount;
        sendEmailsBtn.disabled = !(recipientCount > 0 && hasSubject && hasBody);
    }
    
    // Update send button on input changes
    subjectInput.addEventListener('input', updateSendButton);
    bodyInput.addEventListener('input', updateSendButton);
    
    // Send emails
    sendEmailsBtn.addEventListener('click', sendEmails);
    
    async function sendEmails() {
        const contactIds = Array.from(AppState.selectedRecipients);
        const subject = subjectInput.value.trim();
        const body = bodyInput.value.trim();
        
        if (contactIds.length === 0) {
            Toast.error('No Recipients', 'Please select at least one recipient');
            return;
        }
        
        // Validate quota
        if (contactIds.length > AppState.quota.remaining) {
            Toast.error(
                'Quota Exceeded',
                `You can only send ${AppState.quota.remaining} more emails today. You selected ${contactIds.length}.`
            );
            return;
        }
        
        // Show progress modal
        sendProgressModal.classList.add('active');
        sendResults.classList.add('hidden');
        sendResultsFooter.classList.add('hidden');
        document.querySelector('#sendProgressModal .send-progress').classList.remove('hidden');
        sendProgressFill.style.width = '0%';
        sendProgressText.textContent = 'Validating request...';
        
        try {
            // Validate first
            sendProgressText.textContent = 'Checking quota...';
            sendProgressFill.style.width = '20%';
            
            const validation = await API.post('/emails/validate', { contactIds });
            
            if (!validation.canSend) {
                throw new Error(validation.reasons.map(r => r.message).join('. '));
            }
            
            // Send emails
            sendProgressText.textContent = `Sending ${contactIds.length} emails...`;
            sendProgressFill.style.width = '50%';
            
            const result = await API.post('/emails/send', {
                contactIds,
                subject,
                body
            });
            
            sendProgressFill.style.width = '100%';
            sendProgressText.textContent = 'Complete!';
            
            // Show results
            setTimeout(() => {
                showSendResults(result);
            }, 500);
            
            // Refresh quota
            loadQuota();
            
            // Clear selection
            AppState.selectedRecipients.clear();
            updateRecipientsDisplay();
            updateSendButton();
            
        } catch (error) {
            showSendError(error.message);
        }
    }
    
    function showSendResults(result) {
        sendResults.classList.remove('hidden');
        sendResultsFooter.classList.remove('hidden');
        document.querySelector('#sendProgressModal .send-progress').classList.add('hidden');
        
        const { successful, failed } = result.results;
        
        if (failed === 0) {
            sendResultIcon.textContent = '✅';
            sendResultMessage.textContent = `Successfully sent ${successful} emails!`;
        } else if (successful === 0) {
            sendResultIcon.textContent = '❌';
            sendResultMessage.textContent = 'All emails failed to send';
        } else {
            sendResultIcon.textContent = '⚠️';
            sendResultMessage.textContent = `Sent ${successful} emails, ${failed} failed`;
        }
        
        // Show details
        let details = '';
        
        if (result.failed && result.failed.length > 0) {
            details = '<div style="margin-top: 1rem; text-align: left;">';
            details += '<strong>Failed:</strong><ul style="margin: 0.5rem 0; padding-left: 1.5rem;">';
            result.failed.slice(0, 5).forEach(f => {
                details += `<li>${escapeHtml(f.email)}: ${escapeHtml(f.error)}</li>`;
            });
            if (result.failed.length > 5) {
                details += `<li>...and ${result.failed.length - 5} more</li>`;
            }
            details += '</ul></div>';
        }
        
        if (result.warnings && result.warnings.length > 0) {
            details += '<div style="margin-top: 0.5rem; color: var(--warning);">';
            details += result.warnings.join('<br>');
            details += '</div>';
        }
        
        sendResultDetails.innerHTML = details;
    }
    
    function showSendError(message) {
        sendResults.classList.remove('hidden');
        sendResultsFooter.classList.remove('hidden');
        document.querySelector('#sendProgressModal .send-progress').classList.add('hidden');
        
        sendResultIcon.textContent = '❌';
        sendResultMessage.textContent = 'Failed to send emails';
        sendResultDetails.innerHTML = `<p style="color: var(--danger);">${escapeHtml(message)}</p>`;
    }
    
    closeSendModalBtn.addEventListener('click', () => {
        sendProgressModal.classList.remove('active');
        document.querySelector('#sendProgressModal .send-progress').classList.remove('hidden');
    });
}

// Update preview contact select when contacts change
function updatePreviewContactSelect() {
    const select = document.getElementById('previewContact');
    
    select.innerHTML = '<option value="">Select a contact to preview</option>';
    
    AppState.contacts.slice(0, 20).forEach(contact => {
        select.innerHTML += `
            <option value="${contact.id}">
                ${escapeHtml(contact.first_name)} ${escapeHtml(contact.last_name)} (${escapeHtml(contact.email)})
            </option>
        `;
    });
}
