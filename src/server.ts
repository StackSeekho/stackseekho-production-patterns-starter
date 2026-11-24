import { Server } from 'node:http';
import { app } from './app';
import { env } from './config/env';
import { closeDatabaseConnection } from './database/connection';
import { logger } from './utils/logger';

const server: Server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
    },
    `Server is running and listening on port ${env.PORT}`
  );
});

let isShuttingDown = false;

function gracefulShutdown(signal: string): void {
  if (isShuttingDown) {
    logger.warn(`Shutdown already in progress. Ignoring repeated ${signal}`);
    return;
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new HTTP connections
  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error occurred while closing HTTP server');
    } else {
      logger.info('HTTP server closed cleanly.');
    }

    // Drain and close database connection pool
    await closeDatabaseConnection();

    logger.info('Graceful shutdown complete. Exiting process.');
    process.exit(err ? 1 : 0);
  });

  // Force close if graceful shutdown takes longer than 10 seconds
  const forceShutdownTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
    process.exit(1);
  }, 10000);

  forceShutdownTimer.unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err: Error) => {
  logger.fatal({ err }, `Uncaught Exception: ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ reason }, 'Unhandled Promise Rejection');
  process.exit(1);
});

export { server };
