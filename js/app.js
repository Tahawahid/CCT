// ===== CONFIGURATION =====
// TODO: Replace with your Google Apps Script Web App URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzKg6VF7fpH2EvpzFv4NzdRJkzgSBs2syQ2pZt2DZD8IjoHIG5RtaikBcYMW9cEiJJu5w/exec';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
const DEBOUNCE_DELAY = 1000; // 1 second debounce for saves

// ===== APPLICATION STATE =====
let currentClientIndex = 0;
let clients = [];
let taskTemplates = [];
let filteredClients = [];
let saveTimeout = null;
let isSyncing = false;
let lastSyncTime = null;
let undoStack = []; // History stack for undo functionality
const MAX_UNDO_HISTORY = 10;

// ===== MOCK DATA (Fallback - used only if Google Sheets unavailable) =====
// ===== MOCK DATA (Removed for production) =====
// const mockClients = []; // Mock data removed to ensure fresh start


// Task templates that you can edit/add to
const mockTaskTemplates = [
    {
        id: "template-1",
        name: "Schedule Inspection",
        category: "inspection",
        stageRequired: "any",
        description: "Schedule official inspection with city/municipality",
        subtasks: ["Call inspector", "Email schedule", "Confirm date"],
        defaultUrgency: 80,
        timeEstimate: 45
    },
    {
        id: "template-2",
        name: "Material Order",
        category: "material",
        stageRequired: "any",
        description: "Order construction materials for current stage",
        subtasks: ["Check inventory", "Place order", "Schedule delivery"],
        defaultUrgency: 60,
        timeEstimate: 30
    },
    {
        id: "template-3",
        name: "Client Update Call",
        category: "contact",
        stageRequired: "any",
        description: "Update client on progress and gather feedback",
        subtasks: ["Prepare update", "Schedule call", "Send follow-up"],
        defaultUrgency: 40,
        timeEstimate: 30
    },
    {
        id: "template-4",
        name: "Permit Application",
        category: "document",
        stageRequired: "pre-con",
        description: "Submit permit applications for next stage",
        subtasks: ["Gather documents", "Complete forms", "Submit application"],
        defaultUrgency: 90,
        timeEstimate: 120
    }
];

// ===== GOOGLE SHEETS API FUNCTIONS =====
async function loadFromSheets() {
    try {
        updateSyncStatus('syncing', 'Syncing...');
        const lastSync = localStorage.getItem('lastSync');
        const now = Date.now();

        // Check if we need to sync (never synced or >5 minutes old)
        if (lastSync && (now - parseInt(lastSync)) < SYNC_INTERVAL && clients.length > 0) {
            updateSyncStatus('success', 'Synced (cached)');
            return;
        }

        if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL') {
            throw new Error('Apps Script URL not configured');
        }

        const response = await fetch(APPS_SCRIPT_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const sheetData = await response.json();

        // Transform sheet data to client format
        clients = sheetData.map(transformSheetDataToClient).filter(c => c !== null);

        // Save to localStorage as backup
        localStorage.setItem('clients', JSON.stringify(clients));
        localStorage.setItem('lastSync', now.toString());
        lastSyncTime = now;

        updateSyncStatus('success', 'Synced just now');

        console.log(`✅ Loaded ${clients.length} clients from Google Sheets`);
        return clients;
    } catch (error) {
        console.error('Failed to load from Google Sheets:', error);
        updateSyncStatus('error', 'Sync failed');

        // Fallback to localStorage
        const savedClients = localStorage.getItem('clients');
        if (savedClients) {
            clients = JSON.parse(savedClients);
            updateSyncStatus('success', 'Using local cache');
            console.log('Using cached data from localStorage');
        } else {
            // Start fresh if nothing saved
            clients = [];
            updateSyncStatus('neutral', 'Ready to add clients');
            console.log('Starting with empty client list');
        }
        return clients;
    }
}

