// src/userClient.ts
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.SESSION_STRING || !process.env.API_ID || !process.env.API_HASH) {
    throw new Error("Missing environment variables");
}

export const userClient = new TelegramClient(
    new StringSession(process.env.SESSION_STRING),
    parseInt(process.env.API_ID),
    process.env.API_HASH,
    { 
        connectionRetries: 5,
        useWSS: true
    }
);

// Simple connection
(async () => {
    try {
        await userClient.connect();
        if (await userClient.isUserAuthorized()) {
            console.log('User client connected successfully');
        } else {
            throw new Error("User not authorized");
        }
    } catch (error) {
        console.error('Failed to connect user client:', error);
        process.exit(1);
    }
})();