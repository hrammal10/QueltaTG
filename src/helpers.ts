import { Api } from 'telegram';
import { Context } from 'grammy';
import { userClient } from './userClient';
import { TopicInfo, TopicState, TopicError, WhitelistConfig } from './types'; 
import bigInt from 'big-integer'; 

export const whitelist: WhitelistConfig = {
    dmUsers: [
        6048393057,
        1631248807
    ],
    archiveUsers: [
        6048393057,
        6086945557,
        2030877892,
        88891037,
        1631248807
    ]
}

export const getIconForState = (state: string) => {
    switch (state) {
        case 'CLOSED':
            return bigInt('5206607081334906820');
        case 'PENDING REFUND':
        case 'PENDING FIX':
        case 'OPEN':
            return bigInt('5210952531676504517');
        default:
            return undefined;
    }
};

export async function updateTopicState(
    chatId: number, 
    topicId: number, 
    newState: TopicState
    ): Promise<boolean | string> {
        
    try{
        const result = await userClient.invoke(new Api.channels.GetForumTopics({
            channel: chatId,    
            offsetTopic: topicId,
            limit: 1
        }));

        const topic = result.topics[0];
        if (!topic || topic instanceof Api.ForumTopicDeleted) {
            throw new Error("topic not found");
        }

        let topicName = topic.title || "";
        let currentState: TopicState;
        if (topicName.startsWith('[CLOSED]')) {
            currentState = 'CLOSED';
        } else if (topicName.startsWith('[PENDING REFUND]')) {
            currentState = 'PENDING REFUND';
        } else if (topicName.startsWith('[PENDING FIX]')) {
            currentState = 'PENDING FIX';
        } else {
            currentState = 'OPEN';
        }

        topicName = cleanTopicName(topicName);

        const newTopicName = newState === "OPEN"
            ? topicName
            : `[${newState}] ${topicName}`;

        
        try {
            await userClient.invoke(new Api.channels.EditForumTopic({
                channel: chatId,
                topicId: topicId,
                title: newTopicName,
                iconEmojiId: getIconForState(newState)
            }));

        } catch (e: any) {
            if (e.errorMessage === 'TOPIC_NOT_MODIFIED') {
                return `Topic already has ${newState} state.`;
            }
            throw e;
        }
        return true;
    } catch (error) {
        console.error("Error updating topic state: ", error);
        throw error;
    }
}


export function cleanTopicName(name: string): string {
    return name.replace(/^\[(OPEN|CLOSED|PENDING)\]\s*/i, '');
}

export const isAllowedDM = (userId: number): boolean => 
    whitelist.dmUsers.includes(userId);

export const isAllowedArchive = (userId: number): boolean =>
    whitelist.archiveUsers.includes(userId);

export const checkDMPermissions = async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.chat?.type === 'private') {
        if (isAllowedDM(ctx.from?.id || 0)) {
            return next();
        }
        return ctx.reply('Unauthorized access in DM.');
    } 
    return next();
};