async function saveToSheets(client, immediate = false) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL') {
        console.warn('Apps Script URL not configured - saving to localStorage only');
        saveToLocalStorage(client);
        return { success: false, error: 'Apps Script URL not configured' };
    }

    // Debounce saves (unless immediate flag is set)
    if (!immediate && saveTimeout) {
        clearTimeout(saveTimeout);
    }

    return new Promise((resolve) => {
        const saveFn = async () => {
            try {
                updateSyncStatus('syncing', 'Saving...');

                // Transform client data to sheet format
                const sheetData = transformClientToSheetData(client);

                const response = await fetch(APPS_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors', // Added to fix CORS issue
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sheetData)
                });

                // With no-cors, we can't check response.ok or read the body, so we assume success if no error thrown
                // Update local cache
                saveToLocalStorage(client);
                localStorage.setItem('lastSync', Date.now().toString());
                lastSyncTime = Date.now();

                updateSyncStatus('success', 'Saved just now');
                resolve({ success: true });
            } catch (error) {
                console.error('Save failed:', error);
                updateSyncStatus('error', 'Save failed');

                // Save to localStorage as backup
                saveToLocalStorage(client);
                resolve({ success: false, error: error.message });
            }
        };

        if (immediate) {
            saveFn();
        } else {
            saveTimeout = setTimeout(saveFn, DEBOUNCE_DELAY);
        }
    });
}

function saveToLocalStorage(client) {
    const index = clients.findIndex(c => c.id === client.id);
    if (index >= 0) {
        clients[index] = client;
    } else {
        clients.push(client);
    }
    localStorage.setItem('clients', JSON.stringify(clients));
}

function updateSyncStatus(status, message) {
    const syncStatus = document.getElementById('sync-status');
    const lastSync = document.getElementById('last-sync');

    syncStatus.className = status;
    lastSync.textContent = message;
}

// Transform Google Sheets row data to client object
function transformSheetDataToClient(row) {
    try {
        if (!row.ID || !row.Name) return null;

        // Parse current task if it exists
        let currentTask = null;
        if (row.CurrentTaskName) {
            currentTask = {
                id: row.CurrentTaskName.split(' ')[0] || `TASK-${row.ID}`,
                name: row.CurrentTaskName,
                category: row.CurrentTaskCategory || 'general',
                subtasks: row.CurrentTaskSubtasks ? row.CurrentTaskSubtasks.split(',').map(s => s.trim()) : [],
                currentSubtask: 0,
                description: row.CurrentTaskDescription || '',
                created: row.CurrentTaskCreated || new Date().toISOString().split('T')[0],
                due: row.CurrentTaskDue || new Date().toISOString().split('T')[0],
                timeEstimate: parseInt(row.CurrentTaskTime) || 30,
                contact: row.CurrentTaskContact || '',
                defaultUrgency: parseInt(row.Urgency) || 50
            };
        }

        // Parse attached clients
        const attachedClients = row.AttachedClients ?
            row.AttachedClients.split(',').map(id => id.trim()).filter(id => id).map(id => {
                // Find client by ID if available
                const attached = clients.find(c => c.id.toString() === id);
                return attached || { id: id, name: `Client ${id}`, urgency: 0, stage: 'Unknown', location: '' };
            }) : [];

        // Calculate stage progress if dates available
        let stageProgress = 0;
        if (row.StageStart && row.StageEnd) {
            const start = new Date(row.StageStart);
            const end = new Date(row.StageEnd);
            const today = new Date();
            const total = end - start;
            const elapsed = today - start;
            stageProgress = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
        }

        return {
            id: parseInt(row.ID) || row.ID,
            name: row.Name,
            phone: row.Phone || '',
            urgency: parseInt(row.Urgency) || 50,
            stage: row.Stage || 'Pre-Con',
            pipelineStage: row.PipelineStage || 'Lead', // Default to 'Lead' if new
            stageProgress: stageProgress,
            stageStart: row.StageStart || new Date().toISOString().split('T')[0],
            stageEnd: row.StageEnd || new Date().toISOString().split('T')[0],
            location: row.Location || '',
            status: row.Status || 'active',
            readyToTransfer: row.ReadyToTransfer === true || row.ReadyToTransfer === 'TRUE' || row.ReadyToTransfer === 'true',
            transferSystems: row.ReadyToTransfer ? ['accounting', 'crm', 'warranty', 'maintenance'] : [],
            transferredTo: row.TransferredTo || '',
            currentTask: currentTask,
            attachedClients: attachedClients,
            customFields: row.CustomFields ? JSON.parse(row.CustomFields) : {},
            notes: row.Notes || '',
            lastUpdated: row.LastUpdated || new Date().toISOString().split('T')[0]
        };
    } catch (error) {
        console.error('Error transforming sheet data:', error, row);
        return null;
    }
}

