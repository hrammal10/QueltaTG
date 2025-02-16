import { 
    Api, 
    Bot, 
    Context, 
    InlineKeyboard 
} from "grammy";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import dotenv from 'dotenv';

interface TopicInfo {
    name: string;
    id: number;
    creator: string;
}

dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN!);
const archive_group_id = 2388831719;
const userClient = new TelegramClient(
    new StringSession(""),
    parseInt(process.env.API_ID!),
    process.env.API_HASH!,
    { connectionRetries: 5 }
);

async function executeTopicOperation(
    ctx: Context,
    operation: 'create' | 'close' | 'hold' | 'open' | 'archive',
    handler: () => Promise<void>
): Promise<void> {
    const topicId = operation === 'create' ? undefined : ctx.message?.message_thread_id;
    const chatId = ctx.chat?.id;

    if (!chatId) {
        console.error('Chat ID is undefined');
        throw new Error('Cannot execute operation: Chat ID is undefined');
    }
    
    try {
        await handler();
    } catch (error) {
        if (topicId) {
            try {
                if (operation === 'create') {
                    await ctx.api.deleteForumTopic(chatId, topicId);
                } 
            } catch (cleanupError) {
                console.error(`Failed to cleanup after ${operation} error:`, cleanupError);
            }
        }

        console.error(`Error during ${operation} operation:`, error);
        throw error;
    }
}

function getCommanderName(commandText: string): string {
    const commandParts = commandText.split(' ').slice(1);
    return commandParts[0]?.trim() || 'Unknown';
}

const deleteKeyboard = new InlineKeyboard()
    .text("Yes", "confirmDelete")
    .text("No", "disregardDelete");

bot.command("start", async (ctx) => {
    
})

bot.command("create", async (ctx) => {
    const createText = ctx.message?.text;
    if (createText) {
        const commandParts = createText.split(' ').slice(1).join(' ');
        const topicInfo = commandParts.split(' - ');
        
        if (topicInfo.length < 2) {
            await ctx.reply(`Topic name or creator's name is not found. Provide it in the following format: 
            \n/create <topic name> - <creator's name>`, {
                message_thread_id: ctx.message?.message_thread_id
            });
            return;
        }

        const creatorName = topicInfo[topicInfo.length - 1].trim();
        const topicName = topicInfo.slice(0, topicInfo.length - 1).join(' - ').trim();
        const normalizedName = topicName.toLowerCase();

        try {
            const createdTopic = await ctx.api.createForumTopic(
                ctx.chat.id, 
                topicName, {
                icon_color: 7322096,
            });

            const topicId = createdTopic.message_thread_id;
            
            await executeTopicOperation(ctx, 'create', async () => {
            });

            await ctx.api.sendMessage(
                ctx.chat.id,
                `This topic was created by ${creatorName}`,
                { message_thread_id: topicId }
            ); 

        } catch (error) {
            await ctx.reply("Encountered an error while creating topic.", {
                message_thread_id: ctx.message?.message_thread_id
            });
        }
    }
});

bot.command("delete", async (ctx) => {
    const threadId = ctx.message?.message_thread_id;
    await ctx.reply(`Are you sure you want to delete this topic?
    \n All chats will be deleted.`, {
        reply_markup: deleteKeyboard,
        message_thread_id: threadId
    });
});

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data == "confirmDelete") {
        const chatId = ctx.chat?.id;
        const topicId = ctx.callbackQuery.message?.message_thread_id;
        if (chatId && topicId) {
                try {
                    await ctx.api.deleteForumTopic(chatId, topicId);
                await ctx.answerCallbackQuery({
                    text: "Topic deleted.",
                    show_alert: true
                });
            } catch (error) {
                console.error("Error deleting topic with id: ${topicId}", error);
                await ctx.answerCallbackQuery({
                    text: "Couldn't delete topic. Contact Admin.",
                    show_alert: true
                });
            }
        }
    } else if (data == "disregardDelete") {
        await ctx.answerCallbackQuery({
            text: "Topic deletion cancelled.",
            show_alert: true
        });
    }
});

bot.command("state", async (ctx) => {
    const stateText = ctx.message?.text;
    const topicId = ctx.message?.message_thread_id;

    if (!stateText || !topicId) {
        await ctx.reply("Please provide a state and use this command within a topic.", {
            message_thread_id: topicId
        });
        return;
    }

    const newState = stateText.split(' ')[1]?.trim().toUpperCase();

    if (!newState) {
        await ctx.reply("Please provide a state (e.g., /state closed)", {
            message_thread_id: topicId
        })
        return;
    }
    try {
        await userClient.updateTopicSheet(topicId, newState);
        await ctx.reply(`Topic state updated to ${newState}`, {
            message_thread_id: topicId
        });
    } catch (error) {
        console.error("Error updating the topic State:", error);
        await ctx.reply("Failed to update topic State. Please try again.", {
            message_thread_id: topicId
        });
    }
});





bot.start();