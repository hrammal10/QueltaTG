import { Api, Bot, Context, InlineKeyboard } from "grammy";

const bot = new Bot("7947432199:AAF-lrKBtcTxD3GuXKhjUDFUAAtoOXtYVGg");

// Maps for all topics
let newTopics = new Map<string, string>();
let closedTopics = new Map<string, string>();
let onHoldTopics = new Map<string, string>();
const deleteKeyboard = new InlineKeyboard()
    .text("Yes", "confirmDelete")
    .text("No", "disregardDelete");

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data == "confirmDelete") {
        const chatId = ctx.chat?.id;
        const newTopicId = ctx.callbackQuery.message?.message_thread_id;
        if (chatId && newTopicId) {
            try {
                await ctx.api.deleteForumTopic(chatId, newTopicId);
                await ctx.answerCallbackQuery("Topic deleted.");
            } catch (error) {
                console.error("Error deleting topic with id: ${newTopicId}", error);
                await ctx.answerCallbackQuery("Couldn't delete topic. Contact Admin.");
            }
        }
    } else if (data == "disregardDelete") {
        await ctx.answerCallbackQuery("not delete topic.");
    }
});

// new topic command
bot.command("create", async (ctx) => {
    const commandText = ctx.message?.text;
    if (commandText) {
        const commandParts = commandText.split(' ').slice(1).join(' ');
        const topicInfo = commandParts.split(' - ');
        // check topic name and creator name is found
        if (topicInfo.length < 2) {
            await ctx.reply(`Topic name or creator's name is not found. Provide it in the following format: 
            \n/create <topic name> - <creator's name>`);
            return;
        }
        const creatorName = topicInfo[topicInfo.length - 1].trim();
        const topicName = topicInfo.slice(0, topicInfo.length - 1).join(' - ').trim().toLowerCase();
        // iterate over the newTopics map and check if the topic already exists
        if (newTopics.has(topicName.toLowerCase())) {
            await ctx.reply("Topic already exists.");
            return;
        } else {
             await ctx.api.createForumTopic(ctx.chat.id, topicName, {
                icon_custom_emoji_id: "🔥",
            });         
            newTopics.set(topicName, creatorName);
            const confirmationMessage = ("Done. The topic is created.");
            await ctx.reply(confirmationMessage, {
                reply_parameters: { message_id: ctx.msg.message_id },
            });
        }
    } else {
        await ctx.reply("Encountered an error while creating topic.")
    }
});


// delete command
bot.command("delete", async (ctx) => {
    const threadId = ctx.message?.message_thread_id;
    await ctx.reply(`Are you sure you want to delete this topic?
    \n All chats will be deleted.`, {
        reply_markup: deleteKeyboard,
        message_thread_id: threadId,
    });
});

// command to get a list of all the existing topics
bot.command("existingtopics", async (ctx) => {
    const nameList = Array.from(newTopics.keys());
    let listMessage = "Existing topics: \n";
    if (nameList.length > 0) {
    } else {
        listMessage += "None found.";
    }
    await ctx.reply(listMessage);
})

// commnad to close topic
bot.command("close", async (ctx) => {
    await ctx.api.editForumTopic
})

bot.start();