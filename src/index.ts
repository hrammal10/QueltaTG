import {
    Bot,
    Context,
    InlineKeyboard
} from "grammy";
import dotenv from 'dotenv';
import {
    updateTopicState,
    cleanTopicName,
    checkDMPermissions,
    isAllowedArchive
} from './helpers';
import {
    TopicInfo,
    TopicState,
    TopicError
} from './types';
import { userClient } from './userClient';
import { Api } from 'telegram';
import logger from './logger';
dotenv.config();


const bigInt = require('big-integer');
export const bot = new Bot(process.env.BOT_TOKEN!);

bot.catch((err) => {
    const { message, ctx } = err;
    if (message?.includes("message thread not found")) {
        // Topic was deleted, ignore the error
        console.log("Attempted to interact with deleted topic, ignoring.");
        return;
    }
    logger.error("Bot error:", err);
});

bot.use(checkDMPermissions);

const deleteKeyboard = new InlineKeyboard()
    .text("Yes", "confirmDelete")
    .text("No", "disregardDelete");

async function executeTopicOperation(
    ctx: Context,
    operation: 'create' | 'close' | 'hold' | 'open' | 'archive',
    handler: () => Promise<void>
): Promise<void> {
    const topicId = operation === 'create' ? undefined : ctx.message?.message_thread_id;
    const chatId = ctx.chat?.id;

    if (!chatId) {
        logger.error('Chat ID is undefined');
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
                logger.error(`Failed to cleanup after ${operation} error:`, cleanupError);
            }
        }

        logger.error(`Error during ${operation} operation:`, error);
        throw error;
    }
}

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
                logger.error("Error deleting topic with id: ${topicId}", error);
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

bot.command("start", async (ctx) => {
    await ctx.reply(`
        This is Quelta, a mod bot. Use /help to check out some of its functionalities.`, {
        message_thread_id: ctx.message?.message_thread_id
    })
});

bot.command("help", async (ctx) => {
    await ctx.reply(
        `Main functionalities for now are:
/start
/help
/create (Which creates a topic)
/delete 
/state (One of Open, close, pending refund, or pending fix)`, {
        message_thread_id: ctx.message?.message_thread_id
    })
});

bot.command("create", async (ctx) => {
    const createText = ctx.message?.text?.split('\n')[0];

    if (!createText) {
        return ctx.reply("Make sure you are providing the topic name and creator name.", {
            message_thread_id: ctx.message?.message_thread_id
        })
    }
    if (!createText?.startsWith('/create')) {
        return ctx.reply("Invalid command format", {
            message_thread_id: ctx.message?.message_thread_id
        })
    }

    const commandParts = createText.split(' ').slice(1);
    if (commandParts.length < 2) {
        return ctx.reply(`Topic name or creator's name is not found. Provide it in the following format: 
            \n/create <topic name> <creator's name>`, {
            message_thread_id: ctx.message?.message_thread_id
        });
    }

    const creatorName = commandParts[commandParts.length - 1];
    const topicName = commandParts.slice(0, - 1).join(' ');

    try {
        const createdTopic = await ctx.api.createForumTopic(
            ctx.chat.id,
            topicName,
            {
                icon_color: 7322096
            }
        );

        const topicId = createdTopic.message_thread_id;
        try {
            await userClient.invoke(new Api.channels.EditForumTopic({
                channel: ctx.chat.id,
                topicId: createdTopic.message_thread_id,
                title: topicName,
                iconEmojiId: bigInt('5210952531676504517')
            }));
        } catch (error) {
            logger.error('Error setting topic icon:', error);
        }
        await executeTopicOperation(ctx, 'create', async () => { });
        await ctx.deleteMessage();

        return ctx.api.sendMessage(
            ctx.chat.id,
            `This topic was created by ${creatorName}`,
            { message_thread_id: topicId }
        );

    } catch (error) {
        logger.error('Error creating topic', error);
        return ctx.reply("Encountered an error while creating topic.", {
            message_thread_id: ctx.message?.message_thread_id
        });
    }
});

bot.command("delete", async (ctx) => {
    const threadId = ctx.message?.message_thread_id;

    if (!threadId || threadId === 1) {
        return ctx.reply("This command cannot be used in the General chat.", {
            message_thread_id: ctx.message?.message_thread_id
        });
    }

    const commandText = ctx.message?.text?.split('\n')[0];
    if (!commandText?.startsWith('/delete')) {
        return ctx.reply("Invalid command format.", {
            message_thread_id: threadId
        });
    }
    return ctx.reply(`Are you sure you want to delete this topic?
    \n All chats will be deleted.`, {
        reply_markup: deleteKeyboard,
        message_thread_id: threadId
    });
});


