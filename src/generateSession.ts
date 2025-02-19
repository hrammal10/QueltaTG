// src/generateSession.ts
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
// @ts-ignore
import input from "input"; 
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const result = dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (result.error) {
    throw new Error(`Error loading .env file: ${result.error.message}`);
}

console.log('Environment variables loaded:', {
    API_ID: process.env.API_ID ? 'Set' : 'Not set',
    API_HASH: process.env.API_HASH ? 'Set' : 'Not set'
});

const API_ID = process.env.API_ID;
const API_HASH = process.env.API_HASH;

if (!API_ID || !API_HASH) {
    throw new Error("Please set API_ID and API_HASH in .env file");
}

(async () => {
    const client = new TelegramClient(
        new StringSession(""),  // Empty string = new session
        parseInt(API_ID),
        API_HASH,
        { connectionRetries: 5 }
    );

    await client.start({
        phoneNumber: async () => await input.text("Phone number (international format): "),
        password: async () => await input.text("Password (if you have 2FA enabled): "),
        phoneCode: async () => await input.text("Phone code (sent to your phone): "),
        onError: (err) => console.log(err),
    });

    // Save session string
    const sessionString = client.session.save();
    console.log("\nYour session string (save this to your .env file as SESSION_STRING):\n");
    console.log(sessionString);
    
    process.exit(0);
})();