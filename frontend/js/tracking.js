/**
 * Tracking Module
 * 
 * Handles email tracking dashboard:
 * - Loading tracking data
 * - Displaying stats
 * - Tracking table with pagination
 * - Export functionality
 */

function initTracking() {
    const refreshBtn = document.getElementById('refreshTrackingBtn');
    
    refreshBtn.addEventListener('click', () => {
        loadTrackingData();
        Toast.info('Refreshed', 'Tracking data updated');
    });
}

async function loadTrackingData() {
    try {
        // Load history
        const historyData = await API.get('/emails/history?limit=50');
        
        if (historyData.success) {
            renderTrackingStats(historyData.stats);
            renderTrackingTable(historyData.emails);
            renderTrackingPagination(historyData.pagination);
        }
    } catch (error) {
        Toast.error('Failed to load tracking data', error.message);
    }
}

function renderTrackingStats(stats) {
    document.getElementById('statTotalSent').textContent = stats.totalSent;
    document.getElementById('statUniqueOpens').textContent = stats.uniqueOpens;
    document.getElementById('statOpenRate').textContent = stats.openRate;
}

function renderTrackingTable(emails) {
    const tbody = document.getElementById('trackingTableBody');
    
    if (emails.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">No emails sent yet. Go to Compose tab to send your first campaign.</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = emails.map(email => {
        const statusClass = email.status === 'sent' ? 'status-sent' : 'status-failed';
        const openCount = email.tracking.openCount;
        const hasOpened = openCount > 0;
        
        return `
            <tr>
                <td>
                    <strong>${escapeHtml(email.contact.firstName)} ${escapeHtml(email.contact.lastName)}</strong>
                </td>
                <td>${escapeHtml(email.contact.email)}</td>
                <td>${escapeHtml(email.contact.companyName || '-')}</td>
                <td title="${escapeHtml(email.subject)}">
                    ${escapeHtml(truncate(email.subject, 30))}
                </td>
                <td>${formatDate(email.sentAt)}</td>
                <td>
                    <span class="status-badge ${statusClass}">
                        ${email.status}
                    </span>
                </td>
                <td style="text-align: center;">
                    <span style="color: ${hasOpened ? 'var(--success)' : 'var(--text-muted)'}; font-weight: ${hasOpened ? '600' : '400'};">
                        ${openCount}
                    </span>
                </td>
                <td>${email.tracking.lastOpened ? formatDate(email.tracking.lastOpened) : '-'}</td>
            </tr>
        `;
    }).join('');
}

function renderTrackingPagination(pagination) {
    const container = document.getElementById('trackingPagination');
    
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
        btn.addEventListener('click', async (e) => {
            if (e.target.disabled) return;
            
            const page = parseInt(e.target.dataset.page);
            
            try {
                const data = await API.get(`/emails/history?page=${page}&limit=50`);
                if (data.success) {
                    renderTrackingTable(data.emails);
                    renderTrackingPagination(data.pagination);
                }
            } catch (error) {
                Toast.error('Failed to load page', error.message);
            }
        });
    });
}

// Utility function to truncate text
function truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
