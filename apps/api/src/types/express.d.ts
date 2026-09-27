import "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        tenantId: string;
        roleId: string;
        email: string;
        name: string;
        branchIds: string[];
        permissionCodes: Set<string>;
        discountLimitPercent: number;
      };
    }
  }
}