// Transform client object to Google Sheets row format
function transformClientToSheetData(client) {
    return {
        ID: client.id,
        Name: client.name,
        Phone: client.phone || '',
        Urgency: client.urgency,
        Stage: client.stage,
        PipelineStage: client.pipelineStage || 'Construction',
        StageStart: client.stageStart,
        StageEnd: client.stageEnd,
        Location: client.location,
        Status: client.status,
        ReadyToTransfer: client.readyToTransfer,
        TransferredTo: client.transferredTo || '',
        CurrentTaskName: client.currentTask ? client.currentTask.name : '',
        CurrentTaskSubtasks: client.currentTask ? client.currentTask.subtasks.join(', ') : '',
        CurrentTaskDescription: client.currentTask ? client.currentTask.description : '',
        CurrentTaskDue: client.currentTask ? client.currentTask.due : '',
        CurrentTaskCreated: client.currentTask ? client.currentTask.created : '',
        CurrentTaskTime: client.currentTask ? client.currentTask.timeEstimate : 0,
        CurrentTaskContact: client.currentTask ? client.currentTask.contact : '',
        CurrentTaskCategory: client.currentTask ? client.currentTask.category : '',
        AttachedClients: client.attachedClients ? client.attachedClients.map(ac => ac.id).join(', ') : '',
        CustomFields: JSON.stringify(client.customFields || {}),
        Notes: client.notes || '',
        LastUpdated: new Date().toISOString()
    };
}

// ===== UTILITY FUNCTIONS =====
function getUrgencyColor(urgency) {
    if (urgency >= 81) return "var(--urgency-90)";
    if (urgency >= 21) return "var(--urgency-50)";
    return "var(--urgency-10)";
}

