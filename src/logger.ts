import { createLogger, format, transports } from 'winston';

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.simple()
            )
        }),
        new transports.File({ filename: 'combined.log' }),
        new transports.File({ filename: 'error.log', level: 'error' }),
    ],
    exceptionHandlers: [
        new transports.File({ filename: 'exception.log' })
    ],
    rejectionHandlers: [
        new transports.File({ filename: 'rejections.log' })
    ]
});

export default logger;