import { PostScopeEnum, PostTypeEnum, ScopeEnum } from "@prisma/client";

export interface PostMedia {
    fileId: string;
    name: string;
    url: string;
    height: number;
    width: number;
    size: number;
    thumbnailUrl?: string;
    fileType: string;
    filePath: string;
    altText?: string;
    flags: string[];
}

// export enum PostScopeEnum {
//     ANYONE = "ANYONE",
//     VERIFIED = "VERIFIED",
//     FOLLOWED = "FOLLOWED",
//     MENTIONS = "MENTIONS",
// }
 
type PollOption = { id: string; text: string };

export type PollThread =  {
    scope: ScopeEnum;
    isMultiVote: boolean;
    duration: {
        days: number;
        hours: number;
        minutes: number;
      }
    options: PollOption[];
    continents: string[];
    countries: string[];
    
  };

  export type QuizDuration =  {
    days: number;
    hours: number;
    minutes: number;
  };
  export type QuizOption = { id: string; text: string, isCorrect: boolean };
  
  export enum QuizScopeEnum {
    NONE = "NONE",
    COUNTRY = "COUNTRY",
    CONTINENT = "CONTINENT",
  }

  export type QuizThread = {
    scope: ScopeEnum;
    isPaid: boolean;
    rewardAmount: number;
    duration: QuizDuration;
    options: QuizOption[];
    maxWinners: number
    continents: string[];
    countries: string[];
  };

  export interface PostThread {
    type: PostTypeEnum;
    media: PostMedia[];
    content: string;
    poll?: PollThread;
    quiz?: QuizThread;
    tags: string[],
    mentions: string[],
    tagUsers: string[];
    scope: PostScopeEnum;
  };

  export interface PostCreate {
    thread: PostThread[]
    scheduleAt?: string | Date;
    location?: string;
    isDraft: boolean;
  }