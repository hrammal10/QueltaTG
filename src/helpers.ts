import { Api } from 'telegram';
import { Context } from 'grammy';
import { userClient } from './userClient';
import { TopicInfo, TopicState, TopicError } from './types'; 
import bigInt from 'big-integer'; 

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
                iconEmojiId: newState == 'CLOSED' ? bigInt('5206607081334906820') : undefined
            }));

        } catch (e: any) {
            if (e.errorMessage === 'TOPIC_NOT_MODIFIED') {
                return `Topic already has that state: ${newState}`;
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

