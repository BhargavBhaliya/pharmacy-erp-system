import "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        tenantId: string;
        roleId: string;
        email: string;
        username: string;
        name: string;
        branchIds: string[];
        permissionCodes: Set<string>;
        discountLimitPercent: number;
      };
      platformAdmin?: {
        id: string;
        name: string;
        email: string;
        username: string;
      };
    }
  }
}
