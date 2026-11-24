import { Request, Response, NextFunction } from 'express';
import { healthService } from './health.service';

export class HealthController {
  public getHealth = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const report = await healthService.getHealthReport();
      res.status(200).json(report);
    } catch (err) {
      next(err);
    }
  };

  public getLiveness = (_req: Request, res: Response): void => {
    const liveness = healthService.getLiveness();
    res.status(200).json(liveness);
  };

  public getReadiness = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const readiness = await healthService.getReadiness();
      const statusCode = readiness.ready ? 200 : 503;
      res.status(statusCode).json(readiness);
    } catch (err) {
      next(err);
    }
  };
}

export const healthController = new HealthController();
