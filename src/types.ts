export interface TopicInfo {
    name: string;
    id: number;
    creator: string;
    state?: 'OPEN' | 'CLOSED' | 'PENDING REFUND' | 'PENDING FIX';
}

export interface TopicError {
    code: string;
    message: string;
    topicId?: number;
}

export type TopicState = 'OPEN' | 'CLOSED' | 'PENDING REFUND' | 'PENDING FIX';



