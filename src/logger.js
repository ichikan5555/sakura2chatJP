import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';

// Ensure log directory exists
fs.mkdirSync(config.logging.dir, { recursive: true });

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return stack
        ? `${timestamp} [${level.toUpperCase()}] ${message}\n${stack}`
        : `${timestamp} [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return stack
            ? `${timestamp} [${level}] ${message}\n${stack}`
            : `${timestamp} [${level}] ${message}`;
        })
      ),
    }),
    new winston.transports.File({
      filename: path.join(config.logging.dir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(config.logging.dir, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});
