import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../../utils/errors';
import { webhookService } from './webhook.service';
import { webhookPayloadSchema } from './webhook.validation';

export class WebhookController {
  public handleWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validationResult = webhookPayloadSchema.safeParse(req.body);

      if (!validationResult.success) {
        throw new BadRequestError(
          'Invalid webhook payload schema',
          validationResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          }))
        );
      }

      const result = await webhookService.processWebhook(validationResult.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export const webhookController = new WebhookController();
