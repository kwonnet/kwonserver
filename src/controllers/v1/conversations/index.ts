import { SessionUser } from "@/types/user";
import { Response } from "express";
import type { Request } from "@/types/express";
import { z } from "zod/v3";
import * as messaging from '@/services/v1/conversations';
import { EnrollSchema, SendSchema, ReceiptSchema, ReceiptBatchSchema, BlobReserveSchema, RequestSchema } from '@/services/v1/conversations/e2ee-contracts';
import logger from '@/logger';
import { safeError } from '@/logger/sanitize';
const UUID = z.string().uuid();
function messagingController(work: (req: Request, user: SessionUser) => Promise<any>) {
    return async (req: Request, res: Response) => {
        try {
            const result = await work(req, req.user as SessionUser);
            res.setHeader('Cache-Control', 'no-store');
            return res.send(result);
        }
        catch (error) {
            logger.error({ event: 'messaging_operation_failed', userId: req.user?.id, err: safeError(error) }, 'Messaging operation failed');
            if (error && typeof error === 'object' && 'code' in error && error.code === 'MESSAGING_STORAGE_CONFIG')
                return res.status(503).send('Encrypted attachments are not configured yet.');
            if (error && typeof error === 'object' && 'code' in error && error.code === 'P2028')
                return res.status(503).send('Messaging is temporarily unavailable. Please try again.');
            return res.status(error instanceof messaging.MessagingError ? error.status : error instanceof z.ZodError ? 400 : 500).send(error instanceof messaging.MessagingError ? error.message : 'Unable to process messaging request');
        }
    };
}
function session(user: SessionUser) {
    if (!user.sessionId)
        throw new messaging.MessagingError(401, 'Sign in again');
    return user.sessionId;
}
function device(req: Request) { return UUID.parse(req.headers['x-messaging-device']); }
export const messagingEnrollController = messagingController((req, u) => messaging.enrollMessagingDevice(u.id, session(u), EnrollSchema.parse(req.body)));
export const messagingRosterController = messagingController((req, u) => messaging.messagingRoster(u.id, z.string().min(1).parse(req.params.id)));
export const messagingClaimController = messagingController((req, u) => messaging.claimMessagingPreKey(u.id, session(u), device(req), UUID.parse(req.params.deviceId), UUID.parse(req.body.claimId)));
export const messagingCreateController = messagingController((req, u) => messaging.createMessagingConversation(u.id, z.string().min(1).parse(req.body.recipientId)));
export const messagingListController = messagingController((req, u) => {
    if (u.id !== req.params.id)
        throw new messaging.MessagingError(403, 'Not permitted');
    return messaging.listMessagingConversations(u.id, String(req.query.kind ?? 'chat'), Math.max(1, Number(req.query.page) || 1), Math.min(100, Math.max(1, Number(req.query.limit) || 21)));
});
export const messagingPeerController = messagingController((req, u) => {
    if (u.id !== req.params.id)
        throw new messaging.MessagingError(403, 'Not permitted');
    return messaging.messagingPeer(u.id, String(req.params.recipientId), u.sessionId);
});
export const messagingSendController = messagingController((req, u) => messaging.sendMessagingEvent(u.id, session(u), device(req), SendSchema.parse(req.body)));
export const messagingSyncController = messagingController((req, u) => messaging.messagingSync(u.id, session(u), device(req), UUID.parse(req.params.id), z.string().regex(/^\d{1,20}$/).parse(req.query.after ?? '0'), z.string().regex(/^\d{1,20}$/).parse(req.query.receiptAfter ?? '0')));
export const messagingReceiptController = messagingController((req, u) => messaging.messagingReceipt(u.id, session(u), device(req), ReceiptSchema.parse(req.body)));
export const messagingRequestController = messagingController((req, u) => messaging.resolveMessagingRequest(u.id, session(u), device(req), UUID.parse(req.params.id), RequestSchema.parse(req.body)));
export const messagingDeleteController = messagingController((req, u) => messaging.deleteMessagingForMe(u.id, session(u), device(req), UUID.parse(req.params.id), UUID.parse(req.params.messageId)));
export const messagingRevokeController = messagingController((req, u) => messaging.revokeMessagingDevice(u.id, UUID.parse(req.params.deviceId)));
export const messagingReserveController = messagingController((req, u) => messaging.reserveMessagingBlob(u.id, session(u), device(req), UUID.parse(req.params.id), BlobReserveSchema.parse(req.body)));
export const messagingFinalizeController = messagingController((req, u) => messaging.finalizeMessagingBlob(u.id, session(u), device(req), UUID.parse(req.params.id), UUID.parse(req.params.blobId)));
export const messagingReceiptBatchController = messagingController((req, u) => messaging.messagingReceiptBatch(u.id, session(u), device(req), ReceiptBatchSchema.parse(req.body)));
export const messagingDownloadController = async (req: Request, res: Response) => {
    try {
        const u = req.user as SessionUser;
        const grant = await messaging.getMessagingBlob(u.id, session(u), device(req), UUID.parse(req.params.id), UUID.parse(req.params.blobId));
        res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        if ("legacyBytes" in grant) {
            res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment' });
            return res.send(grant.legacyBytes);
        }
        return res.json(grant);
    }
    catch (error) {
        logger.error({ event: 'messaging_attachment_failed', err: safeError(error) }, 'Encrypted attachment unavailable');
        return res.status(error instanceof messaging.MessagingError ? error.status : 400).send('Attachment unavailable');
    }
};
