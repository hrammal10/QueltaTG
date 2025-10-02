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

// TEMPORARY: Comment out user client connection to allow bot to start
// Remove this when you get a working session string
console.log('⚠️  WARNING: User client connection is disabled due to banned phone number');
console.log('⚠️  Forum-related features will not work until this is resolved');
console.log('⚠️  To fix: Use a different phone number with generate-session.ts');

// Simple connection
/*
(async () => {
    try {
        await userClient.connect();
        if (await userClient.isUserAuthorized()) {
            console.log('User client connected successfully');
        } else {
            console.error('User not authorized. This usually means:');
            console.error('1. Your SESSION_STRING is invalid or expired');
            console.error('2. The session was created with different API credentials');
            console.error('3. You need to regenerate the session string');
            console.error('');
            console.error('To fix this, run: node generate-session.js');
            throw new Error("User not authorized");
        }
    } catch (error) {
        console.error('Failed to connect user client:', error);
        process.exit(1);
    }
})();
*/