const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
export const API_BASE_URL = API_URL.replace(/\/api\/?$/, '');
export const resolveAssetUrl = (value?: string) => {
  if (!value) return '';
  if (value.startsWith('/')) return `${API_BASE_URL}${value}`;
  return value;
};

interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers: HeadersInit = isFormData
      ? { ...options.headers }
      : { 'Content-Type': 'application/json', ...options.headers };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
      });

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      let data: any;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.ok) {
        throw new Error(data.message || `API request failed: ${response.statusText}`);
      }

      return data;
    } catch (error) {
      // Handle network errors
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error('Network error: Unable to connect to the server. Please check your connection.');
      }
      throw error;
    }
  }

  // Auth endpoints
  async getNonce(walletAddress: string) {
    return this.request<{ nonce: string; message: string }>(`/auth/nonce?walletAddress=${walletAddress}`);
  }

  async loginWithWallet(walletAddress: string, signature: string, message: string) {
    const response = await this.request<{ user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress, signature, message }),
    });

    return response;
  }

  async getProfile() {
    return this.request<{ user: any }>('/auth/profile');
  }

  async logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  async topUp(amount: number) {
    return this.request<{ balance: number }>('/user/topup', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }

  async getEthPrice() {
    return this.request<{ price: number; updatedAt: number }>('/wallet/price');
  }

  async confirmDeposit(txHash: string) {
    return this.request<{ balance?: number; pending?: boolean; confirmations?: number }>('/wallet/deposit/confirm', {
      method: 'POST',
      body: JSON.stringify({ txHash }),
    });
  }

  async claimToken(caseId: string) {
    return this.request<{ amount: number; txHash: string; tokenAddress: string }>('/token/claim', {
      method: 'POST',
      body: JSON.stringify({ caseId }),
    });
  }

  async upgradeItem(itemIds: string[], multiplier: number) {
    return this.request<{ success: boolean; targetValue: number; newItem?: any; burntItemIds?: string[]; consumedItemIds?: string[] }>(
      '/user/upgrade',
      {
        method: 'POST',
        body: JSON.stringify({ itemIds, multiplier }),
      }
    );
  }

  async recordBattle(result: string, cost: number, wonItems: any[], options?: { reserveItems?: any[]; mode?: 'BOT' | 'PVP'; lobbyId?: string }) {
    return this.request<{ items: any[] }>('/user/battles/record', {
      method: 'POST',
      body: JSON.stringify({
        result,
        cost,
        wonItems,
        reserveItems: options?.reserveItems || [],
        mode: options?.mode || 'PVP',
        lobbyId: options?.lobbyId || null,
      }),
    });
  }

  async chargeBattle(amount: number) {
    return this.request<{ balance: number }>('/user/battles/charge', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }

  async createBattleLobby(caseIds: string[]) {
    return this.request<{ lobby: any }>('/user/battles/lobbies', {
      method: 'POST',
      body: JSON.stringify({ caseIds }),
    });
  }

  async getBattleLobbies() {
    return this.request<{ lobbies: any[] }>('/user/battles/lobbies');
  }

  async joinBattleLobby(lobbyId: string) {
    return this.request<{ lobby: any }>(`/user/battles/lobbies/${lobbyId}/join`, {
      method: 'POST',
    });
  }

  async startBattleLobby(lobbyId: string, mode: 'BOT' | 'PVP') {
    return this.request<{ lobby: any }>(`/user/battles/lobbies/${lobbyId}/start`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  }

  async resolveBattle(caseIds: string[], mode: 'BOT' | 'PVP') {
    return this.request<{ mode: 'BOT' | 'PVP'; userDrops: any[]; opponentDrops: any[] }>('/user/battles/resolve', {
      method: 'POST',
      body: JSON.stringify({ caseIds, mode }),
    });
  }

  async finishBattleLobby(lobbyId: string) {
    return this.request<{ lobby: any }>(`/user/battles/lobbies/${lobbyId}/finish`, {
      method: 'POST',
    });
  }

  async finishBattleLobbyWithWinner(lobbyId: string, winnerName: string) {
    return this.request<{ lobby: any }>(`/user/battles/lobbies/${lobbyId}/finish`, {
      method: 'POST',
      body: JSON.stringify({ winnerName }),
    });
  }

  async sendFeedback(payload: { topic: 'BUG_REPORT' | 'EARLY_ACCESS' | 'PARTNERSHIP'; contact: string; message: string }) {
    return this.request<{ id: string }>('/user/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateProfile(username: string) {
    return this.request<{ user: any }>('/user/profile', {
      method: 'PATCH',
      body: JSON.stringify({ username }),
    });
  }

  async uploadAvatar(file: File, meta?: Record<string, any>) {
    const form = new FormData();
    form.append('file', file);
    if (meta) {
      form.append('meta', JSON.stringify(meta));
    }
    return this.request<{ avatarUrl: string; user: any }>('/user/avatar', {
      method: 'POST',
      body: form,
    });
  }

  async updateAvatarMeta(meta: Record<string, any>) {
    return this.request<{ user: any }>('/user/avatar-meta', {
      method: 'PATCH',
      body: JSON.stringify({ meta }),
    });
  }

  async checkUsernameAvailability(username: string) {
    return this.request<{ available: boolean; reason?: string }>(
      `/user/username/check?username=${encodeURIComponent(username)}`
    );
  }

  // Case endpoints
  async getCases(includeStats = false) {
    const query = includeStats ? '?includeStats=1' : '';
    return this.request<{ cases: any[] }>(`/cases${query}`);
  }

  async getCaseById(id: string) {
    return this.request<{ case: any }>(`/cases/${id}`);
  }

  async createCase(caseData: any) {
    return this.request<{ case: any; balance?: number }>('/cases', {
      method: 'POST',
      body: JSON.stringify(caseData),
    });
  }

  async uploadCaseImage(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.request<{ imageUrl: string }>('/cases/upload', {
      method: 'POST',
      body: form,
    });
  }

  async openCase(caseId: string) {
    return this.request<{ wonDrop: any }>(`/cases/${caseId}/open`, {
      method: 'POST',
    });
  }

  // Health check
  async healthCheck() {
    return this.request<{ status: string; timestamp: string }>('/health');
  }

  // Admin endpoints
  async getAdminUsers() {
    return this.request<{ users: any[] }>('/admin/users');
  }

  async getAdminUserDetail(userId: string) {
    return this.request<{ user: any; burntItems: any[] }>(`/admin/users/${userId}`);
  }

  async updateAdminUserRole(userId: string, role: string) {
    return this.request<{ user: any }>(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async updateAdminUserBan(userId: string, isBanned: boolean) {
    return this.request<{ user: any }>(`/admin/users/${userId}/ban`, {
      method: 'PATCH',
      body: JSON.stringify({ isBanned }),
    });
  }

  async updateAdminUserBalance(userId: string, balance: number) {
    return this.request<{ user: any }>(`/admin/users/${userId}/balance`, {
      method: 'PATCH',
      body: JSON.stringify({ balance }),
    });
  }


  async getAdminCases() {
    return this.request<{ cases: any[] }>('/admin/cases');
  }

  async getAdminCaseDetail(caseId: string) {
    return this.request<{ case: any }>(`/admin/cases/${caseId}`);
  }

  async updateAdminCase(caseId: string, payload: any) {
    return this.request<{ case: any }>(`/admin/cases/${caseId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async getAdminBattles() {
    return this.request<{ battles: any[] }>('/admin/battles');
  }

  async getAdminInventory() {
    return this.request<{ items: any[] }>('/admin/inventory');
  }

  async getAdminTransactions() {
    return this.request<{ transactions: any[] }>('/admin/transactions');
  }

  async getAdminRtuLedgers() {
    return this.request<{ ledgers: any[] }>('/admin/rtu/ledgers');
  }

  async getAdminRtuEvents() {
    return this.request<{ events: any[] }>('/admin/rtu/events');
  }

  async adjustAdminRtu(payload: { caseId: string; tokenSymbol: string; deltaToken: number; deltaSpentUsdt?: number; reason?: string }) {
    return this.request('/admin/rtu/adjust', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }


  async getAdminSettings() {
    return this.request<{ settings: any[] }>('/admin/settings');
  }

  async updateAdminSetting(key: string, value: any) {
    return this.request<{ setting: any }>(`/admin/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  }

  async getAdminAudit() {
    return this.request<{ logs: any[] }>('/admin/audit');
  }

  async getAdminOverview() {
    return this.request<{ stats: any; recentTransactions: any[]; recentOpenings: any[] }>('/admin/overview');
  }

  async previewAdminBattleResolve(payload: { caseIds: string[]; mode: 'BOT' | 'PVP' }) {
    return this.request<{ mode: 'BOT' | 'PVP'; rounds: any[] }>('/admin/battles/preview-resolve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getAdminFeedback() {
    return this.request<{ messages: any[]; unreadCount: number }>('/admin/feedback');
  }

  async getAdminFeedbackUnreadCount() {
    return this.request<{ unreadCount: number }>('/admin/feedback/unread-count');
  }

  async updateAdminFeedbackReadStatus(messageId: string, isRead: boolean) {
    return this.request<{ message: any }>(`/admin/feedback/${messageId}/read`, {
      method: 'PATCH',
      body: JSON.stringify({ isRead }),
    });
  }
}

export const api = new ApiClient(API_URL);
