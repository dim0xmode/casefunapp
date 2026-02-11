import { useMemo } from 'react';

interface UseAdminActionProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  balance: number;
  cost: number;
}

type AdminActionState = 'connect' | 'topup' | 'ready';
type ExtendedAdminActionState = AdminActionState | 'restricted';

export const useAdminAction = ({ isAuthenticated, isAdmin, balance, cost }: UseAdminActionProps) => {
  return useMemo(() => {
    if (!isAuthenticated) {
      return { state: 'connect' as ExtendedAdminActionState, shortfall: 0 };
    }
    if (!isAdmin) {
      return { state: 'restricted' as ExtendedAdminActionState, shortfall: 0 };
    }
    if (balance < cost) {
      return { state: 'topup' as ExtendedAdminActionState, shortfall: Math.max(0, cost - balance) };
    }
    return { state: 'ready' as ExtendedAdminActionState, shortfall: 0 };
  }, [isAuthenticated, isAdmin, balance, cost]);
};
