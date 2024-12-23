import { 
    Api, 
    Bot, 
    Context, 
    InlineKeyboard 
} from "grammy";

interface TopicInfo {
    name: string;
    id: number;
    creator: string;
}

const bot = new Bot("7947432199:AAF-lrKBtcTxD3GuXKhjUDFUAAtoOXtYVGg");

let newTopics = new Map<number, TopicInfo>();
let closedTopics = new Map<number, TopicInfo>();
let pendingTopics = new Map<number, TopicInfo>();
let topicNameIndex = new Map<string, number>();

function findTopicLocation(topicId: number): {
    status: 'new' | 'closed' | 'pending' | 'not_found',
    topicInfo?: TopicInfo
} {
    if (newTopics.has(topicId)) {
        return { status: 'new', topicInfo: newTopics.get(topicId) };
    }
    if (closedTopics.has(topicId)) {
        return { status: 'closed', topicInfo: closedTopics.get(topicId) };
    }
    if (pendingTopics.has(topicId)) {
        return { status: 'pending', topicInfo: pendingTopics.get(topicId) };
    }
    return { status: 'not_found' };
}

async function executeTopicOperation(
    ctx: Context,
    operation: 'create' | 'close' | 'hold' | 'open',
    handler: () => Promise<void>
): Promise<void> {
    const topicId = operation === 'create' ? undefined : ctx.message?.message_thread_id;
    const chatId = ctx.chat?.id;

    if (!chatId) {
        console.error('Chat ID is undefined');
        throw new Error('Cannot execute operation: Chat ID is undefined');
    }
    
    const initialState = {
        newTopics: new Map(newTopics),
        pendingTopics: new Map(pendingTopics),
        closedTopics: new Map(closedTopics),
        topicNameIndex: new Map(topicNameIndex)
    };

    try {
        await handler();
    } catch (error) {
        newTopics = initialState.newTopics;
        pendingTopics = initialState.pendingTopics;
        closedTopics = initialState.closedTopics;
        topicNameIndex = initialState.topicNameIndex;

        if (topicId) {
            try {
                if (operation === 'create') {
                    await ctx.api.deleteForumTopic(chatId, topicId);
                } else {
                    const originalTopic = initialState.newTopics.get(topicId);
                    if (originalTopic) {
                        await ctx.api.editForumTopic(chatId, topicId, { name: originalTopic.name });
                    }
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

        if (topicNameIndex.has(normalizedName)) {
            await ctx.reply("Topic already exists.", {
                message_thread_id: ctx.message?.message_thread_id
            });
            return;
        }

        try {
            const createdTopic = await ctx.api.createForumTopic(
                ctx.chat.id, 
                topicName, {
                icon_color: 7322096,
            });

            const topicId = createdTopic.message_thread_id;
            
            await executeTopicOperation(ctx, 'create', async () => {
                newTopics.set(topicId, {
                    name: topicName,
                    id: topicId,
                    creator: creatorName
                });
                topicNameIndex.set(normalizedName, topicId);
            });

            await ctx.reply("Done. The topic is created.", {
                message_thread_id: ctx.message?.message_thread_id,
                reply_parameters: { message_id: ctx.msg.message_id }
            });
        } catch (error) {
            await ctx.reply("Encountered an error while creating topic.", {
                message_thread_id: ctx.message?.message_thread_id
            });
        }
    }
});

bot.command("close", async (ctx) => {
    const closeText = ctx.message?.text;
    const topicId = ctx.message?.message_thread_id;

    if (closeText && topicId) {
        const closerName = getCommanderName(closeText);
        const chatId = ctx.chat.id;
        
        const { status, topicInfo } = findTopicLocation(topicId);
        
        if (!topicInfo) {
            await ctx.reply("Topic not found in any list.", {
                message_thread_id: topicId
            });
            return;
        }

        switch (status) {
            case 'closed':
                await ctx.reply("This topic is already closed.", {
                    message_thread_id: topicId
                });
                return;

            case 'new':
            case 'pending':
                const originalName = topicInfo.name.replace('[ON HOLD] ', '');
                const closedTopicName = `[CLOSED] ${originalName}`;

                try {
                    await executeTopicOperation(ctx, 'close', async () => {
                        await ctx.api.editForumTopic(
                            chatId, 
                            topicId, 
                            { name: closedTopicName }
                        );

                        closedTopics.set(topicId, {
                            ...topicInfo,
                            name: closedTopicName
                        });

                        switch (status) {
                            case 'new':
                                newTopics.delete(topicId);
                                break;
                            case 'pending':
                                pendingTopics.delete(topicId);
                                break;
                        }

                        topicNameIndex.delete(originalName.toLowerCase());
                    });

                    const statusMessage = status === 'pending' ? 
                        `Topic has been moved from ON HOLD to CLOSED by ${closerName}.` :
                        `Topic has been officially closed by ${closerName}.`;
                    
                    await ctx.reply(statusMessage, {
                        message_thread_id: topicId
                    });
                } catch (error) {
                    await ctx.reply("Failed to update the topic. Please try again or contact Admin.", {
                        message_thread_id: topicId
                    });
                }
                break;

            default:
                await ctx.reply("Unknown topic status.", {
                    message_thread_id: topicId
                });
                break;
        }
    }
});

bot.command("hold", async (ctx) => {
    const holdText = ctx.message?.text;
    const topicId = ctx.message?.message_thread_id;

    if (holdText && topicId) {
        const penderName = getCommanderName(holdText);
        const chatId = ctx.chat.id;
        
        const { status, topicInfo } = findTopicLocation(topicId);
        
        if (!topicInfo) {
            await ctx.reply("Topic not found in any list.", {
                message_thread_id: topicId
            });
            return;
        }

        switch (status) {
            case 'closed':
                await ctx.reply("Cannot put a closed topic on hold.", {
                    message_thread_id: topicId
                });
                return;

            case 'pending':
                await ctx.reply("This topic is already on hold.", {
                    message_thread_id: topicId
                });
                return;

            case 'new':
                const pendingName = `[ON HOLD] ${topicInfo.name}`;
                try {
                    await executeTopicOperation(ctx, 'hold', async () => {
                        await ctx.api.editForumTopic(
                            chatId, 
                            topicId, 
                            { name: pendingName }
                        );
                        pendingTopics.set(topicId, {...topicInfo, name: pendingName});
                        newTopics.delete(topicId);
                        topicNameIndex.delete(topicInfo.name.toLowerCase());
                    });
                    await ctx.reply(`Topic has been put on hold by ${penderName}`, {
                        message_thread_id: topicId
                    });
                } catch (error) {
                    await ctx.reply("Failed to update the topic. Please try again or contact Admin.", {
                        message_thread_id: topicId
                    });
                }
                break;

            default:
                await ctx.reply("Unknown topic status.", {
                    message_thread_id: topicId
                });
                break;
        }
    }
});

bot.command("open", async (ctx) => {
    const reopenText = ctx.message?.text;
    const topicId = ctx.message?.message_thread_id;

    if (reopenText && topicId) {
        const reopenerName = getCommanderName(reopenText);
        const chatId = ctx.chat.id;
        
        const { status, topicInfo } = findTopicLocation(topicId);
        
        if (!topicInfo) {
            await ctx.reply("Topic not found in any list.", {
                message_thread_id: topicId
            });
            return;
        }

        switch (status) {
            case 'new':
                await ctx.reply("This topic is already open.", {
                    message_thread_id: topicId
                });
                return;

            case 'pending':
                await ctx.reply("This topic is on hold. Use /hold command to manage hold status.", {
                    message_thread_id: topicId
                });
                return;

            case 'closed':
                // Remove [CLOSED] prefix to get original name
                const originalName = topicInfo.name.replace('[CLOSED] ', '');
                
                try {
                    await executeTopicOperation(ctx, 'open', async () => {
                        await ctx.api.editForumTopic(
                            chatId, 
                            topicId, 
                            { name: originalName }
                        );

                        // Move from closedTopics to newTopics
                        newTopics.set(topicId, {
                            ...topicInfo,
                            name: originalName
                        });
                        closedTopics.delete(topicId);
                        topicNameIndex.set(originalName.toLowerCase(), topicId);
                    });

                    await ctx.reply(`Topic has been reopened by ${reopenerName}`, {
                        message_thread_id: topicId
                    });
                } catch (error) {
                    await ctx.reply("Failed to reopen the topic. Please try again or contact Admin.", {
                        message_thread_id: topicId
                    });
                }
                break;

            default:
                await ctx.reply("Unknown topic status.", {
                    message_thread_id: topicId
                });
                break;
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
    const threadId = ctx.callbackQuery.message?.message_thread_id;

    if (data == "confirmDelete") {
        const chatId = ctx.chat?.id;
        const topicId = ctx.callbackQuery.message?.message_thread_id;
        if (chatId && topicId) {
            try {
                await ctx.api.deleteForumTopic(chatId, topicId);
                const topic = newTopics.get(topicId);
                if (topic) {
                    topicNameIndex.delete(topic.name.toLowerCase());
                    newTopics.delete(topicId);
                }
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


bot.command("existingtopics", async (ctx) => {
    const topics = Array.from(newTopics.values());
    let listMessage = "Existing topics: \n";
    
    if (topics.length > 0) {
        topics.forEach(topic => {
            listMessage += `\n• ${topic.name} (created by ${topic.creator})`;
        });
    } else {
        listMessage += "None found.";
    }
    
    await ctx.reply(listMessage, {
        message_thread_id: ctx.message?.message_thread_id
    });
});


bot.start();