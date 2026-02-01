const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

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

  async upgradeItem(itemId: string, multiplier: number) {
    return this.request<{ success: boolean; targetValue: number; newItem?: any; burntItemId: string }>(
      '/user/upgrade',
      {
        method: 'POST',
        body: JSON.stringify({ itemId, multiplier }),
      }
    );
  }

  async recordBattle(result: string, cost: number, wonItems: any[]) {
    return this.request('/user/battles/record', {
      method: 'POST',
      body: JSON.stringify({ result, cost, wonItems }),
    });
  }

  async chargeBattle(amount: number) {
    return this.request<{ balance: number }>('/user/battles/charge', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }

  // Case endpoints
  async getCases() {
    return this.request<{ cases: any[] }>('/cases');
  }

  async getCaseById(id: string) {
    return this.request<{ case: any }>(`/cases/${id}`);
  }

  async createCase(caseData: any) {
    return this.request<{ case: any }>('/cases', {
      method: 'POST',
      body: JSON.stringify(caseData),
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
}

export const api = new ApiClient(API_URL);
