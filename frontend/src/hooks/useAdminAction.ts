import { useMemo } from 'react';

interface UseAdminActionProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  balance: number;
  cost: number;
}

type AdminActionState = 'connect' | 'admins-only' | 'topup' | 'ready';

export const useAdminAction = ({ isAuthenticated, isAdmin, balance, cost }: UseAdminActionProps) => {
  return useMemo(() => {
    if (!isAuthenticated) {
      return { state: 'connect' as AdminActionState, shortfall: 0 };
    }
    if (!isAdmin) {
      return { state: 'admins-only' as AdminActionState, shortfall: 0 };
    }
    if (balance < cost) {
      return { state: 'topup' as AdminActionState, shortfall: Math.max(0, cost - balance) };
    }
    return { state: 'ready' as AdminActionState, shortfall: 0 };
  }, [isAuthenticated, isAdmin, balance, cost]);
};