function getUrgencyClass(urgency) {
    if (urgency >= 81) return "urgency-high";
    if (urgency >= 21) return "urgency-medium";
    return "urgency-low";
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function calculateDaysRemaining(endDate) {
    const today = new Date();
    const end = new Date(endDate);
    const diffTime = end - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ===== CORE APPLICATION FUNCTIONS =====
async function initApp() {
    // Load clients from Google Sheets
    await loadFromSheets();

    // Load task templates (using mock for now - can be extended to load from sheets)
    taskTemplates = [...mockTaskTemplates];

    filteredClients = [...clients];

    renderClientQueue();
    renderCurrentClient();
    updateStats();
    setupEventListeners();

    // Set up periodic sync check
    setInterval(checkSync, SYNC_INTERVAL);

    console.log("✅ Application initialized with all features:");
    console.log("   • 0-100 urgency scale");
    console.log("   • Task template system");
    console.log("   • Cross-app transfer ready");
    console.log("   • Formula-driven timelines");
    console.log("   • Google Sheets integration");
}

async function checkSync() {
    const lastSync = localStorage.getItem('lastSync');
    if (lastSync) {
        const elapsed = Date.now() - parseInt(lastSync);
        if (elapsed >= SYNC_INTERVAL) {
            await loadFromSheets();
            renderClientQueue();
            renderCurrentClient();
            updateStats();
        }
    }
}

// ===== UNDO FUNCTIONALITY =====
function saveStateForUndo(client) {
    // Deep copy client to preserve state
    const clientState = JSON.parse(JSON.stringify(client));
    undoStack.push(clientState);
    if (undoStack.length > MAX_UNDO_HISTORY) {
        undoStack.shift(); // Remove oldest history
    }
    updateUndoButton();
}

async function undoLastAction() {
    if (undoStack.length === 0) return;

    const previousState = undoStack.pop();

    // Find current index of this client
    const index = clients.findIndex(c => c.id === previousState.id);
    if (index !== -1) {
        clients[index] = previousState;

        // Also update filtered clients if applicable
        const filteredIndex = filteredClients.findIndex(c => c.id === previousState.id);
        if (filteredIndex !== -1) {
            filteredClients[filteredIndex] = previousState;
        }

        await saveToSheets(previousState, true); // Save the restored state immediately

        renderCurrentClient();
        renderClientQueue();
        updateStats();
        updateUndoButton();
        alert('Action undone!');
    }
}

function updateUndoButton() {
    const btn = document.getElementById('btn-undo');
    if (btn) {
        btn.style.display = undoStack.length > 0 ? 'flex' : 'none';
        btn.innerHTML = `<span>↩️ Undo (${undoStack.length})</span>`;
    }
}

function renderClientQueue() {
    const queueContainer = document.getElementById('client-queue');
    const queueCount = document.getElementById('queue-count');

    // Apply filters
    const minUrgency = parseInt(document.getElementById('urgency-filter').value);
    const stageFilter = document.getElementById('stage-filter').value;
    const showTransferred = document.getElementById('show-transferred').checked;
    const showCompleted = document.getElementById('show-completed').checked;
    const searchQuery = document.getElementById('search-input') ? document.getElementById('search-input').value.toLowerCase() : '';

    filteredClients = clients.filter(client => {
        // Search filter
        if (searchQuery) {
            const searchMatch =
                client.name.toLowerCase().includes(searchQuery) ||
                (client.phone && client.phone.includes(searchQuery)) ||
                client.location.toLowerCase().includes(searchQuery);
            if (!searchMatch) return false;
        }

        // Urgency filter
        if (minUrgency > 0 && client.urgency < minUrgency) return false;

        // Stage filter
        if (stageFilter !== 'all' && client.stage.toLowerCase() !== stageFilter) return false;

        // Status filters
        if (!showTransferred && client.status === 'transferred') return false;
        if (!showCompleted && client.status === 'completed') return false;

        return true;
    });

    // Sort by urgency (highest first)
    filteredClients.sort((a, b) => b.urgency - a.urgency);

    // Update current index if needed
    if (currentClientIndex >= filteredClients.length) {
        currentClientIndex = Math.max(0, filteredClients.length - 1);
    }

    // Render queue
    queueContainer.innerHTML = '';
    filteredClients.forEach((client, index) => {
        const isActive = index === currentClientIndex;
        const queueItem = document.createElement('div');
        queueItem.className = `queue-item ${isActive ? 'active' : ''} animate-in`;
        queueItem.style.animationDelay = `${index * 0.05}s`;

        queueItem.innerHTML = `
            <div class="queue-item-header">
                <div class="queue-client-name">${client.name}</div>
                <div class="queue-urgency" style="background: ${getUrgencyColor(client.urgency)}; color: white;">
                    ${client.urgency}
                </div>
            </div>
            <div class="queue-item-meta">
                <span>${client.stage}</span>
                <span>•</span>
                <span>${client.location}</span>
                <span>•</span>
                <span>${client.status === 'transferred' ? 'Transferred' : 'Active'}</span>
            </div>
            ${client.readyToTransfer ? '<div class="queue-transfer-tag">Ready to Transfer</div>' : ''}
        `;

        queueItem.addEventListener('click', async () => {
            currentClientIndex = index;
            renderCurrentClient();
            renderClientQueue();

            // Save selection preference (optional)
            const client = filteredClients[currentClientIndex];
            if (client) {
                await saveToSheets(client);
            }
        });

        queueContainer.appendChild(queueItem);
    });

    queueCount.textContent = filteredClients.length;
}

function renderCurrentClient() {
    if (filteredClients.length === 0) {
        document.getElementById('client-name').textContent = "No clients found";

        // Clear/Hide details when no clients exist
        const elementsToClear = ['client-stage', 'client-location', 'client-urgency', 'task-main', 'task-description', 'task-due', 'task-created', 'task-time', 'task-contact', 'task-id'];
        elementsToClear.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });

        document.getElementById('urgency-fill').style.width = '0%';
        document.getElementById('client-tags').style.display = 'none';
        document.getElementById('task-subtasks').innerHTML = '';
        document.getElementById('attached-list').innerHTML = '';
        document.getElementById('client-notes').value = '';

        // Hide action panels
        document.getElementById('transfer-panel').style.display = 'none';
        document.getElementById('complete-panel').style.display = 'none';

        return;
    }

    // Ensure tags are visible again
    document.getElementById('client-tags').style.display = 'flex';

    const client = filteredClients[currentClientIndex];

    // Update header
    const nameEl = document.getElementById('client-name');
    if (nameEl) nameEl.textContent = client.name;

    const stageEl = document.getElementById('client-stage');
    if (stageEl) stageEl.textContent = client.stage;

    const locationEl = document.getElementById('client-location');
    if (locationEl) locationEl.textContent = client.location;

    const phoneEl = document.getElementById('client-phone');
    if (phoneEl) {
        if (client.phone) {
            phoneEl.textContent = `📞 ${client.phone}`;
            phoneEl.style.display = 'inline-block';
        } else {
            phoneEl.style.display = 'none';
        }
    }

    const urgencyEl = document.getElementById('client-urgency');
    if (urgencyEl) urgencyEl.textContent = client.urgency;

    // Update urgency bar
    const urgencyFill = document.getElementById('urgency-fill');
    urgencyFill.style.width = `${client.urgency}%`;
    urgencyFill.style.background = getUrgencyColor(client.urgency);

    // Render Custom Fields
    const customFieldsContainer = document.getElementById('custom-fields-container');
    if (customFieldsContainer) {
        customFieldsContainer.innerHTML = '';
        if (client.customFields && Object.keys(client.customFields).length > 0) {
            Object.entries(client.customFields).forEach(([key, value]) => {
                const fieldDiv = document.createElement('div');
                fieldDiv.style.background = 'var(--gray-50)';
                fieldDiv.style.padding = '8px';
                fieldDiv.style.borderRadius = '6px';
                fieldDiv.style.border = '1px solid var(--gray-200)';
                fieldDiv.style.cursor = 'pointer';
                fieldDiv.innerHTML = `
                    <div style="font-size: 0.75rem; color: var(--gray-600); font-weight: 600;">${key}</div>
                    <div style="font-size: 0.95rem;">${value}</div>
                `;

                // Allow editing on click
                fieldDiv.addEventListener('click', async () => {
                    const newValue = prompt(`Update ${key}:`, value);
                    if (newValue !== null && newValue !== value) {
                        saveStateForUndo(client);
                        client.customFields[key] = newValue;
                        client.lastUpdated = new Date().toISOString().split('T')[0];
                        await saveToSheets(client);
                        renderCurrentClient();
                    }
                });

                customFieldsContainer.appendChild(fieldDiv);
            });
        } else {
            customFieldsContainer.innerHTML = '<div style="grid-column: 1 / -1; color: var(--gray-500); font-style: italic; font-size: 0.9rem;">No custom fields added yet.</div>';
        }
    }

    // Update tags
    const tagsContainer = document.getElementById('client-tags');
    tagsContainer.innerHTML = `
        <span class="tag tag-stage">${client.stage}</span>
        <span class="tag tag-location">${client.location}</span>
        ${client.phone ? `<span class="tag tag-phone" style="background: var(--gray-100); color: var(--gray-700); border: 1px solid var(--gray-300);">📞 ${client.phone}</span>` : ''}
        ${client.readyToTransfer ? '<span class="tag tag-transfer">Ready to Transfer</span>' : ''}
        ${client.status === 'transferred' ? '<span class="tag tag-completed">Transferred</span>' : ''}
    `;

    // Update timeline
    const progress = client.stageProgress || 0;
    document.getElementById('stage-progress-fill').style.width = `${progress}%`;

    const daysRemaining = calculateDaysRemaining(client.stageEnd);
    document.getElementById('timeline-progress').textContent =
        `Day ${Math.round(progress / 100 * 14)} of 14 • ${progress}% Complete • ${daysRemaining} days left`;

    // Update current task
    if (client.currentTask) {
        const task = client.currentTask;
        document.getElementById('task-main').textContent = task.name;
        document.getElementById('task-category').textContent =
            `${client.stage} • ${task.category.charAt(0).toUpperCase() + task.category.slice(1)}`;
        document.getElementById('task-description').textContent = task.description;
        document.getElementById('task-due').textContent =
            new Date(task.due) <= new Date() ? 'Overdue' : `Due ${formatDate(task.due)}`;
        document.getElementById('task-created').textContent = formatDate(task.created);
        document.getElementById('task-time').textContent = `${task.timeEstimate} minutes`;
        document.getElementById('task-contact').textContent = task.contact;
        document.getElementById('task-id').textContent = task.id;

        // Update subtasks
        const subtasksContainer = document.getElementById('task-subtasks');
        subtasksContainer.innerHTML = '';
        task.subtasks.forEach((subtask, index) => {
            const btn = document.createElement('button');
            btn.className = `subtask-btn ${index === task.currentSubtask ? 'active' : ''}`;
            btn.textContent = subtask;
            btn.addEventListener('click', async () => {
                task.currentSubtask = index;
                client.lastUpdated = new Date().toISOString().split('T')[0];

                // Save subtask progress
                await saveToSheets(client);

                renderCurrentClient();
            });
            subtasksContainer.appendChild(btn);
        });
    }

    // Update attached clients
    const attachedContainer = document.getElementById('attached-list');
    attachedContainer.innerHTML = '';

    if (client.attachedClients && client.attachedClients.length > 0) {
        client.attachedClients.forEach(attached => {
            const attachedDiv = document.createElement('div');
            attachedDiv.className = 'attached-client';
            attachedDiv.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 4px;">${attached.name}</div>
                <div style="font-size: 0.9rem; color: #666; display: flex; justify-content: space-between;">
                    <span>${attached.stage}</span>
                    <span style="color: ${getUrgencyColor(attached.urgency)}; font-weight: 600;">${attached.urgency}</span>
                </div>
            `;
            attachedDiv.addEventListener('click', () => {
                const index = filteredClients.findIndex(c => c.id === attached.id);
                if (index !== -1) {
                    currentClientIndex = index;
                    renderCurrentClient();
                    renderClientQueue();
                }
            });
            attachedContainer.appendChild(attachedDiv);
        });
    } else {
        attachedContainer.innerHTML = '<div style="color: #666; font-style: italic; padding: 20px; text-align: center;">No attached clients</div>';
    }

    // Update notes
    document.getElementById('client-notes').value = client.notes || '';

    // Show/hide panels based on client status
    const transferPanel = document.getElementById('transfer-panel');
    const completePanel = document.getElementById('complete-panel');

    if (client.readyToTransfer && client.status !== 'transferred') {
        transferPanel.style.display = 'block';
        completePanel.style.display = 'none';
    } else if (client.status !== 'transferred') {
        transferPanel.style.display = 'none';
        completePanel.style.display = 'block';
    } else {
        transferPanel.style.display = 'none';
        completePanel.style.display = 'none';
    }
}

function updateStats() {
    const activeClients = clients.filter(c => c.status === 'active').length;
    const transferredClients = clients.filter(c => c.status === 'transferred').length;
    const totalUrgency = clients.reduce((sum, c) => sum + c.urgency, 0);
    const avgUrgency = Math.round(totalUrgency / clients.length);
    const pendingTasks = clients.reduce((sum, c) => c.currentTask?.subtasks?.length || 0, 0);
    const overdue = clients.filter(c => {
        if (!c.currentTask?.due) return false;
        return new Date(c.currentTask.due) < new Date();
    }).length;
    const transferReady = clients.filter(c => c.readyToTransfer && c.status !== 'transferred').length;

    document.getElementById('total-clients').textContent = activeClients;
    document.getElementById('avg-urgency').textContent = avgUrgency;
    document.getElementById('avg-urgency').className = `stat-value ${getUrgencyClass(avgUrgency)}`;
    document.getElementById('pending-tasks').textContent = pendingTasks;
    document.getElementById('overdue').textContent = overdue;
    document.getElementById('transfer-ready').textContent = transferReady;
}

// ===== EVENT HANDLERS =====
function setupEventListeners() {
    // Navigation
    document.getElementById('btn-prev').addEventListener('click', () => {
        currentClientIndex = (currentClientIndex - 1 + filteredClients.length) % filteredClients.length;
        renderCurrentClient();
        renderClientQueue();
    });

    document.getElementById('btn-next').addEventListener('click', () => {
        currentClientIndex = (currentClientIndex + 1) % filteredClients.length;
        renderCurrentClient();
        renderClientQueue();
    });

    // Filter controls
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderClientQueue();
        });
    }

    document.getElementById('urgency-filter').addEventListener('input', (e) => {
        document.getElementById('urgency-filter-value').textContent =
            e.target.value === '0' ? 'All' : `> ${e.target.value}`;
        renderClientQueue();
    });

    document.getElementById('stage-filter').addEventListener('change', renderClientQueue);
    document.getElementById('show-transferred').addEventListener('change', renderClientQueue);
    document.getElementById('show-completed').addEventListener('change', renderClientQueue);

    // Undo
    if (document.getElementById('btn-undo')) {
        document.getElementById('btn-undo').addEventListener('click', undoLastAction);
    }

    // Attach Client
    if (document.getElementById('btn-attach-client')) {
        document.getElementById('btn-attach-client').addEventListener('click', async () => {
            const client = filteredClients[currentClientIndex];
            const attachedID = prompt("Enter the ID of the client to attach:");
            if (attachedID && client) {
                // Verify client exists
                const targetClient = clients.find(c => c.id.toString() === attachedID.toString());
                if (targetClient) {
                    if (targetClient.id === client.id) {
                        alert("Cannot attach client to themselves.");
                        return;
                    }

                    saveStateForUndo(client); // Save undo state

                    if (!client.attachedClients.some(ac => ac.id === targetClient.id)) {
                        client.attachedClients.push({
                            id: targetClient.id,
                            name: targetClient.name,
                            urgency: targetClient.urgency,
                            stage: targetClient.stage,
                            location: targetClient.location
                        });
                        client.lastUpdated = new Date().toISOString().split('T')[0];
                        await saveToSheets(client);
                        renderCurrentClient();
                        alert(`Attached ${targetClient.name}`);
                    } else {
                        alert("Client already attached.");
                    }
                } else {
                    alert("Client ID not found.");
                }
            }
        });
    }

    // Custom Fields
    if (document.getElementById('btn-add-field')) {
        document.getElementById('btn-add-field').addEventListener('click', async () => {
            const client = filteredClients[currentClientIndex];
            const fieldName = prompt("Enter field name (e.g., 'Gate Code'):");
            if (fieldName && client) {
                const fieldValue = prompt(`Enter value for ${fieldName}:`);
                if (fieldValue) {
                    saveStateForUndo(client); // Save undo state

                    if (!client.customFields) client.customFields = {};
                    client.customFields[fieldName] = fieldValue;
                    client.lastUpdated = new Date().toISOString().split('T')[0];
                    await saveToSheets(client);
                    renderCurrentClient();
                }
            }
        });
    }

    // Sales Pipeline View Toggle
    if (document.getElementById('btn-pipeline-view')) {
        document.getElementById('btn-pipeline-view').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            btn.classList.toggle('active');
            const isPipelineMode = btn.classList.contains('active');

            // Logic to filter queue for pipeline can be added here or in renderClientQueue
            // For now, we'll just alert as a placeholder or filter queue
            if (isPipelineMode) {
                // Filter for pipeline stages
                document.getElementById('stage-filter').value = 'all';
                // In a real implementation we would set a pipeline filter variable
                alert("Switched to Sales Pipeline View");
            } else {
                alert("Switched to Task View");
            }
        });
    }

    // Task completion
    document.getElementById('btn-complete-task').addEventListener('click', async () => {
        const client = filteredClients[currentClientIndex];
        if (client && client.currentTask) {
            // Move to next subtask or complete task
            if (client.currentTask.currentSubtask < client.currentTask.subtasks.length - 1) {
                client.currentTask.currentSubtask++;
                client.lastUpdated = new Date().toISOString().split('T')[0];

                // Save subtask progress
                await saveToSheets(client);

                renderCurrentClient();
            } else {
                // Task completed - show urgency selector
                document.getElementById('complete-panel').classList.add('pulse');
            }
        }
    });

    // Urgency selector for completion
    const urgencySlider = document.getElementById('urgency-selector');
    const urgencyValueDisplay = document.getElementById('urgency-selected-value');

    urgencySlider.addEventListener('input', (e) => {
        const value = e.target.value;
        urgencyValueDisplay.textContent = value;
        urgencyValueDisplay.style.color = getUrgencyColor(value);
    });

    document.getElementById('btn-confirm-complete').addEventListener('click', async () => {
        const client = filteredClients[currentClientIndex];
        const newUrgency = parseInt(urgencySlider.value);

        // Update client urgency
        client.urgency = newUrgency;

        // Mark task as completed and generate new task
        client.currentTask = generateNewTask(client);
        client.lastUpdated = new Date().toISOString().split('T')[0];

        // Save to Google Sheets
        await saveToSheets(client);

        // Move to next client
        currentClientIndex = (currentClientIndex + 1) % filteredClients.length;

        // Reset urgency slider
        urgencySlider.value = 50;
        urgencyValueDisplay.textContent = '50';
        urgencyValueDisplay.style.color = getUrgencyColor(50);

        // Update UI
        renderCurrentClient();
        renderClientQueue();
        updateStats();

        // Show success message
        alert(`Task completed! New urgency set to ${newUrgency}.`);
    });

    document.getElementById('btn-cancel-complete').addEventListener('click', () => {
        document.getElementById('complete-panel').classList.remove('pulse');
    });

    // Transfer functionality
    document.querySelectorAll('.transfer-option').forEach(option => {
        option.addEventListener('click', async (e) => {
            const system = e.currentTarget.dataset.system;
            const client = filteredClients[currentClientIndex];

            if (confirm(`Transfer ${client.name} to ${system} system?`)) {
                client.status = 'transferred';
                client.transferredTo = system;
                client.readyToTransfer = false;
                client.lastUpdated = new Date().toISOString().split('T')[0];

                // Save to Google Sheets
                await saveToSheets(client);

                // Move to next client
                currentClientIndex = (currentClientIndex + 1) % filteredClients.length;

                // Update UI
                renderCurrentClient();
                renderClientQueue();
                updateStats();

                alert(`Client transferred to ${system} system.`);
            }
        });
    });

    document.getElementById('btn-transfer').addEventListener('click', async () => {
        const client = filteredClients[currentClientIndex];
        if (client) {
            client.readyToTransfer = true;
            client.lastUpdated = new Date().toISOString().split('T')[0];

            // Save to Google Sheets
            await saveToSheets(client);

            renderCurrentClient();
            renderClientQueue();
            updateStats();
            alert('Client marked as ready to transfer.');
        }
    });

    // Notes saving
    document.getElementById('btn-save-notes').addEventListener('click', async () => {
        const client = filteredClients[currentClientIndex];
        if (client) {
            client.notes = document.getElementById('client-notes').value;
            client.lastUpdated = new Date().toISOString().split('T')[0];

            // Save to Google Sheets
            await saveToSheets(client);

            alert('Notes saved successfully!');
        }
    });

    // Auto-save notes on blur (debounced)
    const notesTextarea = document.getElementById('client-notes');
    let notesTimeout = null;
    notesTextarea.addEventListener('blur', async () => {
        const client = filteredClients[currentClientIndex];
        if (client) {
            client.notes = notesTextarea.value;
            client.lastUpdated = new Date().toISOString().split('T')[0];

            // Debounced save
            if (notesTimeout) clearTimeout(notesTimeout);
            notesTimeout = setTimeout(() => {
                saveToSheets(client);
            }, DEBOUNCE_DELAY);
        }
    });

    // Control center buttons
    document.getElementById('btn-tasks').addEventListener('click', () => {
        document.getElementById('modal-add-task').style.display = 'flex';
    });

    document.getElementById('btn-timeline').addEventListener('click', () => {
        document.getElementById('modal-formula').style.display = 'flex';
    });

    // Task template form
    const taskForm = document.getElementById('form-add-task');
    const defaultUrgencySlider = document.getElementById('task-default-urgency');
    const defaultUrgencyDisplay = document.getElementById('task-urgency-display');

    defaultUrgencySlider.addEventListener('input', (e) => {
        defaultUrgencyDisplay.textContent = e.target.value;
    });

    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const newTask = {
            id: `template-${taskTemplates.length + 1}`,
            name: document.getElementById('task-name').value,
            category: document.getElementById('task-category-select').value,
            stageRequired: document.getElementById('task-stage-required').value,
            description: document.getElementById('task-description-input').value,
            subtasks: document.getElementById('task-subtasks-input').value.split(',').map(s => s.trim()),
            defaultUrgency: parseInt(document.getElementById('task-default-urgency').value),
            timeEstimate: parseInt(document.getElementById('task-time-estimate').value)
        };

        taskTemplates.push(newTask);
        document.getElementById('modal-add-task').style.display = 'none';
        taskForm.reset();
        defaultUrgencyDisplay.textContent = '50';

        alert(`New task template "${newTask.name}" added successfully!`);
        console.log('New task template:', newTask);
    });

    // Formula modal
    document.getElementById('btn-copy-formulas').addEventListener('click', () => {
        const formulas = [
            '=IF(TODAY() >= StageEndDate, "Next Stage", IF(TODAY() >= StageStartDate, "Current Stage", "Previous Stage"))',
            '=MIN(MAX((TODAY() - StageStartDate) / (StageEndDate - StageStartDate), 0), 1)',
            '=MAX(StageEndDate - TODAY(), 0)'
        ];

        navigator.clipboard.writeText(formulas.join('\n'))
            .then(() => alert('Formulas copied to clipboard!'))
            .catch(() => alert('Failed to copy formulas.'));
    });

    // Modal close buttons
    document.getElementById('btn-cancel-task').addEventListener('click', () => {
        document.getElementById('modal-add-task').style.display = 'none';
    });

    document.getElementById('btn-close-formula').addEventListener('click', () => {
        document.getElementById('modal-formula').style.display = 'none';
    });

    // Close modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

function generateNewTask(client) {
    // Find appropriate task template for client's stage
    const suitableTemplates = taskTemplates.filter(template =>
        template.stageRequired === 'any' ||
        template.stageRequired === client.stage.toLowerCase()
    );

    if (suitableTemplates.length === 0) {
        // Default task if no template found
        return {
            id: `GEN-${Date.now().toString().slice(-4)}`,
            name: "Client Follow-up",
            category: "contact",
            subtasks: ["Schedule call", "Prepare update", "Send email"],
            currentSubtask: 0,
            description: "Regular client follow-up to maintain relationship.",
            created: new Date().toISOString().split('T')[0],
            due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            timeEstimate: 30,
            contact: "Client",
            defaultUrgency: 30
        };
    }

    // Pick a random suitable template
    const template = suitableTemplates[Math.floor(Math.random() * suitableTemplates.length)];

    return {
        id: `${client.stage.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
        name: template.name,
        category: template.category,
        subtasks: [...template.subtasks],
        currentSubtask: 0,
        description: template.description,
        created: new Date().toISOString().split('T')[0],
        due: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        timeEstimate: template.timeEstimate,
        contact: "Varies",
        defaultUrgency: template.defaultUrgency
    };
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});