bot.command("state", async (ctx) => {
    const topicId = ctx.message?.message_thread_id;
    const chatId = ctx.chat?.id;

    if (!topicId) {
        await ctx.reply("Please use this command in  a topic.", {
            message_thread_id: chatId
        });
        return;
    }

    if (topicId === 1) {
        return ctx.reply("This command cannot be used in the General chat.", {
            message_thread_id: ctx.message?.message_thread_id
        })
    }

    const commandText = ctx.message?.text?.split('\n')[0];
    const stateText = commandText?.slice(7).trim().toUpperCase();

    if (!stateText) {
        return ctx.reply(
            `Please indicate the state you want the topic in. (e.g. closed, open, etc..)
    In the format: /state ...`, {
            message_thread_id: topicId
        });
    }

    const validStates = ['OPEN', 'CLOSED', 'PENDING REFUND', 'PENDING FIX'] as const;
    if (!validStates.includes(stateText as TopicState)) {
        return ctx.reply(`Invalid state. Please use one of: ${validStates.join(", ")}`, {
            message_thread_id: topicId
        });
    }
    try {

        const result = await updateTopicState(chatId!, topicId, stateText as TopicState);
        if (typeof result === 'string') {
            return ctx.reply(result, {
                message_thread_id: topicId
            });
        }

        return ctx.reply(`Topic state updated to ${stateText}`, {
            message_thread_id: topicId
        })
    } catch (error) {
        logger.error("Error updating the topic State:", error);
        return ctx.reply("Failed to update topic State. Please try again.", {
            message_thread_id: topicId
        });
    }
});


bot.command("archive", async (ctx) => {
    const source = ctx.message?.message_thread_id;
    const sourceGroupId = ctx.chat?.id;
    const archive_group_id = -1002388831719;

    if (source === 1) {
        return ctx.reply("This commadn cannot be used in the General chat.", {
            message_thread_id: ctx.message?.message_thread_id
        })
    }

    if (!source) {
        return ctx.reply("Please use this command in a topic.", {
            message_thread_id: sourceGroupId
        });
    }

    if (!isAllowedArchive(ctx.from?.id || 0)) {
        return ctx.reply("You are not authorized to use this command")
    }

    if (!sourceGroupId) {
        return ctx.reply("Please use this command inside a topic.");
    }

    try {
        const sourceTopic = await userClient.invoke(new Api.channels.GetForumTopics({
            channel: sourceGroupId,
            offsetTopic: 0,
            limit: 100
        }));

        const originalTopic = sourceTopic.topics.find(topic =>
            'id' in topic && topic.id === source
        );

        if (!originalTopic || originalTopic instanceof Api.ForumTopicDeleted) {
            throw new Error("topic not found");
        }
        let originalTopicTitle = originalTopic.title || "";
        originalTopicTitle = originalTopicTitle
            .replace(/^\[CLOSED\]\s*/, '')
            .replace(/^\[PENDING REFUND\]\s*/, '')
            .replace(/^\[PENDING FIX\]\s*/, '')
            .trim();

        const result = await userClient.invoke(new Api.messages.GetReplies({
            peer: sourceGroupId,
            msgId: source,
            offsetId: 0,
            addOffset: 0,
            limit: 100,
            maxId: 0,
            minId: 0,
            hash: bigInt(0),
        }));

        if (!('messages' in result)) {
            await ctx.reply("No messages found in this topic");
            return;
        }
        const messages = result.messages;

        if (!messages.length) {
            await ctx.reply("No messages found in this topic");
            return;
        }
        const newTopic = await ctx.api.createForumTopic(
            archive_group_id,
            `${originalTopicTitle} (archived)`,
            { icon_color: 7322096 }
        );

        for (const msg of messages.reverse()) {
            if ('message' in msg && msg.message) {
                await ctx.api.sendMessage(archive_group_id, msg.message, {
                    message_thread_id: newTopic.message_thread_id
                });
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return ctx.reply(`Topic archived successfully.`, {
            message_thread_id: source
        });
    } catch (error) {
        logger.error("Error archiving", error);
        return ctx.reply("Failed to archive");
    }
});


bot.start();