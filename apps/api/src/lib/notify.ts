import { prisma } from "./prisma";

interface NotifyParams {
  tenantId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}

// Broadcasts a tenant-wide notification (userId left null). Visibility is enforced by the
// notifications.view permission on read, not by per-user targeting — see schema comment.
// Fire-and-forget, same pattern as recordAudit: never let a notification failure block the
// business operation that triggered it.
export function notify(params: NotifyParams): void {
  prisma.notification
    .create({ data: { tenantId: params.tenantId, type: params.type, title: params.title, message: params.message, link: params.link } })
    .catch((err) => console.error("Failed to create notification", err));
}
