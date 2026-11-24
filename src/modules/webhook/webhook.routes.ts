import { Router } from 'express';
import { webhookController } from './webhook.controller';

export const webhookRouter = Router();

webhookRouter.post('/', webhookController.handleWebhook);
