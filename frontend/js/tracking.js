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
        loadAnalytics();
        Toast.info('Refreshed', 'Tracking data updated');
    });

    // Load analytics on init
    loadAnalytics();
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

async function loadAnalytics() {
    try {
        const data = await API.get('/track/summary');

        if (data.success) {
            const { summary } = data;

            // Update avg time to open
            if (summary.overall.avgTimeToOpen) {
                document.getElementById('statAvgTimeToOpen').textContent = summary.overall.avgTimeToOpen + ' min';
            }

            // Render device breakdown
            const deviceDiv = document.getElementById('deviceBreakdown');
            if (summary.deviceBreakdown && summary.deviceBreakdown.length > 0) {
                deviceDiv.innerHTML = summary.deviceBreakdown
                    .map(d => `<div style="margin: 4px 0;">${d.device_type}: <strong>${d.count}</strong></div>`)
                    .join('');
            } else {
                deviceDiv.innerHTML = 'No data yet';
            }

            // Render client breakdown
            const clientDiv = document.getElementById('clientBreakdown');
            if (summary.clientBreakdown && summary.clientBreakdown.length > 0) {
                clientDiv.innerHTML = summary.clientBreakdown
                    .map(c => `<div style="margin: 4px 0;">${c.email_client}: <strong>${c.count}</strong></div>`)
                    .join('');
            } else {
                clientDiv.innerHTML = 'No data yet';
            }

            // Render best open times
            const timesDiv = document.getElementById('bestOpenTimes');
            if (summary.bestOpenTimes && summary.bestOpenTimes.length > 0) {
                timesDiv.innerHTML = summary.bestOpenTimes
                    .map(t => `<div style="margin: 4px 0;">${t.hour}:00 - ${parseInt(t.hour)+1}:00: <strong>${t.count} opens</strong></div>`)
                    .join('');
            } else {
                timesDiv.innerHTML = 'No data yet';
            }
        }
    } catch (error) {
        console.error('Failed to load analytics:', error);
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
            <tr onclick="showOpenDetails('${email.trackingId}')" style="cursor: pointer;" title="Click to view open details">
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
                <td>${email.tracking.lastOpened ? formatDate(email.tracking.lastOpened) : 'Not opened'}</td>
            </tr>
        `;
    }).join('');
}

async function showOpenDetails(trackingId) {
    try {
        const data = await API.get(`/track/stats/${trackingId}`);

        if (!data.success) {
            Toast.error('Failed to load details', data.error);
            return;
        }

        const { email, tracking } = data;

        let detailsHtml = `
            <div style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 10px;">Email Details</h3>
                <p><strong>Recipient:</strong> ${escapeHtml(email.recipient.name)} (${escapeHtml(email.recipient.email)})</p>
                <p><strong>Subject:</strong> ${escapeHtml(email.subject)}</p>
                <p><strong>Sent:</strong> ${formatDate(email.sentAt)}</p>
            </div>

            <div style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 10px;">Summary</h3>
                <p><strong>Total Opens:</strong> ${tracking.totalOpens}</p>
                ${tracking.timeToOpen !== null ? `<p><strong>Time to First Open:</strong> ${tracking.timeToOpen} minutes</p>` : ''}
                <p><strong>First Opened:</strong> ${tracking.firstOpened ? formatDate(tracking.firstOpened) : 'Not opened'}</p>
                <p><strong>Last Opened:</strong> ${tracking.lastOpened ? formatDate(tracking.lastOpened) : 'Not opened'}</p>
            </div>

            ${tracking.totalOpens > 0 ? `
            <div style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 10px;">Device Breakdown</h3>
                <p>${Object.entries(tracking.deviceBreakdown).map(([device, count]) => `${device}: ${count}`).join(', ')}</p>
            </div>

            <div style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 10px;">Email Client Breakdown</h3>
                <p>${Object.entries(tracking.clientBreakdown).map(([client, count]) => `${client}: ${count}`).join(', ')}</p>
            </div>
            ` : ''}

            <div>
                <h3 style="margin-bottom: 10px;">Open History</h3>
        `;

        if (tracking.totalOpens === 0) {
            detailsHtml += '<p style="color: var(--text-muted);">This email has not been opened yet.</p>';
        } else {
            detailsHtml += '<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">';
            detailsHtml += '<thead><tr style="border-bottom: 1px solid var(--border);"><th style="text-align: left; padding: 8px;">Opened At</th><th style="text-align: left; padding: 8px;">Device</th><th style="text-align: left; padding: 8px;">Client</th><th style="text-align: left; padding: 8px;">IP Address</th></tr></thead>';
            detailsHtml += '<tbody>';

            tracking.opens.forEach(open => {
                detailsHtml += `
                    <tr style="border-bottom: 1px solid var(--border-light);">
                        <td style="padding: 8px;">${formatDate(open.openedAt)}</td>
                        <td style="padding: 8px;">${open.deviceType}</td>
                        <td style="padding: 8px;">${open.emailClient}</td>
                        <td style="padding: 8px; font-size: 12px;">${open.ipAddress}</td>
                    </tr>
                `;
            });

            detailsHtml += '</tbody></table>';
        }

        detailsHtml += '</div>';

        // Show modal (assuming you have a modal system)
        showModal('Open Tracking Details', detailsHtml);

    } catch (error) {
        Toast.error('Failed to load details', error.message);
    }
}

function showModal(title, content) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('trackingModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'trackingModal';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        `;
        modal.innerHTML = `
            <div style="background: white; border-radius: 8px; padding: 24px; max-width: 600px; max-height: 80vh; overflow-y: auto; position: relative;">
                <button onclick="closeModal()" style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                <div id="modalContent"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    document.getElementById('modalContent').innerHTML = `<h2 style="margin-bottom: 20px;">${title}</h2>${content}`;
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('trackingModal');
    if (modal) modal.style.display = 'none';
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
