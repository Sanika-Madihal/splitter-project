// --- 1. Global App State and Core Data Structure ---

const BASE_URL = 'https://splitsmart-backend.onrender.com';

const App = {
    isAuthenticated: false,
    user: null,
    route: 'login',
    expenseStep: 1,
    profileEditMode: false,
    groupEditMode: false,

    data: {
        users: JSON.parse(localStorage.getItem('ss_users')) || [],
        groups: JSON.parse(localStorage.getItem('ss_groups')) || [],
        expenses: JSON.parse(localStorage.getItem('ss_expenses')) || [],
        // FIXED: Added settlements array to persist completed payments
        // This is the "Completed" list, and is critical for the fix.
        settlements: JSON.parse(localStorage.getItem('ss_settlements')) || []
    },

    savedUserId: null,
    pendingGroupMembers: [],
    customSplitShares: {},
    customPayerContributions: {},
    splitMethod: 'equal',
    currentGroupId: null,
    // This object will store the *net* debt (Gross Debt - Completed Settlements)
    // The Dashboard's 'You Owe' card will be calculated from this.
    individualBalances: {},

    // Store callback for confirmation modal
    confirmCallback: null,

    SPECIAL_DOMAINS: {
        'gmail': ['.com'],
        'yahoo': ['.com', '.in'],
        'outlook': ['.com', '.net'],
        'hotmail': ['.com']
    },

    // --- 2. Router and Renderer ---
    saveData() {
        localStorage.setItem('ss_users', JSON.stringify(this.data.users));
        localStorage.setItem('ss_groups', JSON.stringify(this.data.groups));
        localStorage.setItem('ss_expenses', JSON.stringify(this.data.expenses));
        // FIXED: Save settlements data to localStorage
        localStorage.setItem('ss_settlements', JSON.stringify(this.data.settlements));
        // This saves the calculated *net* balances.
        localStorage.setItem('ss_individualBalances', JSON.stringify(this.individualBalances));
    },

    loadData() {
        try {
            const users = JSON.parse(localStorage.getItem('ss_users'));
            const groups = JSON.parse(localStorage.getItem('ss_groups'));
            const expenses = JSON.parse(localStorage.getItem('ss_expenses'));
            // FIXED: Load settlements data from localStorage
            const settlements = JSON.parse(localStorage.getItem('ss_settlements'));
            const individualBalances = JSON.parse(localStorage.getItem('ss_individualBalances'));

            if (Array.isArray(users)) this.data.users = users;
            if (Array.isArray(groups)) this.data.groups = groups;
            if (Array.isArray(expenses)) this.data.expenses = expenses;
            // FIXED: Assign loaded settlements
            if (Array.isArray(settlements)) this.data.settlements = settlements;
            // We load this, but calculateDetailedBalances will overwrite it on init.
            if (individualBalances && typeof individualBalances === 'object') this.individualBalances = individualBalances;

            const savedId = localStorage.getItem('userId');
            if (savedId) this.savedUserId = parseInt(savedId);

        } catch (e) {
            console.error("Error loading data from localStorage:", e);
        }
    },

    navigateTo(route, groupId = null) {
        this.route = route;
        this.currentGroupId = groupId;
        if (route !== 'group-details' && route !== 'groups') {
            this.pendingGroupMembers = [];
        }
        window.history.pushState({ route, groupId }, '', `#${route}${groupId ? '/' + groupId : ''}`);
        // This is the main render call that updates the UI
        this.render();
        this.initializePageScripts(route, groupId);
    },

    render() {
        const view = document.getElementById('app-view');
        if (!view) return;

        if (!this.isAuthenticated) {
            view.innerHTML = this.route === 'register' ? this.renderRegisterPage() : this.renderLoginPage();
            return;
        }

        view.innerHTML = this.renderAppShell(this.renderPageContent());
    },

    renderAppShell(content) {
        return `
            <div id="app-layout">
                <aside class="sidebar">
                    <h2 style="margin-bottom: var(--space-xl);">🔥 SplitSmart</h2>
                    <nav class="sidebar-nav">
                        ${this.renderSidebarLink('dashboard', 'house', 'Dashboard')}
                        ${this.renderSidebarLink('groups', 'users', 'Groups')}
                        ${this.renderSidebarLink('expenses', 'money-bill-wave', 'Expenses')}
                        ${this.renderSidebarLink('payment', 'credit-card', 'Settlements')}
                        ${this.renderSidebarLink('activity', 'chart-line', 'Analytics')}
                        ${this.renderSidebarLink('profile', 'user', 'Profile')}
                    </nav>
                    <div class="flex items-center gap-md" style="margin-top: auto; padding-top: var(--space-lg); border-top: 1px solid var(--color-border);">
                        <img src="${this.user.avatar}" alt="Avatar" class="avatar">
                        <div>
                            <p style="font-weight: var(--font-weight-medium); font-size: var(--font-size-sm);">${this.user.name}</p>
                            <p style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">${this.user.email}</p>
                        </div>
                    </div>
                </aside>

                <main style="flex-grow: 1;">
                    <header class="main-header flex justify-between items-center">
                        <button class="menu-icon" onclick="alert('Mobile menu toggle simulated!')"><i class="fa-solid fa-bars"></i></button>
                        <h2>${this.route.charAt(0).toUpperCase() + this.route.slice(1)}</h2>
                        <div class="flex items-center gap-md">
                            <button class="btn btn-primary" onclick="app.openModal('addExpenseModal')" title="Add Expense">
                                <i class="fa-solid fa-plus"></i> Add Expense
                            </button>
                        </div>
                    </header>
                    <div class="main-content">
                        ${content}
                    </div>
                </main>

                <nav class="mobile-nav">
                    ${this.renderMobileNavLink('dashboard', 'house', 'Home')}
                    ${this.renderMobileNavLink('groups', 'users', 'Groups')}
                    ${this.renderMobileNavLink('expenses', 'money-bill-wave', 'Expenses')}
                    <button class="mobile-nav-item" style="color: var(--color-primary);" onclick="app.openModal('addExpenseModal')">
                        <i class="fa-solid fa-plus-circle fa-2x"></i><span>Add</span>
                    </button>
                    ${this.renderMobileNavLink('payment', 'credit-card', 'Settle')}
                    ${this.renderMobileNavLink('activity', 'chart-line', 'Stats')}
                    ${this.renderMobileNavLink('profile', 'user', 'Profile')}
                </nav>
            </div>
        `;
    },

    renderSidebarLink(route, icon, label) {
        const isActive = this.route === route ? 'active' : '';
        return `<li class="nav-item"><a href="#" class="${isActive}" onclick="event.preventDefault(); app.navigateTo('${route}')"><i class="fa-solid fa-${icon}"></i> ${label}</a></li>`;
    },

    renderMobileNavLink(route, icon, label) {
        const isActive = this.route === route ? 'active' : '';
        return `<a href="#" class="mobile-nav-item ${isActive}" onclick="event.preventDefault(); app.navigateTo('${route}')"><i class="fa-solid fa-${icon}"></i> <span>${label}</span></a>`;
    },

    getStyle(prop) { return getComputedStyle(document.documentElement).getPropertyValue(`--${prop}`); },

    // --- 3. Page Content Renderers ---
    renderLoginPage() {
        return `
            <div id="auth-page">
                <div class="card auth-card">
                    <h2>🔥 SplitSmart Login</h2>
                    <form id="loginForm">
                        <input type="email" id="loginEmail" placeholder="Email" required class="mb-lg">
                        <input type="password" id="loginPassword" placeholder="Password" required class="mb-lg">
                        <button type="submit" class="btn btn-primary mb-lg" style="width: 100%;">Sign In</button>
                    </form>
                    <p>Don't have an account? <a href="#" onclick="app.navigateTo('register')">Register here</a></p>
                </div>
            </div>
        `;
    },

    renderRegisterPage() {
        return `
            <div id="auth-page">
                <div class="card auth-card">
                    <h2>Create Your Account</h2>
                    <form id="registerForm">
                        <input type="text" id="regName" placeholder="Full Name" required class="mb-lg">
                        <input type="email" id="regEmail" placeholder="Email" required class="mb-lg">
                        <input type="password" id="regPassword" placeholder="Password" required class="mb-lg">
                        <input type="password" id="regConfirmPassword" placeholder="Confirm Password" required class="mb-lg">
                        <button type="submit" class="btn btn-primary mb-lg" style="width: 100%;">Register</button>
                    </form>
                    <p>Already have an account? <a href="#" onclick="app.navigateTo('login')">Login here</a></p>
                </div>
            </div>
        `;
    },

    renderPageContent() {
        switch (this.route) {
            case 'dashboard': return this.renderDashboard();
            case 'groups': return this.renderGroupsPage();
            case 'group-details': return this.renderGroupDetailPage();
            case 'expenses': return this.renderExpensesPage();
            case 'activity': return this.renderActivityPage();
            case 'payment': return this.renderPaymentPage();
            case 'profile': return this.renderProfilePage();
            default: return `<h3>Page Not Found: ${this.route}</h3>`;
        }
    },

    //
    // --- ✅ BUG FIX LOCATION 1 ---
    // This is the Dashboard renderer.
    // It calls `app.calculateBalances()`, which is the key function
    // for getting the *net* balance.
    //
    renderDashboard() {
        // FIXED: calculateBalances() now correctly calculates net balances
        // by reading expense data AND settlement data.
        // This function call is what gets the final, correct numbers.
        const balances = this.calculateBalances();
        const owedToYou = balances.lent;
        const youOwe = balances.owe;
        const totalExpenses = balances.totalExpenses;
        const hasExpenses = this.data.expenses.length > 0;

        let dashboardContent = `
            <h2>Welcome back, ${this.user.name}! 👋</h2>
            <p class="color-text-medium mb-xl">Manage your group expenses and settle debts efficiently</p>
            
            <div class="summary-grid">
                <div class="card">
                    <small>Total Expenses</small>
                    <div class="summary-card-value indicator-primary">₹${totalExpenses.toLocaleString('en-IN')}</div>
                    <small class="color-text-medium">Across ${this.data.groups.length} groups</small>
                </div>
                <div class="card">
                    <small>You Are Owed</small>
                    <div class="summary-card-value indicator-green">₹${owedToYou.toFixed(0).toLocaleString('en-IN')}</div>
                    <small><a href="#" onclick="app.navigateTo('payment')">Request settlement</a></small>
                </div>
                <div class="card">
                    <small>You Owe</small>
                    <div class="summary-card-value indicator-red">₹${youOwe.toFixed(0).toLocaleString('en-IN')}</div>
                    <small><a href="#" onclick="app.navigateTo('payment')">Settle up now</a></small>
                </div>
                <div class="card">
                    <small>Active Groups</small>
                    <div class="summary-card-value indicator-accent">${this.data.groups.length}</div>
                    <small class="color-text-medium">Current groups</small>
                </div>
            </div>
        `;

        if (hasExpenses) {
            dashboardContent += `
                <h3 class="mt-xl mb-lg">Quick Actions</h3>
                <div class="flex gap-md mb-xl">
                    <button class="btn btn-primary" onclick="app.openModal('addExpenseModal')">
                        <i class="fa-solid fa-plus"></i> Add Expense
                    </button>
                    <button class="btn btn-secondary" onclick="app.openModal('addGroupModal')">
                        <i class="fa-solid fa-users"></i> Create Group
                    </button>
                    <button class="btn btn-secondary" onclick="app.navigateTo('payment')">
                        <i class="fa-solid fa-money-bill-transfer"></i> Settle Up
                    </button>
                </div>
                
                <h3 class="mt-xl mb-lg">Recent Expenses</h3>
                <div class="card">
                    ${this.data.expenses.slice(0, 5).map(exp => {
                        const group = this.data.groups.find(g => g.id === exp.groupId);
                        const payer = this.data.users.find(u => u.id === exp.payerIds[0]);
                        const userIsPayer = exp.payerIds.includes(this.user.id);
                        const payerCount = exp.payerIds.length;
                        const individualPayerAmount = exp.amount / payerCount;
                        let splitAmount = exp.participants.length > 0 ? exp.amount / exp.participants.length : 0;
                        if (exp.customSplitShares && exp.customSplitShares[this.user.id]) {
                            splitAmount = exp.customSplitShares[this.user.id];
                        } else if (exp.customSplitShares && exp.participants.includes(this.user.id)) {
                            splitAmount = 0;
                        }
                        const netImpact = (userIsPayer ? individualPayerAmount : 0) - (exp.participants.includes(this.user.id) ? splitAmount : 0);
                        const amountDisplay = netImpact >= 0 ? `+${netImpact.toFixed(2)}` : `${netImpact.toFixed(2)}`;
                        const indicatorClass = netImpact >= 0 ? 'indicator-green' : 'indicator-red';
                        return `
                            <div class="flex justify-between items-center" style="padding: var(--space-md) 0; border-bottom: 1px solid var(--color-border);">
                                <div>
                                    <p style="font-weight: var(--font-weight-medium);">${exp.description}</p>
                                    <small class="color-text-medium">${payer.name} ${payerCount > 1 ? `(+${payerCount - 1} others)` : ''} • ${group ? group.name : 'Unknown'} • ${new Date(exp.date).toLocaleDateString()}</small>
                                </div>
                                <span class="${indicatorClass}" style="font-weight: 600; font-size: var(--font-size-lg);">${exp.currency} ${amountDisplay}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            dashboardContent += `
                <div class="card text-center mt-xl" style="padding: var(--space-3xl);">
                    <i class="fa-solid fa-rocket" style="font-size: 4rem; color: var(--color-primary); margin-bottom: var(--space-lg);"></i>
                    <h3>Start Your First Group</h3>
                    <p class="color-text-medium mb-xl">Create a group for your next trip or shared expense and start tracking!</p>
                    <button class="btn btn-primary" onclick="app.openModal('addGroupModal')">
                        <i class="fa-solid fa-plus"></i> Create Group Now
                    </button>
                </div>
            `;
        }

        return dashboardContent;
    },

    renderGroupsPage() {
        this.groupEditMode = false;

        if (this.data.groups.length === 0) {
            return `
                <div class="flex justify-between items-center mb-xl">
                    <div>
                        <h2>My Groups</h2>
                        <p class="color-text-medium">Create and manage your expense groups</p>
                    </div>
                    <button class="btn btn-primary" onclick="app.openModal('addGroupModal')">
                        <i class="fa-solid fa-plus"></i> Create Group
                    </button>
                </div>
                <div class="card text-center" style="padding: var(--space-3xl);">
                    <i class="fa-solid fa-users" style="font-size: 4rem; color: var(--color-text-light); margin-bottom: var(--space-lg);"></i>
                    <h3>No Groups Found</h3>
                    <p class="color-text-medium mb-xl">Start by creating a group for your next trip or shared expense!</p>
                    <button class="btn btn-primary" onclick="app.openModal('addGroupModal')">
                        <i class="fa-solid fa-plus"></i> Create Your First Group
                    </button>
                </div>
            `;
        }

        return `
            <div class="flex justify-between items-center mb-xl">
                <div>
                    <h2>My Groups</h2>
                    <p class="color-text-medium">${this.data.groups.length} active ${this.data.groups.length === 1 ? 'group' : 'groups'}</p>
                </div>
                <button class="btn btn-primary" onclick="app.openModal('addGroupModal')">
                    <i class="fa-solid fa-plus"></i> Create Group
                </button>
            </div>
            <div class="group-grid">
                ${this.data.groups.map(group => `
                    <div class="card group-card" onclick="app.navigateTo('group-details', ${group.id})" style="position: relative;">
                        <button class="btn btn-error" style="position: absolute; top: var(--space-md); right: var(--space-md); padding: var(--space-sm) var(--space-md); min-height: 36px;" onclick="event.stopPropagation(); app.confirmDeleteGroup(${group.id}, '${group.name}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                        <div style="cursor: pointer;">
                            <h4>${group.name}</h4>
                            <p class="color-text-medium mb-sm">${group.members.length} members</p>
                            <p class="mb-sm"><small class="color-text-medium">${new Date(group.startDate).toLocaleDateString()} - ${new Date(group.endDate).toLocaleDateString()}</small></p>
                            <p style="font-size: var(--font-size-lg);"><strong class="indicator-primary">₹${group.totalExpense.toLocaleString('en-IN')}</strong> <small class="color-text-medium">total spent</small></p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    // --- THIS IS THE FIXED FUNCTION ---
    renderGroupDetailPage() {
        const groupId = this.currentGroupId;
        const group = this.data.groups.find(g => g.id === groupId);

        if (!group) {
            return `
                <h2>Group Not Found</h2>
                <p>The specified group could not be loaded.</p>
                <button class="btn btn-primary mt-lg" onclick="app.navigateTo('groups')">Go to Groups</button>
            `;
        }

        const isEditing = this.groupEditMode;
        const readOnlyAttr = isEditing ? '' : 'disabled';

        let membersToDisplay;
        if (isEditing) {
            // This logic block populates the member list when you first click "Edit"
            // We will simplify it and add the failsafe here.
            if (this.pendingGroupMembers.length === 0) {
                
                // 1. Get all member objects from the saved group data
                let memberObjects = group.members.map(memberId => {
                    const u = this.data.users.find(user => user.id === memberId);
                    return u ? { id: u.id, name: u.name, email: u.email, avatar: u.avatar } : null;
                }).filter(m => m !== null);

                // 2. Failsafe: Check if the admin (current user) is in this list
                const adminIsInList = memberObjects.some(m => m.id === this.user.id);

                // 3. If not, forcefully add the admin's object to the list.
                //    This corrects old/corrupt data for this edit session.
                if (!adminIsInList) {
                    memberObjects.push({
                        id: this.user.id,
                        name: this.user.name,
                        email: this.user.email,
                        avatar: this.user.avatar
                    });
                    this.showToast('Admin (you) auto-added to member list.', 'info');
                }
                
                // 4. Set the corrected list as the pending list
                this.pendingGroupMembers = memberObjects;
            }
            
            // If pendingGroupMembers is *not* empty, it means we've already
            // added/removed someone, so we just use the existing pending list.
            membersToDisplay = this.pendingGroupMembers;
        } else {
            this.pendingGroupMembers = [];
            // --- FIX: Add the same failsafe to the "View Mode" ---
            // Get the member list from the group's data
            let memberIds = [...group.members];
            
            // Check if the current user (admin) is in this list.
            if (!memberIds.includes(this.user.id)) {
                // If not, forcefully add them to the list for this view.
                memberIds.push(this.user.id);
                console.warn(`Admin user ${this.user.id} was missing from group ${group.id}. Temporarily added for details view.`);
            }

            // Now, map using the failsafe 'memberIds' list instead of 'group.members'
            membersToDisplay = memberIds.map(memberId => {
            // --- END FIX ---
                const u = this.data.users.find(user => user.id === memberId);
                return u ? { id: u.id, name: u.name, email: u.email, avatar: u.avatar } : null;
            }).filter(m => m !== null);
        }

        const currentMembersHtml = membersToDisplay.map(member => {
            const u = member;
            const isCurrentUser = u.id === this.user.id;
            const nameDisplay = `${u.name} ${isCurrentUser ? '(You)' : ''}`;
            const isRemovable = !isCurrentUser && isEditing;

            return `
                <div class="flex items-center justify-between gap-md card p-sm mb-sm">
                    <div class="flex items-center gap-md">
                        <img src="${u.avatar}" class="avatar" style="width: 36px; height: 36px;">
                        <div>
                            <p style="font-weight: var(--font-weight-medium);">${nameDisplay}</p>
                            <small class="color-text-medium">${u.email}</small>
                        </div>
                    </div>
                    ${isEditing && isRemovable ?
                        `<button type="button" class="btn btn-error" style="min-height: 36px; padding: var(--space-sm) var(--space-md);" onclick="app.removePendingMember('${u.email}')">
                            <i class="fa-solid fa-xmark"></i>
                        </button>`
                        : ''
                    }
                </div>
            `;
        }).join('');

        const memberCountDisplay = membersToDisplay.length;

        return `
            <div class="flex justify-between items-center mb-xl">
                <div>
                    <h2>${group.name}</h2>
                    <p class="color-text-medium">${memberCountDisplay} members • ${group.currency}</p>
                </div>
                <div class="flex gap-md">
                    <button class="btn btn-primary" onclick="app.openModal('addExpenseModal', ${group.id})">
                        <i class="fa-solid fa-plus"></i> Add Expense
                    </button>
                    ${isEditing
                        ? `<button class="btn btn-secondary" onclick="app.setGroupEditMode(false)"><i class="fa-solid fa-xmark"></i> Cancel</button>`
                        : `<button class="btn btn-secondary" onclick="app.setGroupEditMode(true)"><i class="fa-solid fa-pen"></i> Edit</button>`
                    }
                </div>
            </div>

            <div class="summary-grid mb-xl" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                <div class="card">
                    <small>Total Spent</small>
                    <div class="summary-card-value indicator-primary">${group.currency} ${group.totalExpense.toLocaleString('en-IN')}</div>
                </div>
                <div class="card">
                    <small>Members</small>
                    <div class="summary-card-value indicator-accent">${memberCountDisplay}</div>
                </div>
            </div>

            <div class="summary-grid" style="grid-template-columns: 1fr 1fr;">
                <div class="card">
                    <h3 class="mb-lg">Group Details ${isEditing ? '(Editing)' : ''}</h3>
                    <form id="groupDetailForm">
                        <input type="hidden" id="groupId" value="${group.id}">
                        <div class="mb-lg">
                            <label for="groupName">Group Name</label>
                            <input type="text" id="groupName" value="${group.name}" ${readOnlyAttr} required>
                        </div>
                        <div class="flex gap-md mb-lg">
                            <div style="flex: 1;">
                                <label for="groupStartDate">Start Date</label>
                                <input type="date" id="groupStartDate" value="${group.startDate}" ${readOnlyAttr} required>
                            </div>
                            <div style="flex: 1;">
                                <label for="groupEndDate">End Date</label>
                                <input type="date" id="groupEndDate" value="${group.endDate}" ${readOnlyAttr} required>
                            </div>
                        </div>
                        <div class="mb-lg">
                            <label for="groupCurrency">Base Currency</label>
                            <select id="groupCurrency" ${readOnlyAttr} required>
                                <option value="INR" ${group.currency === 'INR' ? 'selected' : ''}>₹ INR - Indian Rupee</option>
                                <option value="USD" ${group.currency === 'USD' ? 'selected' : ''}>$ USD - US Dollar</option>
                                <option value="EUR" ${group.currency === 'EUR' ? 'selected' : ''}>€ EUR - Euro</option>
                            </select>
                        </div>
                        ${isEditing
                            ? `<button type="submit" class="btn btn-success" style="width: 100%;">Save Changes</button>`
                            : `<button type="button" class="btn btn-secondary" style="width: 100%; opacity: 0.6;" disabled>View Mode</button>`
                        }
                    </form>
                </div>

                <div class="card">
                    <h3 class="mb-lg">Members</h3>

                    ${isEditing ? `
                        <div class="mb-lg">
                            <label>Add New Members</label>
                            <div class="flex gap-md mb-md">
                                <input type="text" id="newMemberName" placeholder="Name" style="flex: 1;">
                                <input type="email" id="newMemberEmail" placeholder="Email" style="flex: 1;">
                                <button type="button" class="btn btn-secondary" id="addMemberBtn" style="flex-shrink: 0; width: 100px;">
                                    <i class="fa-solid fa-user-plus"></i>
                                </button>
                            </div>
                        </div>
                    ` : ''}

                    <div id="groupDetailMemberList" style="max-height: 300px; overflow-y: auto;">
                        ${currentMembersHtml || '<p class="color-text-medium">No members found.</p>'}
                    </div>
                </div>
            </div>
        `;
    },

    renderExpensesPage() {
        if (this.data.expenses.length === 0) {
            return `
                <div class="flex justify-between items-center mb-xl">
                    <div>
                        <h2>All Expenses</h2>
                        <p class="color-text-medium">Track all your expenses here</p>
                    </div>
                    <button class="btn btn-primary" onclick="app.openModal('addExpenseModal')">
                        <i class="fa-solid fa-plus"></i> Add Expense
                    </button>
                </div>
                <div class="card text-center" style="padding: var(--space-3xl);">
                    <i class="fa-solid fa-receipt" style="font-size: 4rem; color: var(--color-text-light); margin-bottom: var(--space-lg);"></i>
                    <h3>No Expenses Logged</h3>
                    <p class="color-text-medium mb-xl">Start tracking your group expenses by adding your first expense!</p>
                    <button class="btn btn-primary" onclick="app.openModal('addExpenseModal')">
                        <i class="fa-solid fa-plus"></i> Log First Expense
                    </button>
                </div>
            `;
        }

        return `
            <div class="flex justify-between items-center mb-xl">
                <div>
                    <h2>All Expenses</h2>
                    <p class="color-text-medium">${this.data.expenses.length} total expenses</p>
                </div>
                <button class="btn btn-primary" onclick="app.openModal('addExpenseModal')">
                    <i class="fa-solid fa-plus"></i> Add Expense
                </button>
            </div>
            <div class="card">
                ${this.data.expenses.sort((a, b) => new Date(b.date) - new Date(a.date)).map(exp => {
                    const group = this.data.groups.find(g => g.id === exp.groupId);
                    const payerNames = exp.payerIds.map(id => this.data.users.find(u => u.id === id)?.name || 'N/A').join(', ');
                    return `
                        <div class="flex justify-between items-center" style="padding: var(--space-md) 0; border-bottom: 1px solid var(--color-border);">
                            <div style="flex: 1;">
                                <p style="font-weight: var(--font-weight-semibold); font-size: var(--font-size-lg);">${exp.description}</p>
                                <small class="color-text-medium">
                                    <i class="fa-solid fa-user"></i> ${payerNames} • 
                                    <i class="fa-solid fa-users"></i> ${group ? group.name : 'N/A'} • 
                                    <i class="fa-solid fa-calendar"></i> ${new Date(exp.date).toLocaleDateString()}
                                </small>
                            </div>
                            <div class="flex items-center gap-md">
                                <span style="font-weight: 700; font-size: var(--font-size-xl); color: var(--color-primary);">${exp.currency} ${exp.amount.toFixed(2)}</span>
                                <button class="btn btn-error" style="min-height: 36px; padding: var(--space-sm) var(--space-md);" onclick="app.confirmDeleteExpense(${exp.id}, '${exp.description}')">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    categorizeExpenses(expenses) {
        const categoryMap = {
            'Food': ['dinner', 'lunch', 'breakfast', 'restaurant', 'groceries', 'cafe', 'food', 'meal'],
            'Accommodation': ['hotel', 'stay', 'rent', 'airbnb', 'lodging', 'house'],
            'Transport': ['taxi', 'uber', 'bus', 'flight', 'train', 'gas', 'car', 'fuel'],
            'Shopping': ['shopping', 'clothes', 'gifts', 'souvenirs', 'retail'],
            'Entertainment': ['cinema', 'tickets', 'museum', 'activity', 'show'],
        };

        const categories = {};
        const userCurrencyRate = 83.5;

        expenses.forEach(exp => {
            let amountINR = exp.amount;
            if (exp.currency !== 'INR') amountINR *= userCurrencyRate;

            const description = exp.description.toLowerCase();
            let matchedCategory = 'Other';

            for (const category in categoryMap) {
                if (categoryMap[category].some(keyword => description.includes(keyword))) {
                    matchedCategory = category;
                    break;
                }
            }

            categories[matchedCategory] = (categories[matchedCategory] || 0) + amountINR;
        });

        return categories;
    },

    calculateSpendingTrendData(expenses, days = 7) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const spendingData = Array(days).fill(0);
        const labels = [];
        const userCurrencyRate = 83.5;

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
        }

        expenses.forEach(exp => {
            const expDate = new Date(exp.date);
            expDate.setHours(0, 0, 0, 0);

            let amountINR = exp.amount;
            if (exp.currency !== 'INR') amountINR *= userCurrencyRate;

            for (let i = 0; i < days; i++) {
                const dayToCompare = new Date(today);
                dayToCompare.setDate(today.getDate() - (days - 1 - i));

                if (expDate.getTime() === dayToCompare.getTime()) {
                    spendingData[i] += amountINR;
                    break;
                }
            }
        });

        return { labels, data: spendingData.map(d => Math.round(d)) };
    },

    calculateTopSpenders() {
        const payerTotals = {};
        const userCurrencyRate = 83.5;

        this.data.expenses.forEach(exp => {
            let expenseAmountINR = exp.amount;
            if (exp.currency !== 'INR') expenseAmountINR *= userCurrencyRate;

            if (exp.payerIds.length > 1 && exp.customPayerContributions) {
                exp.payerIds.forEach(pId => {
                    const contribution = exp.customPayerContributions[pId] || 0;
                    payerTotals[pId] = (payerTotals[pId] || 0) + contribution;
                });
            } else {
                const equalShare = expenseAmountINR / exp.payerIds.length;
                exp.payerIds.forEach(pId => {
                    payerTotals[pId] = (payerTotals[pId] || 0) + equalShare;
                });
            }
        });

        const topSpenders = Object.keys(payerTotals)
            .filter(id => payerTotals[id] >= 1)
            .map(id => {
                const userId = parseInt(id);
                const user = this.data.users.find(u => u.id === userId);
                const name = user ? (userId === this.user.id ? `${user.name} (You)` : user.name) : 'Unknown User';

                return {
                    name: name,
                    amount: Math.round(payerTotals[userId])
                };
            });

        return topSpenders.sort((a, b) => b.amount - a.amount).slice(0, 3);
    },

    renderActivityPage() {
        const userExpenses = this.data.expenses.filter(exp => exp.payerIds.includes(this.user.id));
        const hasExpenses = this.data.expenses.length > 0;

        const totalUserSpend = userExpenses.reduce((sum, exp) => {
            let amount = exp.amount;
            if (exp.currency !== 'INR') amount *= 83.5;
            return sum + amount;
        }, 0);

        if (!hasExpenses) {
            return `
                <h2>Analytics & Insights</h2>
                <p class="color-text-medium mb-xl">View spending trends and analytics</p>
                <div class="card text-center" style="padding: var(--space-3xl);">
                    <i class="fa-solid fa-chart-pie" style="font-size: 4rem; color: var(--color-text-light); margin-bottom: var(--space-lg);"></i>
                    <h3>No Data for Analysis</h3>
                    <p class="color-text-medium mb-xl">Log expenses to generate spending trends and analytics charts here.</p>
                </div>
            `;
        }

        const spendingTrend = this.calculateSpendingTrendData(userExpenses);
        const categories = this.categorizeExpenses(this.data.expenses);
        const topSpendersList = this.calculateTopSpenders();

        const mockGroupComp = this.data.groups.map(g => `
            <li class="flex justify-between" style="padding: var(--space-md) 0; border-bottom: 1px solid var(--color-border);">
                <span>${g.name}</span> <strong>${g.currency} ${g.totalExpense.toLocaleString('en-IN')}</strong>
            </li>
        `).join('');

        const sortedSpendersHtml = topSpendersList.map(s => `
            <li class="flex justify-between" style="padding: var(--space-md) 0; border-bottom: 1px solid var(--color-border);">
                <span>${s.name}</span> <strong>₹${s.amount.toLocaleString('en-IN')}</strong>
            </li>
        `).join('');

        return `
            <h2>Analytics & Insights</h2>
            <p class="color-text-medium mb-xl">Track your spending patterns and trends</p>
            
            <div class="summary-grid" style="grid-template-columns: 2fr 1fr;">
                <div class="card">
                    <h3 class="mb-md">Spending Trend (Last 7 Days)</h3>
                    <p class="color-text-medium mb-lg">Total Paid by You: ₹${Math.round(totalUserSpend).toLocaleString('en-IN')}</p>
                    <div style="height: 300px;"><canvas id="spendingTrendChart"></canvas></div>
                </div>
                <div class="card">
                    <h3 class="mb-md">Spending by Category</h3>
                    <div style="height: 280px;"><canvas id="categoryChart"></canvas></div>
                </div>
            </div>

            <div class="summary-grid mt-xl">
                <div class="card">
                    <h3 class="mb-lg">Top Spenders</h3>
                    <ul style="list-style: none; padding: 0;">
                        ${sortedSpendersHtml}
                    </ul>
                </div>
                <div class="card">
                    <h3 class="mb-lg">Group Spending</h3>
                    <ul style="list-style: none; padding: 0;">
                        ${mockGroupComp}
                    </ul>
                </div>
            </div>
        `;
    },

    //
    // --- ✅ BUG FIX LOCATION 2 ---
    // This function renders the Payment page.
    // It's "fixed" because it shows the "You Owe" cards based on the
    // *pending* settlements returned from `calculateDetailedBalances()`.
    // It ALSO renders the "Transaction History" from `this.data.settlements` (the
    // *completed* list). This function is already correct.
    //
    renderPaymentPage() {
        // 1. Calculate Balances
        // This function correctly returns the *pending* (unpaid) settlements
        // *after* accounting for completed payments.
        const balances = this.calculateDetailedBalances();
        // 'settlements' here means *pending* (unpaid) settlements
        const settlements = balances.settlements;

        let userNetOwe = 0;
        let userNetLent = 0;
        const currentUserId = this.user.id;

        const settlementsForUserOwes = settlements.filter(s => s.payer.id === currentUserId);
        const settlementsForUserLent = settlements.filter(s => s.recipient.id === currentUserId);

        userNetOwe = settlementsForUserOwes.reduce((sum, s) => sum + s.amount, 0);
        userNetLent = settlementsForUserLent.reduce((sum, s) => sum + s.amount, 0);

        // 2. Helper functions to render lists (these are fine)
        const getSimplifiedYouOweList = () => {
            return settlementsForUserOwes.map(s => `
                <li class="flex justify-between items-center mb-md" style="padding: var(--space-md); background-color: var(--color-gray-50); border-radius: var(--radius-base);">
                    <span>
                        <i class="fa-solid fa-arrow-right" style="color: var(--color-error);"></i> Pay <strong>${s.recipient.name}</strong>
                    </span>
                    <span style="font-weight: 700; font-size: var(--font-size-lg); color: var(--color-error);">
                        ₹${s.amount.toFixed(2).toLocaleString('en-IN')}
                    </span>
                </li>
            `).join('') || '<p class="color-text-medium">You owe no one.</p>';
        };

        const getSimplifiedOwesYouList = () => {
            return settlementsForUserLent.map(s => `
                <li class="flex justify-between items-center mb-md" style="padding: var(--space-md); background-color: var(--color-gray-50); border-radius: var(--radius-base);">
                    <span>
                        <i class="fa-solid fa-arrow-left" style="color: var(--color-success);"></i> <strong>${s.payer.name}</strong> owes you
                    </span>
                    <span style="font-weight: 700; font-size: var(--font-size-lg); color: var(--color-success);">
                        ₹${s.amount.toFixed(2).toLocaleString('en-IN')}
                    </span>
                </li>
            `).join('') || '<p class="color-text-medium">Nobody owes you.</p>';
        };

        // 3. Start building the page content
        // This part will *always* show, correctly showing ₹0 if settled.
        let content = `
            <h2>Settlements</h2>
            <p class="color-text-medium mb-xl">Manage payments and settle up with friends</p>
            
            <div class="summary-grid" style="grid-template-columns: 1fr 1fr;">
                <div class="card" style="border-left: 4px solid var(--color-error);">
                    <h3 class="mb-md">You Owe</h3>
                    <p style="font-size: var(--font-size-3xl); font-weight: var(--font-weight-bold); color: var(--color-error); margin-bottom: var(--space-lg);">₹${userNetOwe.toFixed(2).toLocaleString('en-IN')}</p>
                    <ul style="list-style: none; padding: 0;">
                        ${getSimplifiedYouOweList()}
                    </ul>
                </div>

                <div class="card" style="border-left: 4px solid var(--color-success);">
                    <h3 class="mb-md">Owed To You</h3>
                    <p style="font-size: var(--font-size-3xl); font-weight: var(--font-weight-bold); color: var(--color-success); margin-bottom: var(--space-lg);">₹${userNetLent.toFixed(2).toLocaleString('en-IN')}</p>
                    <ul style="list-style: none; padding: 0;">
                        ${getSimplifiedOwesYouList()}
                    </ul>
                </div>
            </div>
        `;

        // 4. Conditionally show "All Settled Up" or "Pending Settlements"
        // This is the core fix. We no longer 'return' early.
        if (settlements.length === 0) {
            // Show the "All Settled Up!" message
            content += `
                <div class="card text-center mt-xl" style="padding: var(--space-3xl);">
                    <i class="fa-solid fa-handshake" style="font-size: 4rem; color: var(--color-success); margin-bottom: var(--space-lg);"></i>
                    <h3>All Settled Up!</h3>
                    <p class="color-text-medium mb-xl">You have no outstanding balances. View your completed payments below.</p>
                </div>
            `;
        } else {
            // Show the "All Settlements Required" card with pending items
            content += `
                <div class="card mt-xl">
                    <h3 class="mb-md">All Settlements Required</h3>
                    <p class="color-text-medium mb-lg">These are the optimized transfers to settle all group expenses</p>
                    <ul style="list-style: none; padding: 0;">
                        ${settlements.map(s => {
                            let paymentInfoHtml = '';
                            const recipientUser = this.data.users.find(u => u.id === s.recipient.id);
                            
                            if (recipientUser && (recipientUser.upi || recipientUser.paymentEmail)) {
                                const upiPart = recipientUser.upi ? `<strong>UPI (Bank):</strong> ${recipientUser.upi}` : '';
                                const emailPart = recipientUser.paymentEmail ? `<strong>Email/Phone:</strong> ${recipientUser.paymentEmail}` : '';
                                const paymentDetails = [upiPart, emailPart].filter(Boolean).join(' • ');

                                paymentInfoHtml = `
                                    <small class="color-text-medium" style="display: block; margin-top: var(--space-xs); padding-left: 24px;">
                                        ( Pay at: ${paymentDetails} )
                                    </small>`;
                            }

                            return `
                            <li class="flex justify-between items-center mb-md" style="padding: var(--space-lg); border: 1px solid var(--color-border); border-radius: var(--radius-base); background-color: var(--color-gray-50);">
                                <span style="flex: 1;">
                                    <div>
                                        <i class="fa-solid fa-arrow-right" style="color: var(--color-primary);"></i> 
                                        <strong>${s.payer.name}</strong> pays <strong>${s.recipient.name}</strong>
                                    </div>
                                    ${paymentInfoHtml}
                                </span>
                                <div class="flex items-center gap-md">
                                    <span style="font-size: var(--font-size-xl); font-weight: 700; color: var(--color-primary);">
                                        ₹${s.amount.toFixed(2)}
                                    </span>
                                    <button class="btn btn-success" onclick="app.confirmSettlement(${s.payer.id}, ${s.recipient.id}, ${s.amount})">
                                        <i class="fa-solid fa-check"></i> Mark Paid
                                    </button>
                                </div>
                            </li>
                        `;
                        }).join('')}
                    </ul>
                </div>
            `;
        }

        // 5. ALWAYS show the Transaction History at the end
        // This part now runs no matter what, fixing the bug.
        // It reads from the *full* history: this.data.settlements
        content += `
            <div class="card mt-xl">
                <h3 class="mb-md">Transaction History</h3>
                <p class="color-text-medium mb-lg">A log of all your completed payments.</p>
                <ul style="list-style: none; padding: 0;">
                    ${this.data.settlements.length === 0
                        ? '<p class="color-text-medium">No completed transactions yet.</p>'
                        : this.data.settlements
                            .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt)) // Sort by most recent first
                            .map(s => {
                                const payer = this.data.users.find(u => u.id === s.from);
                                const recipient = this.data.users.find(u => u.id === s.to);
                                const date = new Date(s.settledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

                                return `
                                    <li class="flex justify-between items-center mb-md" style="padding: var(--space-lg); border: 1px solid var(--color-border); border-radius: var(--radius-base); background-color: var(--color-gray-50);">
                                        <div class="flex items-center gap-md">
                                            <i class="fa-solid fa-check-circle" style="color: var(--color-success); font-size: 1.5rem; align-self: flex-start;"></i>
                                            <div>
                                                <p style="font-weight: var(--font-weight-medium);">
                                                    <strong>${payer ? payer.name : 'N/A'}</strong> paid <strong>${recipient ? recipient.name : 'N/A'}</strong>
                                                </p>
                                                <small class="color-text-medium">
                                                    ${date} • ${s.method} • (All Groups)
                                                </small>
                                            </div>
                                        </div>
                                        <span style="font-size: var(--font-size-xl); font-weight: 700; color: var(--color-success);">
                                            ₹${s.amount.toFixed(2)}
                                        </span>
                                    </li>
                                `;
                            }).join('')
                    }
                </ul>
            </div>
        `;

        // 6. Return the fully-built page
        return content;
    },

    // --- MODIFIED FUNCTION ---
    // This function is completely restructured to match the new layout.
    renderProfilePage() {
        const isEditing = this.profileEditMode;
        const userData = this.user;
        const readOnlyAttr = isEditing ? '' : 'disabled';

        return `
            <h2>Profile & Settings</h2>
            <p class="color-text-medium mb-xl">Manage your account information</p>
            
            <form id="profileForm">
                <div class="summary-grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; gap: var(--space-xl);">
                    
                    <div class="card">
                        <h3 class="mb-lg">Personal Information</h3>
                        
                        <div class="flex items-center gap-lg mb-xl" style="padding-bottom: var(--space-lg); border-bottom: 1px solid var(--color-border);">
                            <img src="${userData.avatar}" alt="Avatar" class="avatar" style="width: 80px; height: 80px;">
                            <div>
                                <h3 style="margin-bottom: var(--space-sm);">${userData.name || 'User'}</h3>
                                <p class="color-text-medium">${userData.email || ''}</p>
                            </div>
                        </div>

                        <div class="mb-lg">
                            <label for="profileName">Full Name</label>
                            <input type="text" id="profileName" value="${userData.name || ''}" ${readOnlyAttr}>
                        </div>
                        <div class="mb-lg">
                            <label for="profileEmail">Email Address</label>
                            <input type="email" id="profileEmail" value="${userData.email || ''}" disabled>
                        </div>
                        <div class="mb-lg">
                            <label for="profilePhone">Phone Number</label>
                            <input type="tel" id="profilePhone" value="${userData.phone || ''}" ${readOnlyAttr} placeholder="e.g., 9876543210">
                        </div>
                        <div class="mb-lg">
                            <label for="profileAddress">Address</label>
                            <input type="text" id="profileAddress" value="${userData.address || ''}" ${readOnlyAttr} placeholder="City, Country">
                        </div>
                        <div class="mb-lg">
                            <label for="profileBio">Bio</label>
                            <textarea id="profileBio" rows="3" ${readOnlyAttr} placeholder="A short description about yourself...">${userData.bio || ''}</textarea>
                        </div>
                    </div>

                    <div class="card">
                        <h3 class="mb-lg">Payment Methods</h3>
                        <p class="color-text-medium mb-lg">How others can pay you. This info is shown in the settlements section.</p>
                        
                        <div class="mb-lg">
                            <label for="profileUpi">UPI ID (for Bank Transfer)</label>
                            <input type="text" id="profileUpi" value="${userData.upi || ''}" ${readOnlyAttr} placeholder="e.g., yourname@upi">
                        </div>
                        <div class="mb-lg">
                            <label for="profilePaymentEmail">Payment Email / Phone</label>
                            <input type="text" id="profilePaymentEmail" value="${userData.paymentEmail || ''}" ${readOnlyAttr} placeholder="e.g., your@paypal.me or 9876543210">
                        </div>
                        ${!isEditing ? 
                            '<p class="color-text-medium">Click "Edit Profile" to add or change your payment methods.</p>' :
                            '<p class="color-text-medium">Your payment details are now editable. Click "Save Changes" when done.</p>'
                        }
                    </div>

                    <div class="card" style="border-left: 4px solid var(--color-error);">
                        <h3 class="mb-md">Danger Zone</h3>
                        <p class="color-text-medium mb-lg">These actions will permanently delete your data from this browser.</p>
                        <div class="flex gap-md">
                            <button id="resetDataBtn" type="button" class="btn btn-error">
                                <i class="fa-solid fa-trash"></i> Reset All Data
                            </button>
                            <button type="button" class="btn btn-secondary" onclick="app.logout()">
                                <i class="fa-solid fa-right-from-bracket"></i> Logout
                            </button>
                        </div>
                    </div>

                </div> <div class="flex justify-start mt-xl" style="padding: var(--space-xl); border-top: 1px solid var(--color-border);">
                    ${isEditing
                        ? `
                        <button type="submit" class="btn btn-success" id="saveProfileBtn">Save Changes</button>
                        <button type="button" class="btn btn-secondary" id="cancelEditBtn" style="margin-left: var(--space-md);">Cancel</button>
                        `
                        : `<button type="button" class="btn btn-primary" id="editProfileBtn">Edit Profile</button>`
                    }
                </div>

            </form> `;
    },

    // --- 4. Logic & Handlers ---

    // Auth Logic
    login(email) {
        const foundUser = this.data.users.find(u => u.email === email);
        if (foundUser) {
            this.isAuthenticated = true;
            this.user = foundUser;
            localStorage.setItem('isAuthenticated', 'true');
            localStorage.setItem('userId', foundUser.id);
            this.navigateTo('dashboard');
            this.showToast('Login successful. Welcome back!', 'success');
        } else {
            this.showToast('Login failed. Please check credentials or register.', 'error');
        }
    },

    isValidEmail(email) {
        const allowedTldsRegex = /^[^\s@]+@[^\s@]+\.(com|in|co\.in|org|net)$/i;
        if (!allowedTldsRegex.test(email)) {
            return false;
        }

        const parts = email.toLowerCase().match(/@(.+)\.(.+)$/);
        if (!parts) return false;

        const fullDomainWithSub = parts[1];
        const tldExtension = parts[2];

        let baseDomain;
        let tld;

        if (tldExtension === 'in' && fullDomainWithSub.endsWith('.co')) {
            baseDomain = fullDomainWithSub.replace(/\.co$/, '');
            tld = '.co.in';
        } else {
            baseDomain = fullDomainWithSub;
            tld = '.' + tldExtension;
        }

        baseDomain = baseDomain.split('.').pop();

        if (this.SPECIAL_DOMAINS[baseDomain]) {
            if (!this.SPECIAL_DOMAINS[baseDomain].includes(tld)) {
                return false;
            }
        }

        return true;
    },

    register(name, email, password, confirmPassword) {
        if (!this.isValidEmail(email)) {
            this.showToast('Invalid email format or TLD not valid for this domain.', 'error');
            return false;
        }
        if (password !== confirmPassword) {
            this.showToast('Passwords do not match.', 'error');
            return false;
        }
        if (this.data.users.some(u => u.email === email)) {
            this.showToast('Email already in use.', 'error');
            return false;
        }

        const newId = (this.data.users.length > 0 ? Math.max(...this.data.users.map(u => u.id)) : 0) + 1;
        this.data.users.push({
            id: newId,
            name: name,
            email: email,
            phone: '',
            address: '',
            bio: '',
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`        });
        this.saveData();
        this.openModal('registrationSuccessModal');
        return true;
    },

    // FIXED: Custom Confirmation Modal (replaces browser confirm dialogs)
    showConfirmationModal(title, message, onConfirm) {
        const modal = document.getElementById('confirmationModal');
        if (!modal) {
            // Create modal if it doesn't exist
            const modalHTML = `
                <div id="confirmationModal" class="modal">
                    <div class="modal-content text-center" style="max-width: 500px;">
                        <i class="fa-solid fa-circle-exclamation" style="font-size: 4rem; margin-bottom: var(--space-lg); color: var(--color-warning);"></i>
                        <h3 id="confirmTitle"></h3>
                        <p id="confirmMessage" class="color-text-medium mb-xl"></p>
                        <div class="flex justify-center gap-md">
                            <button class="btn btn-error" id="confirmYesBtn">Confirm</button>
                            <button class="btn btn-secondary" id="confirmNoBtn">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            // Attach event listeners
            document.getElementById('confirmNoBtn').onclick = () => {
                this.closeModal('confirmationModal');
            };
            
            document.getElementById('confirmYesBtn').onclick = () => {
                this.closeModal('confirmationModal');
                if (this.confirmCallback) {
                    this.confirmCallback();
                    this.confirmCallback = null;
                }
            };
        }
        
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        this.confirmCallback = onConfirm;
        this.openModal('confirmationModal');
    },

    // --- NEW FUNCTION: Prompts for payment detail before settling ---
    promptPaymentDetail(payerId, recipientId, amount, methodType) {
        const modalId = 'paymentDetailInputModal';
        let modal = document.getElementById(modalId);
        const recipientName = this.data.users.find(u => u.id === recipientId)?.name || 'the user';

        if (!modal) {
            const modalHTML = `
                <div id="${modalId}" class="modal">
                    <div class="modal-content" style="max-width: 500px;">
                        <h3 id="paymentInputTitle">Enter Payment Detail</h3>
                        <p id="paymentInputMessage" class="color-text-medium mb-xl"></p>
                        <form id="paymentInputForm">
                            <label for="paymentDetailInput" id="inputLabel"></label>
                            <input type="text" id="paymentDetailInput" required class="mb-lg" placeholder="Enter UPI ID, Email, or Phone...">
                            <div class="flex justify-end gap-md">
                                <button type="button" class="btn btn-secondary" id="paymentInputCancelBtn">Cancel</button>
                                <button type="submit" class="btn btn-success" id="paymentInputConfirmBtn">Confirm Payment</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            document.getElementById('paymentInputCancelBtn').onclick = () => this.closeModal(modalId);
        }

        // Update content
        const inputTitle = `Payment via ${methodType}`;
        const inputLabelText = `${methodType} Detail:`;
        
        document.getElementById('paymentInputTitle').textContent = inputTitle;
        document.getElementById('inputLabel').textContent = inputLabelText;
        document.getElementById('paymentDetailInput').placeholder = `Enter ${methodType}...`;
        document.getElementById('paymentInputMessage').innerHTML = `You are confirming payment of <strong>₹${amount.toFixed(2)}</strong> to <strong>${recipientName}</strong>.`;

        // Clear previous event listener and attach new one
        const form = document.getElementById('paymentInputForm');
        // This cloning technique is a robust way to clear previous form event listeners.
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);

        newForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const detail = document.getElementById('paymentDetailInput').value.trim();
            if (!detail) {
                this.showToast('Payment detail cannot be empty.', 'error');
                return;
            }
            const finalMethod = `${methodType} (${detail})`;
            this.settleIndividualBalance(payerId, recipientId, amount, finalMethod);
            this.closeModal(modalId);
        });

        this.openModal(modalId);
        document.getElementById('paymentDetailInput').value = ''; // Clear input on open
    },

    // --- MODIFIED FUNCTION: Creates the payment method selector modal ---
    showPaymentMethodModal(payerId, recipientId, amount, recipientName) {
        const modalId = 'paymentMethodModal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            // Create modal if it doesn't exist
            const modalHTML = `
                <div id="${modalId}" class="modal">
                    <div class="modal-content text-center" style="max-width: 500px;">
                        <i class="fa-solid fa-circle-question" style="font-size: 4rem; margin-bottom: var(--space-lg); color: var(--color-primary);"></i>
                        <h3 id="paymentMethodTitle">Select the payment method</h3>
                        <p id="paymentMethodMessage" class="color-text-medium mb-xl"></p>
                        <div class="flex-col gap-md">
                            <button class="btn btn-primary" id="payMethodUpiBtn">
                                <i class="fa-solid fa-mobile-screen"></i> UPI
                            </button>
                            <button class="btn btn-primary" id="payMethodEmailBtn">
                                <i class="fa-solid fa-at"></i> Email/Phone
                            </button>
                            <button class="btn btn-secondary" id="payMethodOtherBtn">
                                <i class="fa-solid fa-ellipsis"></i> Other
                            </button>
                            <button class="btn btn-secondary" id="payMethodCancelBtn" style="margin-top: var(--space-lg);">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            // Attach event listeners *once*
            document.getElementById('payMethodCancelBtn').onclick = () => {
                this.closeModal(modalId);
            };
        }

        // Update modal content
        document.getElementById('paymentMethodMessage').innerHTML = `
            You are paying <strong>${recipientName}</strong> the amount of <strong>₹${amount.toFixed(2)}</strong>. Please select the payment method.
        `;

        // MODIFIED: UPI/Email now call the detail prompt before settling
        document.getElementById('payMethodUpiBtn').onclick = () => {
            this.closeModal(modalId);
            this.promptPaymentDetail(payerId, recipientId, amount, 'UPI ID');
        };
        
        document.getElementById('payMethodEmailBtn').onclick = () => {
            this.closeModal(modalId);
            this.promptPaymentDetail(payerId, recipientId, amount, 'Email/Phone');
        };

        // MODIFIED: 'Other' method still settles immediately, as no detail is required
        document.getElementById('payMethodOtherBtn').onclick = () => {
            this.settleIndividualBalance(payerId, recipientId, amount, 'Other');
            this.closeModal(modalId);
        };

        // Show the modal
        this.openModal(modalId);
    },

    // FIXED: Logout with custom modal
    logout() {
        this.showConfirmationModal(
            "Confirm Logout",
            "Are you sure you want to log out?",
            () => this.performLogout()
        );
    },

    performLogout() {
        this.isAuthenticated = false;
        this.user = null;
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('userId');
        this.navigateTo('login');
        this.showToast('You have been logged out.', 'info');
    },

    // FIXED: Reset data with custom modal
    // FIXED: Reset data now clears both LocalStorage AND Cloud MongoDB
    resetData() {
        this.showConfirmationModal(
            "Reset All Data",
            "This will permanently delete ALL data (users, groups, expenses, settlements) from both your browser AND the cloud database. This action cannot be undone.",
            () => {
                // 1. Call the backend to wipe the database
                fetch(`/api/reset`, { method: 'POST' })
                    .then(response => {
                        if (response.ok) {
                            // 2. If backend success, clear Local Storage
                            localStorage.clear();
                            this.data.users = [];
                            this.data.groups = [];
                            this.data.expenses = [];
                            this.data.settlements = [];
                            this.individualBalances = {};
                            
                            this.showToast('All data reset successfully.', 'success');
                            
                            // 3. Reload page to start fresh
                            setTimeout(() => window.location.reload(), 1000);
                        } else {
                            this.showToast('Failed to reset cloud database.', 'error');
                        }
                    })
                    .catch(err => {
                        console.error("Reset Error:", err);
                        this.showToast('Network error. Could not reach server.', 'error');
                    });
            }
        );
    },

    // FIXED: Delete group with custom modal
    confirmDeleteGroup(groupId, groupName) {
        const expenseCount = this.data.expenses.filter(e => e.groupId === groupId).length;
        this.showConfirmationModal(
            "Delete Group",
            `Are you sure you want to delete "${groupName}"? All ${expenseCount} associated expenses will also be permanently removed.`,
            () => this.deleteGroup(groupId, groupName)
        );
    },

    deleteGroup(groupId, groupName) {
        this.data.groups = this.data.groups.filter(g => g.id !== groupId);
        this.data.expenses = this.data.expenses.filter(e => e.groupId !== groupId);
        // Note: This does not delete associated settlement records,
        // but they will no longer affect balances if expenses are gone.
        this.saveData();
        this.calculateDetailedBalances();
        this.showToast(`Group "${groupName}" and associated expenses deleted.`, 'success');
        this.navigateTo('groups');
    },

    // FIXED: Delete expense with custom modal
    confirmDeleteExpense(expenseId, expenseDescription) {
        this.showConfirmationModal(
            "Delete Expense",
            `Are you sure you want to delete "${expenseDescription}"? This action cannot be undone.`,
            () => this.deleteExpense(expenseId, expenseDescription)
        );
    },

    deleteExpense(expenseId, expenseDescription) {
        const expenseToDelete = this.data.expenses.find(e => e.id === expenseId);

        if (expenseToDelete) {
            this.data.groups = this.data.groups.map(g => {
                if (g.id === expenseToDelete.groupId) {
                    g.totalExpense -= expenseToDelete.amount;
                }
                return g;
            });

            this.data.expenses = this.data.expenses.filter(e => e.id !== expenseId);
            this.saveData();
            // We must recalculate all balances now that an expense is gone.
            this.calculateDetailedBalances();
            this.showToast(`Expense "${expenseDescription}" deleted.`, 'success');
            // Re-render the current page to show the deletion
            this.navigateTo(this.route);
        }
    },

    // --- MODIFIED FUNCTION ---
    // This function is the *start* of the settlement process.
    // It now calls the new, specific modal.
    confirmSettlement(payerId, recipientId, amount) {
        const recipientName = this.data.users.find(u => u.id === recipientId)?.name || 'the user';
        
        // Call our new, custom modal instead of the generic one.
        this.showPaymentMethodModal(payerId, recipientId, amount, recipientName);
    },

    //
    // --- 🚀 SYNC FIX: CORE LOGIC (Step 1) ---
    //
    // This is the function that executes when you confirm payment.
    // It does 4 critical things to solve the sync bug:
    //
    settleIndividualBalance(payerId, recipientId, amount, method = 'Other') {
        // 1. Create a new settlement record and add it to the *completed* list.
        const newSettlement = {
            id: (this.data.settlements.length > 0 ? Math.max(...this.data.settlements.map(s => s.id)) : 0) + 1,
            from: payerId, // The user who owes (debtor)
            to: recipientId, // The user who is owed (creditor)
            amount: amount,
            settledAt: new Date().toISOString(),
            status: 'settled',
            settledBy: this.user.id, // Log who clicked the button
            currency: 'INR', // Assume INR from settlement page
            method: method // <-- NEW: We log how it was paid (now includes detail)
        };
        this.data.settlements.push(newSettlement);
        
        // 2. Save the *new* completed list to localStorage.
        //    This is critical for persistence.
        this.saveData();
        
        // Bridge to backend: Send settlement to MongoDB
        const payerName = this.data.users.find(u => u.id === payerId)?.name || 'Unknown';
        const recipientName = this.data.users.find(u => u.id === recipientId)?.name || 'Unknown';

        fetch(`/api/settlements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                payer: payerName,
                recipient: recipientName,
                amount: amount,
                method: method
            })
        }).catch(err => console.error("Cloud Sync Error:", err));
        // =============================================

        // 3. Recalculate ALL balances.
        //    This tells the app to re-run the entire balance logic,
        //    which will now see the new settlement and calculate a new *net* balance.
        this.calculateDetailedBalances(); 
        
        // 4. Show success
        this.showToast(`Payment of ₹${amount.toFixed(2)} logged successfully (${method}).`, 'success');
        
        // 5. Re-render the payment page.
        //    This forces `renderPaymentPage()` to run again.
        //    `renderPaymentPage()` will call `calculateDetailedBalances()` again,
        //    get the *new* (and now empty) pending list, and get the
        //    *new* (and now longer) completed list, showing ₹0 Owed.
        this.navigateTo('payment');
    },

    // --- GROUP EDIT LOGIC ---
    setGroupEditMode(isEditing) {
        this.groupEditMode = isEditing;
        if (!isEditing && this.route === 'group-details') {
            this.pendingGroupMembers = [];
        }
        this.navigateTo('group-details', this.currentGroupId);
    },

    handleGroupDetailSubmission(e) {
        e.preventDefault();
        const groupId = parseInt(document.getElementById('groupId').value);
        const name = document.getElementById('groupName').value;
        const startDate = document.getElementById('groupStartDate').value;
        const endDate = document.getElementById('groupEndDate').value;
        const currency = document.getElementById('groupCurrency').value;

        const finalGroupMembers = [];
        this.pendingGroupMembers.forEach(pending => {
            let memberId = pending.id;

            if (typeof memberId === 'string' && memberId.startsWith('temp_')) {
                let existingUser = this.data.users.find(u => u.email === pending.email);

                if (!existingUser) {
                    const newUserId = (this.data.users.length > 0 ? Math.max(...this.data.users.map(u => u.id).filter(id => typeof id === 'number')) : 0) + 1;
                    existingUser = {
                        id: newUserId,
                        name: pending.name,
                        email: pending.email,
                        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(pending.name)}&background=random&color=fff`                    };
                    this.data.users.push(existingUser);
                }
                memberId = existingUser.id;
            } else {
                if (!this.data.users.some(u => u.id === pending.id)) {
                    this.data.users.push(pending);
                }
            }

            finalGroupMembers.push(memberId);
        });

        // Failsafe: Ensure the current user (admin) is always in the group
        if (!finalGroupMembers.includes(this.user.id)) {
            finalGroupMembers.push(this.user.id);
        }

        this.data.groups = this.data.groups.map(g => {
            if (g.id === groupId) {
                const uniqueMembers = Array.from(new Set(finalGroupMembers));
                return { ...g, name, startDate, endDate, currency, members: uniqueMembers };
            }
            return g;
        });

        this.pendingGroupMembers = [];
        this.saveData();
        this.groupEditMode = false;
        this.showToast(`Group '${name}' updated successfully.`, 'success');
        this.navigateTo('group-details', groupId);
    },

    // Modal Logic
    openModal(modalId, groupId = null) {
        this.customSplitShares = {};
        this.splitMethod = 'equal';

        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            if (modalId === 'addGroupModal') this.populateGroupForm();
            if (modalId === 'addExpenseModal') {
                this.customPayerContributions = {};
                this.initExpenseModal(groupId);
            }
        }
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    },

    populateGroupForm() {
        this.pendingGroupMembers = [{
            id: this.user.id,
            name: this.user.name,
            email: this.user.email,
            avatar: this.user.avatar
        }];
        this.renderPendingMembers();
    },

    renderPendingMembers() {
        const checklist = document.getElementById('pendingMemberChecklist');
        if (!checklist) return;

        if (this.pendingGroupMembers.length === 0) {
            checklist.innerHTML = '<p class="color-text-medium">No members added.</p>';
            return;
        }

        checklist.innerHTML = this.pendingGroupMembers.map(pending => {
            const u = this.data.users.find(user => user.id === pending.id) || pending;
            const isCurrentUser = u.id === this.user.id;
            const nameDisplay = `${u.name} ${isCurrentUser ? '(You)' : ''}`;
            // FIXED: Admin (current user) can never be removed.
            const isRemovable = !isCurrentUser;

            return `
                <div class="flex items-center justify-between gap-md mb-sm" style="padding: var(--space-sm); background-color: var(--color-gray-50); border-radius: var(--radius-base);">
                    <div class="flex items-center gap-sm">
                        <img src="${u.avatar}" class="avatar" style="width: 32px; height: 32px;">
                        <span style="font-weight: var(--font-weight-medium);">${nameDisplay}</span>
                    </div>
                    ${isRemovable ?
                        `<button type="button" class="btn btn-error" style="min-height: 32px; padding: var(--space-xs) var(--space-sm); font-size: var(--font-size-sm);" onclick="app.removePendingMember('${u.email}')">
                            <i class="fa-solid fa-xmark"></i>
                        </button>`
                        : '<small class="color-text-medium">Admin</small>'
                    }
                </div>
            `;
        }).join('');
    },

    addPendingMember() {
        const nameInput = document.getElementById('newMemberName');
        const emailInput = document.getElementById('newMemberEmail');
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();

        if (!name || !email) {
            this.showToast("Name and Email are required.", 'error');
            return;
        }

        if (!this.isValidEmail(email)) {
            this.showToast("Invalid email format.", 'error');
            return;
        }

        if (this.pendingGroupMembers.some(m => m.email === email)) {
            this.showToast("This email is already in the list.", 'warning');
            return;
        }

        let existingUser = this.data.users.find(u => u.email === email);

        const newMember = {
            id: existingUser ? existingUser.id : `temp_${Date.now()}`,
            name: name,
            email: email,
            avatar: existingUser ? existingUser.avatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`        };

        this.pendingGroupMembers.push(newMember);

        // FIXED: Use correct render path based on context
        if (this.route === 'group-details') {
            // Re-render the whole group detail page
            this.navigateTo('group-details', this.currentGroupId);
        } else {
            // Just update the list in the modal
            this.renderPendingMembers();
        }

        nameInput.value = '';
        emailInput.value = '';
        this.showToast(`${name} added to the group.`, 'success');
    },

    removePendingMember(email) {
        this.pendingGroupMembers = this.pendingGroupMembers.filter(m => m.email !== email);
        
        // FIXED: Use correct render path based on context
        if (this.route === 'group-details') {
            // Re-render the whole group detail page
            this.navigateTo('group-details', this.currentGroupId);
        } else {
            // Just update the list in the modal
            this.renderPendingMembers();
        }

        this.showToast(`Member removed.`, 'info');
    },

    // Expense Form Logic
    initExpenseModal(groupId = null) {
        const MAX_STEPS = 2;
        this.expenseStep = 1;
        this.updateExpenseStepUI();

        const expGroupSelect = document.getElementById('expGroup');
        if (expGroupSelect) {
            expGroupSelect.innerHTML = this.data.groups.map(g => `<option value="${g.id}">${g.name} (${g.currency})</option>`).join('');
        }

        const groupSelectionDiv = document.getElementById('groupSelection');

        if (groupId && expGroupSelect) {
            expGroupSelect.value = groupId;
            groupSelectionDiv.style.display = 'none';
        } else if (groupSelectionDiv) {
            groupSelectionDiv.style.display = 'block';
        }

        if (this.data.groups.length === 0) {
            if (expGroupSelect) expGroupSelect.innerHTML = '<option value="" disabled selected>No Groups. Create one first!</option>';
            const nextBtn = document.getElementById('nextStepBtn');
            if (nextBtn) nextBtn.disabled = true;
            this.showToast('You must create a group before logging an expense.', 'warning', 5000);
        } else {
            const nextBtn = document.getElementById('nextStepBtn');
            if (nextBtn) nextBtn.disabled = false;
        }

        if (expGroupSelect) {
            const initialGroupId = parseInt(expGroupSelect.value);
            this.updatePayerAndParticipantLists(initialGroupId);
            expGroupSelect.onchange = (e) => this.updatePayerAndParticipantLists(parseInt(e.target.value));
        }

        document.querySelectorAll('input[name="splitMethod"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.splitMethod = e.target.value;
                this.updatePayerAndParticipantLists(parseInt(document.getElementById('expGroup').value));
            });
        });

        document.getElementById('expensePayerChecklist')?.addEventListener('change', () => {
            this.renderPayerContributionInputs();
        });

        this.splitMethod = 'equal';
        document.querySelector('input[name="splitMethod"][value="equal"]').checked = true;
    },

    renderPayerContributionInputs() {
        const payerChecklist = document.getElementById('expensePayerChecklist');
        if (!payerChecklist) return;

        const selectedPayers = Array.from(payerChecklist.querySelectorAll('input[name="expensePayer"]:checked'))
            .map(el => parseInt(el.value));
        const expenseAmount = parseFloat(document.getElementById('expAmount')?.value) || 0;

        const existingArea = payerChecklist.closest('.modal-content').querySelector('#payerContributionArea');
        if (existingArea) existingArea.remove();

        if (selectedPayers.length <= 1) {
            this.customPayerContributions = {};
            return;
        }

        const defaultContribution = expenseAmount / selectedPayers.length;

        let tempContributions = {};
        let totalPaid = 0;

        selectedPayers.forEach(payerId => {
            let contribution = this.customPayerContributions[payerId] !== undefined
                ? parseFloat(this.customPayerContributions[payerId])
                : defaultContribution;

            tempContributions[payerId] = contribution;
            totalPaid += contribution;
        });

        this.customPayerContributions = tempContributions;

        const payerInputs = selectedPayers.map(payerId => {
            const u = this.data.users.find(user => user.id === payerId);
            if (!u) return '';

            const currentContribution = this.customPayerContributions[payerId].toFixed(2);

            return `
                <div class="flex justify-between items-center gap-md mb-sm" style="border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-sm);">
                    <span style="flex: 1.5; font-weight: var(--font-weight-medium);">${u.name}</span>
                    <input type="number" 
                        name="payerContributionInput" 
                        data-payer-id="${payerId}" 
                        value="${currentContribution}" 
                        step="0.01" min="0" required
                        class="payer-contribution-input"
                        style="flex: 1;">
                </div>
            `;
        }).join('');

        const newArea = document.createElement('div');
        newArea.id = 'payerContributionArea';
        newArea.className = 'card p-md mt-lg';
        newArea.innerHTML = `
            <h4 class="mb-sm">Custom Payer Contributions</h4>
            <p class="color-text-medium mb-md">Total must equal ₹${expenseAmount.toFixed(2)}</p>
            ${payerInputs}
            <div class="card p-sm mt-md" style="border: 2px solid var(--color-primary); background-color: var(--color-primary-light);">
                <div class="flex justify-between"><strong>Total Entered:</strong> <span id="payerContributionTotal">₹${totalPaid.toFixed(2)}</span></div>
                <div class="flex justify-between"><strong>Difference:</strong> <span id="payerContributionRemaining" class="indicator-green">₹${(totalPaid - expenseAmount).toFixed(2)}</span></div>
            </div>
        `;

        payerChecklist.closest('.mb-lg').after(newArea);

        document.querySelectorAll('.payer-contribution-input').forEach(input => {
            input.addEventListener('change', this.updatePayerContributionTotals.bind(this));
            input.addEventListener('keyup', this.updatePayerContributionTotals.bind(this));
        });

        this.updatePayerContributionTotals();
    },

    updatePayerContributionTotals() {
        const totalInputEl = document.getElementById('payerContributionTotal');
        const remainingEl = document.getElementById('payerContributionRemaining');
        const expenseAmount = parseFloat(document.getElementById('expAmount')?.value) || 0;

        let totalEntered = 0;
        this.customPayerContributions = {};

        document.querySelectorAll('.payer-contribution-input').forEach(input => {
            const amount = parseFloat(input.value) || 0;
            const payerId = parseInt(input.dataset.payerId);
            totalEntered += amount;
            this.customPayerContributions[payerId] = amount;
        });

        const difference = totalEntered - expenseAmount;

        if (totalInputEl) totalInputEl.textContent = `₹${totalEntered.toFixed(2)}`;
        if (remainingEl) {
            remainingEl.textContent = `₹${difference.toFixed(2)}`;
            if (Math.abs(difference) < 0.01) {
                remainingEl.className = 'indicator-green';
            } else {
                remainingEl.className = 'indicator-red';
            }
        }
    },

    updatePayerAndParticipantLists(groupId) {
        const group = this.data.groups.find(g => g.id === groupId);
        if (!group) return;

        // --- FIX: Ensure Admin is always in the member list for this operation ---
        // Get the member list from the group's data
        let membersInGroup = [...group.members];
 
        // Check if the current user (admin) is in this list.
        const adminIsPresent = membersInGroup.includes(this.user.id);
 
        // If the admin is NOT in the list (due to old/corrupt data),
        // forcefully add them to the list for this operation.
        if (!adminIsPresent) {
            membersInGroup.push(this.user.id);
            // We can optionally log this to the console if it happens
            console.warn(`Admin user ${this.user.id} was missing from group ${group.id}. Temporarily added for expense modal.`);
        }
        // --- END FIX ---
 
        const payerChecklist = document.getElementById('expensePayerChecklist');
        const participantChecklist = document.getElementById('expenseParticipantChecklist');
        const customSplitArea = document.getElementById('customSplitArea');
 
        if (payerChecklist) {
            // Use the 'membersInGroup' failsafe list instead of 'group.members'
            payerChecklist.innerHTML = membersInGroup.map(memberId => {
                const u = this.data.users.find(user => user.id === memberId);
                if (!u) return '';

                const isCurrentUser = u.id === this.user.id;
                const checked = (Object.keys(this.customPayerContributions).length > 0 && this.customPayerContributions[memberId] !== undefined) || (Object.keys(this.customPayerContributions).length === 0 && isCurrentUser) ? 'checked' : '';
                const nameDisplay = `${u.name} ${isCurrentUser ? '(You)' : ''}`;

                return `
                    <label class="flex items-center gap-md" style="padding: var(--space-sm); cursor: pointer; border-radius: var(--radius-base);">
                        <input type="checkbox" name="expensePayer" value="${memberId}" ${checked}>
                        <img src="${u.avatar}" class="avatar" style="width: 32px; height: 32px;">
                        <span style="font-weight: var(--font-weight-medium);">${nameDisplay}</span>
                    </label>
                `;
            }).join('');
        }
 
        if (this.expenseStep === 2) {
            this.renderPayerContributionInputs();
        }
 
        if (participantChecklist) {
            // Use the 'membersInGroup' failsafe list instead of 'group.members'
            participantChecklist.innerHTML = membersInGroup.map(memberId => {
                const u = this.data.users.find(user => user.id === memberId);
                if (!u) return '';

                const isCurrentUser = u.id === this.user.id;
                const nameDisplay = `${u.name} ${isCurrentUser ? '(You)' : ''}`;

                return `
                    <label class="flex items-center gap-md" style="padding: var(--space-sm); cursor: pointer; border-radius: var(--radius-base);">
                        <input type="checkbox" name="expenseParticipant" value="${memberId}" checked>
                        <img src="${u.avatar}" class="avatar" style="width: 32px; height: 32px;">
                        <span style="font-weight: var(--font-weight-medium);">${nameDisplay}</span>
                    </label>
                `;
            }).join('');
        }

        if (customSplitArea) {
            if (this.splitMethod === 'custom') {
                customSplitArea.style.display = 'block';
                const expenseAmount = parseFloat(document.getElementById('expAmount')?.value) || 0;
                this.renderCustomSplitInputs(groupId, expenseAmount);
            } else {
                customSplitArea.style.display = 'none';
            }
        }
    },

    renderCustomSplitInputs(groupId, expenseAmount) {
        const customSplitArea = document.getElementById('customSplitArea');
        const group = this.data.groups.find(g => g.id === groupId);
        if (!group || !customSplitArea) return;

        const participantIds = Array.from(document.querySelectorAll('input[name="expenseParticipant"]:checked'))
            .map(el => parseInt(el.value));

        const defaultShare = participantIds.length > 0 ? (expenseAmount / participantIds.length) : 0;

        const listHTML = participantIds.map(memberId => {
            const u = this.data.users.find(user => user.id === memberId);
            if (!u) return '';

            const isCurrentUser = u.id === this.user.id;
            const nameDisplay = `${u.name} ${isCurrentUser ? '(You)' : ''}`;

            let share = (this.customSplitShares[memberId] !== undefined)
                ? (parseFloat(this.customSplitShares[memberId]) || 0).toFixed(2)
                : defaultShare.toFixed(2);

            return `
                <div class="flex justify-between items-center gap-md mb-sm" style="border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-sm);">
                    <div class="flex items-center gap-sm" style="flex: 1.5;">
                        <img src="${u.avatar}" class="avatar" style="width: 32px; height: 32px;">
                        <span style="font-weight: var(--font-weight-medium);">${nameDisplay}</span>
                    </div>
                    <input type="number" 
                            name="customShareInput" 
                            data-member-id="${memberId}" 
                            value="${share}" 
                            step="0.01" 
                            min="0" 
                            required
                            class="custom-share-input"
                            style="flex: 1;">
                </div>
            `;
        }).join('');

        customSplitArea.innerHTML = `
            <div id="customSplitDetails">
                <h4 class="mb-sm">Custom Split Amounts</h4>
                <p class="color-text-medium mb-md">Total must equal ₹${expenseAmount.toFixed(2)}</p>
                <div id="customSplitList" class="flex-col gap-sm">
                    ${listHTML || '<p class="color-text-medium">No participants selected.</p>'}
                </div>
                <div class="card p-sm mt-md" style="border: 2px solid var(--color-primary); background-color: var(--color-primary-light);">
                    <div class="flex justify-between"><strong>Total Entered:</strong> <span id="customSplitTotal">₹0.00</span></div>
                    <div class="flex justify-between"><strong>Difference:</strong> <span id="customSplitRemaining" class="indicator-green">₹${expenseAmount.toFixed(2)}</span></div>
                </div>
            </div>
        `;

        document.querySelectorAll('.custom-share-input').forEach(input => {
            input.addEventListener('change', this.updateCustomSplitTotals.bind(this));
            input.addEventListener('keyup', this.updateCustomSplitTotals.bind(this));
        });

        this.updateCustomSplitTotals();
    },

    updateCustomSplitTotals() {
        const totalInputEl = document.getElementById('customSplitTotal');
        const remainingEl = document.getElementById('customSplitRemaining');
        const expenseAmount = parseFloat(document.getElementById('expAmount')?.value) || 0;

        let totalEntered = 0;
        this.customSplitShares = {};

        document.querySelectorAll('.custom-share-input').forEach(input => {
            const amount = parseFloat(input.value) || 0;
            const memberId = parseInt(input.dataset.memberId);
            totalEntered += amount;
            this.customSplitShares[memberId] = amount;
        });

        const difference = totalEntered - expenseAmount;

        if (totalInputEl) totalInputEl.textContent = `₹${totalEntered.toFixed(2)}`;
        if (remainingEl) {
            remainingEl.textContent = `₹${difference.toFixed(2)}`;
            if (Math.abs(difference) < 0.01) {
                remainingEl.className = 'indicator-green';
            } else {
                remainingEl.className = 'indicator-red';
            }
        }
    },

    updateExpenseStepUI() {
        const MAX_STEPS = 2;
        const stepsElements = document.querySelectorAll('.expense-step-content');
        const progressDots = document.querySelectorAll('.progress-step-item');

        stepsElements.forEach(el => el.style.display = 'none');
        if (stepsElements[this.expenseStep - 1]) {
            stepsElements[this.expenseStep - 1].style.display = 'block';
        }

        document.querySelector('.progress-step-item[data-step="3"]')?.style.setProperty('display', 'none');

        progressDots.forEach(dot => {
            const stepNum = parseInt(dot.dataset.step);
            if (stepNum > MAX_STEPS) return;

            dot.classList.remove('active', 'done');
            if (stepNum < this.expenseStep) dot.classList.add('done');
            else if (stepNum === this.expenseStep) dot.classList.add('active');
        });

        document.getElementById('prevStepBtn').style.display = (this.expenseStep > 1) ? 'inline-flex' : 'none';
        document.getElementById('nextStepBtn').style.display = (this.expenseStep < MAX_STEPS) ? 'inline-flex' : 'none';
        document.getElementById('submitExpenseBtn').style.display = (this.expenseStep === MAX_STEPS) ? 'inline-flex' : 'none';
    },

    // --- Settlement Logic ---

    //
    // --- 🚀 SYNC FIX: CORE LOGIC (Step 2) ---
    //
    // This function is called by the Dashboard (`renderDashboard`).
    // It is the *consumer* of the final, correct data.
    //
    calculateBalances() {
        // 1. Run the master calculation first. This function (defined below)
        //    recalculates EVERYTHING from scratch and updates `this.individualBalances`
        //    to hold the final *net* debt.
        this.calculateDetailedBalances();

        let netBalance = 0;
        const currentUserId = this.user.id;

        // 2. Check the `this.individualBalances` map (which is now up-to-date)
        //    to see if anyone owes the current user.
        for (const payerId in this.individualBalances) {
            // Someone (payerId) owes the current user
            if (this.individualBalances[payerId][currentUserId]) {
                netBalance += this.individualBalances[payerId][currentUserId];
            }
        }

        // 3. Check the map to see if the current user owes anyone.
        if (this.individualBalances[currentUserId]) {
            // The current user owes someone (recipientId)
            for (const recipientId in this.individualBalances[currentUserId]) {
                netBalance -= this.individualBalances[currentUserId][recipientId];
            }
        }

        let totalExpenses = 0;
        const userConversionRate = 83.5;
        this.data.expenses.forEach(exp => {
            let amountINR = exp.amount;
            if (exp.currency !== 'INR') amountINR *= userConversionRate;
            totalExpenses += amountINR;
        });

        // 4. Return the final net position.
        //    If `netBalance` is -25, `owe` becomes 25.
        //    If `netBalance` is 0 (after settling), `owe` becomes 0.
        return {
            totalExpenses: Math.round(totalExpenses),
            // FIXED: Removed Math.round to use precise float values
            lent: Math.max(0, netBalance),
            owe: Math.max(0, -netBalance)
        };
    },

    //
    // --- 🚀 SYNC FIX: CORE LOGIC (Step 3) ---
    //
    // This is the most important function in the app. It is the
    // "Single Source of Truth" calculator. It is called by *everyone*:
    // - `init()` on page load
    // - `settleIndividualBalance()` after paying
    // - `calculateBalances()` for the dashboard
    // - `renderPaymentPage()` for the settlement list
    //
    // It works in 3 steps:
    //
    calculateDetailedBalances() {
        const userCurrencyRate = 83.5;
        // This object stores the GROSS debt calculated from expenses
        // We *must* reset it every time to recalculate from scratch.
        this.individualBalances = {};

        // --- STEP 1: Calculate GROSS debt from all expenses ---
        // Iterate every expense and build a map of who-owes-who.
        this.data.expenses.forEach(exp => {
            let amountINR = exp.amount;
            if (exp.currency !== 'INR') amountINR *= userCurrencyRate;

            const numPayers = exp.payerIds.length;
            const expenseCredit = amountINR;

            let totalDebtShare = 0;
            const debtShares = {};

            exp.participants.forEach(pId => {
                let debtShare;

                if (exp.customSplitShares && exp.customSplitShares[pId] !== undefined) {
                    debtShare = parseFloat(exp.customSplitShares[pId]) || 0;
                } else if (exp.customSplitShares) {
                    debtShare = 0;
                } else {
                    debtShare = exp.participants.length > 0 ? amountINR / exp.participants.length : 0;
                }

                debtShares[pId] = debtShare;
                totalDebtShare += debtShare;
            });

            let totalCustomContribution = 0;

            if (exp.customPayerContributions && Object.keys(exp.customPayerContributions).length > 0) {
                totalCustomContribution = Object.values(exp.customPayerContributions).reduce((sum, amount) => sum + amount, 0);
            } else {
                totalCustomContribution = expenseCredit;
            }

            exp.participants.forEach(debtorId => {
                const debt = debtShares[debtorId] || 0;
                if (debt < 0.01) return;

                if (exp.customPayerContributions && totalCustomContribution > 0) {
                    exp.payerIds.forEach(creditorId => {
                        const proportion = (exp.customPayerContributions[creditorId] || 0) / totalCustomContribution;
                        const splitDebtToPayer = debt * proportion;

                        if (debtorId !== creditorId) {
                            this.individualBalances[debtorId] = this.individualBalances[debtorId] || {};
                            this.individualBalances[debtorId][creditorId] = (this.individualBalances[debtorId][creditorId] || 0) + splitDebtToPayer;
                        }
                    });
                } else {
                    const splitDebtToPayer = debt / numPayers;

                    exp.payerIds.forEach(creditorId => {
                        if (debtorId !== creditorId) {
                            this.individualBalances[debtorId] = this.individualBalances[debtorId] || {};
                            this.individualBalances[debtorId][creditorId] = (this.individualBalances[debtorId][creditorId] || 0) + splitDebtToPayer;
                        }
                    });
                }
            });
        });
        // At this point, `this.individualBalances` holds the TOTAL GROSS DEBT.
        // e.g., { Sanika: { Drishti: 25 } }

        // --- STEP 2: Subtract all recorded settlements from GROSS debt ---
        // This is the magic. We now iterate the *completed* payments list
        // and subtract them from the gross debt to find the *net* debt.
        this.data.settlements.forEach(settlement => {
            const payerId = settlement.from;
            const recipientId = settlement.to;
            const amount = settlement.amount;

            // Find the debt entry (payerId owes recipientId) and subtract the settled amount
            if (this.individualBalances[payerId] && this.individualBalances[payerId][recipientId]) {
                this.individualBalances[payerId][recipientId] -= amount;

                // If the debt is paid off (or overpaid), remove the entry
                if (this.individualBalances[payerId][recipientId] < 0.01) {
                    delete this.individualBalances[payerId][recipientId];
                    if (Object.keys(this.individualBalances[payerId]).length === 0) {
                        delete this.individualBalances[payerId];
                    }
                }
            }
        });
        // At this point, `this.individualBalances` holds the TOTAL NET DEBT.
        // e.g., After paying, it becomes { }

        // --- STEP 3: Simplify the remaining NET debt ---
        // (This part is for the Settlement Page, to show the *optimized* list of payments)
        const userNetBalances = {};
        this.data.users.forEach(u => userNetBalances[u.id] = { ...u, balance: 0 }); // Store full user object

        // Calculate the final net balance for each user
        for (const payerId in this.individualBalances) {
            for (const recipientId in this.individualBalances[payerId]) {
                const amount = this.individualBalances[payerId][recipientId];

                if (userNetBalances[recipientId]) userNetBalances[recipientId].balance += amount;
                if (userNetBalances[payerId]) userNetBalances[payerId].balance -= amount;
            }
        }

        const activeBalances = Object.values(userNetBalances).filter(b => Math.abs(b.balance) > 0.01);

        const givers = activeBalances.filter(b => b.balance > 0).sort((a, b) => b.balance - a.balance);
        const takers = activeBalances.filter(b => b.balance < 0).sort((a, b) => a.balance - b.balance);

        const settlements = []; // This is the *pending* settlements list
        let gIdx = 0;
        let tIdx = 0;

        // Simplify the net debt into the minimum number of transactions
        while (gIdx < givers.length && tIdx < takers.length) {
            let giver = givers[gIdx];
            let taker = takers[tIdx];

            let payment = Math.min(giver.balance, -taker.balance);

            if (payment > 0.01) {
                // REVERTED: Removed Math.round calculation as requested
                // Using the raw float value directly.
                const finalPayment = payment;

                // Only proceed if the payment amount is valid
                if (finalPayment > 0.01) {
                    // The simplified settlement: taker pays giver
                    settlements.push({
                        payer: taker, // The one with a negative balance (owes money)
                        recipient: giver, // The one with a positive balance (is owed money)
                        amount: finalPayment // Use the raw payment amount
                    });

                    // Subtract the *exact* payment amount from the balances
                    giver.balance -= finalPayment;
                    taker.balance += finalPayment;
                } else {
                    // If the payment is 0.00, just clear the original float
                    // to prevent an infinite loop, but don't create a settlement.
                    giver.balance -= payment;
                    taker.balance += payment;
                }

            }

            if (giver.balance < 0.01) gIdx++;
            if (taker.balance > -0.01) tIdx++;
        }

        // Save the calculated net balances (for quick load)
        // This ensures the new `this.individualBalances` (which is now net)
        // is saved to localStorage.
        this.saveData();

        // --- [MODIFIED] 3. ASK SERVER TO CALCULATE ---
        // We send the data to the server for the demo, but we do NOT overwrite 
        // the 'settlements' variable above, so your app flow remains unchanged.
        fetch(`/api/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expenses: this.data.expenses })
        })
        .then(response => response.json())
        .then(data => {
            console.log("Server-Side Settlement Plan:", data.transactions);
            // NOTE: We are just logging the server response to console as requested.
            // The app continues to use the local 'settlements' array for the UI.
        })
        .catch(error => console.error('Error fetching calculation from cloud:', error));
        // --- [END MODIFIED] ---

        // Return the net balances and the simplified (unpaid) settlements
        return { userBalances: userNetBalances, settlements };
    },
    // --- End of Settlement Fix ---

    // Toast Notifications
    showToast(message, type = 'info', duration = 3000) {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `card toast-${type}`;

        let color = 'var(--color-info)';
        if (type === 'success') color = 'var(--color-success)';
        if (type === 'error') color = 'var(--color-error)';
        if (type === 'warning') color = 'var(--color-warning)';

        toast.style.cssText = `
            margin-bottom: var(--space-sm); 
            padding: var(--space-md) var(--space-lg); 
            border-left: 4px solid ${color};
            cursor: pointer; 
            box-shadow: var(--shadow-lg); 
            max-width: 400px;
            background-color: var(--color-surface); 
            border-radius: var(--radius-base);
            font-size: var(--font-size-base);
            animation: slideIn 0.3s ease-out;
        `;

        toast.textContent = message;
        toast.onclick = () => toast.remove();
        toastContainer.prepend(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    // --- 5. Initialization and Events ---
    initializePageScripts(route, groupId = null) {
        if (route === 'activity' && this.data.expenses.length > 0) {
            const chartCanvas = document.getElementById('spendingTrendChart');
            const categoryCanvas = document.getElementById('categoryChart');
            const userExpenses = this.data.expenses.filter(exp => exp.payerIds.includes(this.user.id));
            const spendingData = this.calculateSpendingTrendData(userExpenses);
            const categories = this.categorizeExpenses(this.data.expenses);

            if (chartCanvas) {
                if (chartCanvas.chartInstance) {
                    chartCanvas.chartInstance.destroy();
                }

                chartCanvas.chartInstance = new Chart(chartCanvas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: spendingData.labels,
                        datasets: [{
                            label: 'Daily Spend (₹)',
                            data: spendingData.data,
                            backgroundColor: 'rgba(27, 154, 170, 0.8)',
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                    }
                });
            }

            if (categoryCanvas) {
                if (categoryCanvas.chartInstance) {
                    categoryCanvas.chartInstance.destroy();
                }

                categoryCanvas.chartInstance = new Chart(categoryCanvas.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(categories),
                        datasets: [{
                            label: 'Spending by Category',
                            data: Object.values(categories),
                            backgroundColor: [
                                'rgba(59, 130, 246, 0.8)',
                                'rgba(245, 158, 11, 0.8)',
                                'rgba(34, 197, 94, 0.8)',
                                'rgba(239, 68, 68, 0.8)',
                                'rgba(147, 51, 234, 0.8)',
                                'rgba(249, 115, 22, 0.8)',
                                'rgba(236, 72, 153, 0.8)',
                                'rgba(6, 182, 212, 0.8)',
                            ],
                            borderColor: 'var(--color-surface)',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                    }
                });
            }
        }

        if (route === 'login') {
            document.getElementById('loginForm')?.addEventListener('submit', (e) => {
                e.preventDefault();
                this.login(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
            });
        } else if (route === 'register') {
            document.getElementById('registerForm')?.addEventListener('submit', (e) => {
                e.preventDefault();
                this.register(
                    document.getElementById('regName').value,
                    document.getElementById('regEmail').value,
                    document.getElementById('regPassword').value,
                    document.getElementById('regConfirmPassword').value
                );
            });
        } else if (route === 'profile') {
            document.getElementById('editProfileBtn')?.addEventListener('click', () => {
                this.profileEditMode = true;
                this.navigateTo('profile');
            });

            document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
                this.profileEditMode = false;
                this.navigateTo('profile');
            });

            // This single submit handler now saves all fields from all cards in the form
            document.getElementById('profileForm')?.addEventListener('submit', (e) => {
                e.preventDefault();

                const name = document.getElementById('profileName').value;
                const phone = document.getElementById('profilePhone').value;
                const address = document.getElementById('profileAddress').value;
                const bio = document.getElementById('profileBio').value;

                if (phone && !/^\d{10}$/.test(phone)) {
                    this.showToast('Phone number should be 10 digits.', 'error');
                    return;
                }

                // --- NEW CODE ADDED HERE ---
                // We read the values from the new form fields
                const upi = document.getElementById('profileUpi').value;
                const paymentEmail = document.getElementById('profilePaymentEmail').value;
                // --- END OF NEW CODE ---

                this.user.name = name;
                this.user.phone = phone;
                this.user.address = address;
                this.user.bio = bio;

                // --- NEW CODE ADDED HERE ---
                // We save the new values to the user object
                this.user.upi = upi;
                this.user.paymentEmail = paymentEmail;
                // --- END OF NEW CODE ---

                this.data.users = this.data.users.map(u => u.id === this.user.id ? this.user : u);
                this.saveData();

                this.profileEditMode = false;
                this.showToast('Profile updated successfully!', 'success');
                this.navigateTo('profile');
            });

            document.getElementById('resetDataBtn')?.addEventListener('click', () => {
                this.resetData();
            });
        } else if (route === 'group-details') {
            document.getElementById('groupDetailForm')?.addEventListener('submit', (e) => {
                this.handleGroupDetailSubmission(e);
            });

            if (this.groupEditMode) {
                document.getElementById('addMemberBtn')?.addEventListener('click', () => {
                    this.addPendingMember();
                });
            }
        }

        const stepsElements = document.querySelectorAll('.expense-step-content');
        if (stepsElements.length > 0) {
            const MAX_STEPS = 2;

            stepsElements.forEach((el, index) => el.style.display = (index === 0) ? 'block' : 'none');

            document.getElementById('nextStepBtn').onclick = () => {
                if (this.expenseStep === 1) {
                    const expGroup = document.getElementById('expGroup').value;
                    const expDescription = document.getElementById('expDescription').value.trim();
                    const expAmount = document.getElementById('expAmount').value;

                    if (!expGroup || !expDescription || !expAmount || this.data.groups.length === 0) {
                        this.showToast('Please fill out all required fields.', 'error');
                        return;
                    }
                    if (parseFloat(expAmount) <= 0) {
                        this.showToast('Amount must be greater than zero.', 'error');
                        return;
                    }
                }

                if (this.expenseStep < MAX_STEPS) {
                    this.expenseStep++;
                    this.updatePayerAndParticipantLists(parseInt(document.getElementById('expGroup').value));
                    this.updateExpenseStepUI();
                }
            };

            document.getElementById('prevStepBtn').onclick = () => {
                if (this.expenseStep > 1) {
                    this.expenseStep--;
                    this.updatePayerAndParticipantLists(parseInt(document.getElementById('expGroup').value));
                    this.updateExpenseStepUI();
                }
            };
        }
    },

    attachStaticHandlers() {
        document.getElementById('addMemberBtn')?.addEventListener('click', () => {
            if (this.route !== 'group-details') {
                this.addPendingMember();
            }
        });

        document.getElementById('groupForm')?.addEventListener('submit', (e) => {
            e.preventDefault();

            if (this.pendingGroupMembers.length <= 0) {
                this.showToast("Cannot create a group without members.", 'error');
                return;
            }

            const name = document.getElementById('groupName').value;
            // Get currency for the fetch call
            const currency = document.getElementById('groupCurrency').value; 
            const groupMembers = [];

            // --- [MODIFIED] 1. ADD TRIP TO BACKEND ---
            // We send this to the server, but we continue with local logic immediately below
            fetch(`/api/trips`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, currency: currency })
            })
            .then(response => response.json())
            .then(data => {
                console.log("Trip saved to Cloud:", data);
                // alert("Trip Created in Cloud!"); // Uncomment if you want an alert
            })
            .catch(error => console.error('Error saving trip to cloud:', error));
            // --- [END MODIFIED] ---

            this.pendingGroupMembers.forEach(pending => {
                let memberId = pending.id;

                if (memberId !== this.user.id) {
                    let existingUser = this.data.users.find(u => u.email === pending.email);

                    if (!existingUser) {
                        const newUserId = (this.data.users.length > 0 ? Math.max(...this.data.users.map(u => u.id).filter(id => typeof id === 'number')) : 0) + 1;
                        existingUser = {
                            id: newUserId,
                            name: pending.name,
                            email: pending.email,
                            avatar: `https://via.placeholder.com/80/${Math.floor(Math.random()*16777215).toString(16)}/FFFFFF?text=${pending.name.charAt(0)}`
                        };
                        this.data.users.push(existingUser);
                    }
                    memberId = existingUser.id;
                }

                groupMembers.push(memberId);
            });

            // Failsafe: Ensure the current user (admin) is always in the group
            if (!groupMembers.includes(this.user.id)) {
                groupMembers.push(this.user.id);
            }

            const newId = (this.data.groups.length > 0 ? Math.max(...this.data.groups.map(g => g.id)) : 100) + 1;
            this.data.groups.push({
                id: newId, name: name, members: groupMembers, currency: document.getElementById('groupCurrency').value,
                totalExpense: 0, startDate: document.getElementById('groupStartDate').value, endDate: document.getElementById('groupEndDate').value
            });

            this.saveData();
            this.showToast(`Group '${name}' created successfully!`, 'success');
            this.closeModal('addGroupModal');
            if (this.route === 'groups') this.render();
        });

        document.getElementById('expenseForm')?.addEventListener('submit', (e) => {
            e.preventDefault();

            const payerIds = Array.from(document.querySelectorAll('input[name="expensePayer"]:checked')).map(el => parseInt(el.value));
            const participantIds = Array.from(document.querySelectorAll('input[name="expenseParticipant"]:checked')).map(el => parseInt(el.value));
            const expenseAmount = parseFloat(document.getElementById('expAmount')?.value) || 0;
            const groupId = parseInt(document.getElementById('expGroup').value);
            const description = document.getElementById('expDescription').value;

            if (payerIds.length === 0) {
                this.showToast('Select at least one person who paid.', 'error');
                return;
            }
            if (participantIds.length === 0) {
                this.showToast('Select at least one participant.', 'error');
                return;
            }

            if (payerIds.length > 1) {
                const totalPaid = Object.values(this.customPayerContributions).reduce((sum, amount) => sum + amount, 0);
                const paidDifference = Math.abs(totalPaid - expenseAmount);

                if (paidDifference > 0.01) {
                    this.showToast(`Payer contributions don't match expense amount.`, 'error');
                    return;
                }
            }

            if (this.splitMethod === 'custom') {
                const totalEntered = Object.values(this.customSplitShares).reduce((sum, amount) => sum + amount, 0);
                const splitDifference = Math.abs(totalEntered - expenseAmount);

                if (splitDifference > 0.01) {
                    this.showToast(`Custom shares don't match expense amount.`, 'error');
                    this.expenseStep = 2;
                    this.updateExpenseStepUI();
                    return;
                }
            }

            // --- [MODIFIED] 2. ADD EXPENSE TO BACKEND ---
            // Preparation: Get names from IDs to match the fetch snippet structure
            const firstPayer = this.data.users.find(u => u.id === payerIds[0]);
            const payerName = firstPayer ? firstPayer.name : 'Unknown';
            
            const selectedParticipants = participantIds.map(id => {
                const u = this.data.users.find(user => user.id === id);
                return u ? u.name : 'Unknown';
            });

            const currentTripId = groupId; // Using the actual selected Group ID

            fetch(`/api/trips/${currentTripId}/expenses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payer: payerName,        // First payer name
                    amount: expenseAmount,   
                    description: description, 
                    participants: selectedParticipants 
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log("Expense saved to Cloud:", data);
                // alert("Expense Added to Cloud!"); // Uncomment if desired
            })
            .catch(error => console.error('Error saving expense to cloud:', error));
            // --- [END MODIFIED] ---

            const newExp = {
                id: (this.data.expenses.length > 0 ? Math.max(...this.data.expenses.map(exp => exp.id)) : 0) + 1,
                groupId: groupId,
                description: description,
                amount: expenseAmount,
                currency: document.getElementById('expCurrency').value,
                payerIds: payerIds,
                participants: participantIds,
                date: document.getElementById('expDate').value,
                settled: false,
                customSplitShares: this.splitMethod === 'custom' ? this.customSplitShares : null,
                customPayerContributions: payerIds.length > 1 ? this.customPayerContributions : null
            };

            this.data.expenses.push(newExp);
            this.data.groups = this.data.groups.map(g => g.id === newExp.groupId ? { ...g, totalExpense: g.totalExpense + newExp.amount } : g);

            this.saveData();
            // Recalculate balances now that a new expense is added
            this.calculateDetailedBalances();

            this.showToast(`Expense "${newExp.description}" added successfully!`, 'success');
            this.closeModal('addExpenseModal');
            this.navigateTo('dashboard');
        });
    },

    init() {
        // 1. Load all data from localStorage
        this.loadData();
        this.attachStaticHandlers();

        // 2. Calculate balances on initial load
        // This is critical. It populates `this.individualBalances`
        // with the correct *net* debt (Expenses - Settlements)
        this.calculateDetailedBalances();

        const savedAuth = localStorage.getItem('isAuthenticated') === 'true';

        if (savedAuth && this.savedUserId) {
            const user = this.data.users.find(u => u.id === this.savedUserId);
            if (user) {
                if (user.phone === undefined) user.phone = '';
                if (user.address === undefined) user.address = '';
                if (user.bio === undefined) user.bio = '';

                // --- NEW CODE ADDED HERE ---
                // This ensures the app doesn't crash for old users
                // who don't have these properties yet.
                if (user.upi === undefined) user.upi = '';
                if (user.paymentEmail === undefined) user.paymentEmail = '';
                // --- END OF NEW CODE ---

                this.isAuthenticated = true;
                this.user = user;

                const hash = window.location.hash.slice(1);
                const parts = hash.split('/');
                const route = parts[0] || 'dashboard';
                const groupId = parts.length > 1 ? parseInt(parts[1]) : null;

                // 3. Navigate to the correct page
                // This will trigger render() -> renderDashboard() -> calculateBalances()
                // which will read the correctly-calculated net balances.
                this.navigateTo(route, groupId);

            } else {
                this.logout();
            }
        } else {
            this.navigateTo('login');
        }
    }
};

window.app = App;
App.init();