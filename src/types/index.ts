import { FollowStatus, GameMode, PostKindEnum, PostScopeEnum, PostTypeEnum, TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum } from "@prisma/client";
import { UserPublic } from "./user";


  export type PostMedia = {
    id: string;
    postId: string;
    fileId: string;
    name: string;
    url: string;
    height: number;
    width: number;
    size: number;
    thumbnailUrl: string;
    fileType: string;
    filePath: string;
    altText?: string;
    flags: string[];
    meta?: Record<string, any>;
    totalViews: number;
    totalDownloads: number;
    createdAt: Date;
    updatedAt: Date;
  };

  export interface FeedPost {
    id: string;
    content?: string;
    type: PostTypeEnum;
    kind: PostKindEnum;
    scope: PostScopeEnum;
    totalViews: number;
    totalLikes: number;
    totalReplies: number;
    totalShares: number;
    totalBookmarks: number;
    totalReposts: number;
    totalQuotes: number;
    totalImpressions: number;
    totalHiddenReplies: number;
    media: PostMedia[];
    parentId?: string;
    rootId?: string;
    quotedPostId?: string;
    userId: string;
    countryId?: string;
    meta?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
    author: UserPublic,
    actions: { 
        hasReposted: boolean;
        hasSaved: boolean;
        hasLiked: boolean;
        hasPinned: boolean;
        hasHighlighted: boolean;
        canReply: boolean; 
        canHideReply: boolean;
        hasBlockedUser: boolean;
        isBlockedByUser: boolean;
        hasMutedUser: boolean;
        isMutedByUser: boolean;
        hasBlockedByRootUser: boolean;
        isRootBlockedByUser: boolean;
        hasMutedByRootUser: boolean;
        isRootMutedByUser: boolean;
    }
    reposts: { id: string, userId: string }[],
    likes: {id: string, userId: string}[],
    bookmarks: {id: string, userId: string}[]
    replyContinents: {continentId: string, id: string, [key: string]: any}[];
    replyCountries: {countryId: string, id: string, [key: string]: any}[];
    poll?: {
      id: string;
      continents: {continentId: string, id: string, [key: string]: any}[];
      countries: {countryId: string, id: string, [key: string]: any}[];
      createdAt: string;
      expireAt: string;
      hasVoted: boolean;
      isExpired: boolean;
      canVote: boolean;
      isMultiVote: boolean;
      options: {
          id: string;
          pollId: string;
          text: string;
          votes: number;
          createdAt: string;
          voters: any[]
      }[];
      postId: string;
      scope: string;
      updatedAt: string;
    },
    quiz?: {
        id: string;
        continents: {continentId: string, id: string, [key: string]: any}[];
        countries: {countryId: string, id: string, [key: string]: any}[];
        createdAt: string;
        expireAt: string;
        canVote: boolean;
        hasVoted: boolean;
        isExpired: boolean;
        isPaid: boolean;
        rewardAmount: number;
        maxWinners: number;
        options: {
            id: string;
            quizId: string;
            text: string;
            isCorrect: boolean;
            votes: number;
            createdAt: string;
            participants: any[]
        }[];
        postId: string;
        scope: string;
        updatedAt: string;
      },
    tagUsers: UserPublic[]
    mentions: UserPublic[]
    parent?: FeedPost
    user: {
        blockedUsers: {
        id: string;
        blockedId: string
        blockerId: string
        [key: string]: any
    }[];
    blockedBy: {
        id: string;
        blockedId: string
        blockerId: string
        [key: string]: any
    }[];
    }
    root?: {
        id: string;
        scope: PostScopeEnum;
        userId: string;
        rootId: string;
        replyContinents: {continentId: string, id: string, [key: string]: any}[];
        replyCountries: {countryId: string, id: string, [key: string]: any}[];
        user: {
            followers: {
                id: string;
                followerId: string;
                followingId: string;
                status: FollowStatus;
            }[];
            following: {
                id: string;
                followerId: string;
                followingId: string;
                status: FollowStatus;
            }[];
            blockedUsers: {
                id: string;
                blockedId: string
                blockerId: string
                [key: string]: any
            }[];
            blockedBy: {
                id: string;
                blockedId: string
                blockerId: string
                [key: string]: any
            }[];
        };
    };
    replies: FeedPost[]
    thread: FeedPost[],
    parentChain: FeedPost[],
  };

export interface User {
    id: string,
    name: string,
    username: string,    
}

export interface SocketGameRoom {
    id: string, 
    catId: string, 
    name: string, 
    gameId: string;
    mode: GameMode
}

export interface Coin {
  id: string;
  name: string;
  amount: number;
  price: number;
  bonus: number;
}

export enum CoinPayTypeEnum {
    FIAT = "FIAT",
    CRYPTO = "CRYPTO",
    CREDIT = "CREDIT",
}

export interface GameRoomPlayer {
    playerId: string;
    gameId: string;
    name: string;
    socketId: string;
    roomId: string;
    catId: string;
    voteCount: number;
    mode: GameMode
}
export interface GamePlayerInfo {
    id: string;
    name: string;
    createdAt: string,
    lastLoggedIn: string,
}
export interface GamePlayer extends GamePlayerInfo {
    numPlayed: number;
    score: number;
    rank?: number;
}
export enum GameStatusEnum {
    CHAT = "CHAT",
    PLAY = "PLAY",
    VOTE = "VOTE"
}
export enum GameEventEnum {
    GAME_ROOM_CHAT = "game_room_chat",
    GAME_ROOM_SCORE = "game_room_score",
    GAME_ROOM_STATE = "game_room_state",
    GAME_ROOM_PLAYERS = "game_room_players",
    GAME_ROOM_QUESTION = "game_room_question",
    GAME_ROOM_ANSWER = "game_room_answer",
    GAME_ROOM_ANSWERS = "game_room_answers",
    GAME_ROOM_VOTE = "game_room_vote",
    GAME_ROOM_PARTICIPANTS = "game_room_participants",
    GAME_ROOM_ACHIEVEMENT = "game_room_achievement",
    GAME_TOTAL_PLAYERS = "game_total_players",
    GAME_ERROR_NOTIFY = "game_error_notify",
    GAME_PLAYER_ENERGY = "game_player_energy",
    GAME_PLAYER_DATA = "game_player_data",
    GAME_ROOM_INFO = "game_room_info",
    GAME_PLAYER_WALLET_UPDATE = "game_player_wallet_update",
    PLAYER_JOINED = "player_joined",
    MESSAGE = "message",
    NOTIFY_MESSAGE = "notify_message",
}
export interface TempGameRoom {
    status: GameStatusEnum;
    roomId: string;
    catId: string;
    catName: string;
    gameId: string;
    gameName: string;
    topics: string;
    timer?: number;
    mode: GameMode
}

export enum GameType {
    TRIVIA = "TRIVIA",
    ACRONYM = "ACRONYM",
    MINDMASH = "MINDMASH",
    SPORTS = "SPORTS",
    COUNTRY = "COUNTRY",
    ACADEMIA = "ACADEMIA",
}

export enum GameCatType {
    TYPEMANIA = "TYPEMANIA",
    HANGMAN = "HANGMAN",
    ANAGRAM = "ANAGRAM",
    UNSCRAMBLE = "UNSCRAMBLE",
    WORDMAKER = "WORDMAKER",
    LUCKYFLIP = "LUCKYFLIP",
    LUCKYWHIZ = "LUCKYWHIZ",
    LUCKYSPIN = "LUCKYSPIN"
}

export interface ThemedGameQuestion {
    roundId?: string;
  answerUntil?: number;
  voteUntil?: number;
    id: string | number;
    question: string;
    options: string[];
    answer: string;
    type: GameType

}



export interface ThemedGameAnswer {
    qId: number | string;
    name: string;
    roomId: string;
    catId: string;
    playerId: string;
    answer: string;
    timer: number;
    mode: GameMode
    answers?: {text: string, timer: number}[]
}

export interface AcronymGameAnswer {
    qId: number | string;
    answer: string;
    answerId: string;
    timer: number;
    votes: string[];
    name: string;
    room: string;
    playerId: string;
    catId: string;
    roomId: string;
    gameType: GameType;
    voted: boolean;
    score: number;
    mode: GameMode
}

export interface GameRoomAnswer {
    roundId?: string;
    timer:number; 
    answer: string, 
    qId: string | number;
    gameType: GameType
    catType: GameCatType
}

export interface ThemedGameScore {
    roomId: string;
    catId: string;
    playerId: string;
    name: string;
    answer: string;
    timer: number;
    score: number;
    mode: GameMode
}

export interface ThemedGameScoreStat {
    score: number
    playerId: string;
    catId: string;
    roomId: string;
    month: number;
    year: number;
    mode: GameMode
}

export interface PlayerGameEnergy {
    playerId: string, 
    catId: string, 
    amount: number, 
    gauge: number, 
    turbo: number
}

export enum WordGameType {
    LETTER = "LETTER",
    WORD = "WORD",
    NUMBER = "NUMBER",
}

export enum GameActionEnum {
    CHAT = "CHAT",
    ANSWER = "ANSWER",
    ENTRIES = "ENTRIES",
    VOTE = "VOTE",
}

export interface RewardQuery {
    catId?: string | null;
    userId: string;
    year?: number | null;
    page: number;
    limit: number;
}

export enum BonusTypeEnum {
    BONUS = "BONUS",
    ADS = "ADS",
  }

export enum PlanTypeEnum {
    MONTHLY = "MONTHLY",
    YEARLY = "YEARLY",
}

export type UserMetaInfo = { 
    type: "LEGACY" | "PRO"; 
    status: "ACTIVE" | "INACTIVE" | "PAUSED", 
    color: "blue" | "gold" | "grey",
    isActive: boolean;
    isPro: boolean;
    isLegacy: boolean;
};


export interface FlutterwaveConfig {
    public_key: string;
    redirect_url: string;
    tx_ref: string;
    amount: number;
    currency: string;
    payment_plan?: string;
    payment_options: string;
    customer: {
        email: string;
        name: string;
        phone_number: string;
    };
    customizations: {
       [key: string]: any;
    };
    meta: {
        [key: string]: any;
    };
}

export enum FlutterwaveTxnType {
    COIN_PACKAGE = "COIN_PACKAGE",
    APP_SUBSCRIPTION = "APP_SUBSCRIPTION"
}

export interface FlutterwaveCoinPurchase {
    id: string;
    amount: number;
    bonus: number;
    txnRef: string;
    userId: string;
    gateway: TxnGatewayEnum;
    source: TxnSourceEnum;
    currency: TxnCurrencyEnum;
    coin: {
        id: string;
        name: string;
        amount: number;
        price: number;
        bonus: number;
        isActive: boolean;
    };
    meta: {
        userId: string;
        currency: string;
        gateway: TxnGatewayEnum;
        source: TxnSourceEnum;
        type: FlutterwaveTxnType;
        txn: {
            txnRef: string;
            txnId: string;
            amount: number;
            currency: string;
        };
        customer: {[key: string]: any};
    };
}


export interface FlutterwaveAppSubPurchase {
    planId: string;
    amount: number;
    currency: TxnCurrencyEnum;
    planType: PlanTypeEnum;
    source: TxnSourceEnum;
    gateway: TxnGatewayEnum;
    isRecurring: boolean;
    planName: string;

    meta: {
        userId: string;
        currency: string;
        gateway: TxnGatewayEnum;
        source: TxnSourceEnum;
        planId: string;
        type: FlutterwaveTxnType;
        txnRef: string;
        txnId: string;
        price: number;
        amount: number;
        discount: number;
        tierId?: string;
        planType: PlanTypeEnum;
        customer: {[key: string]: any};
    };
}

export type FlutterwavePaymentPlanResponse = {
    id: number;
    name: string;
    amount: number;
    interval: string;
    duration: number;
    status: string;
    currency: string;
    plan_token: string;
    created_at: string;
  };
  
export type SubPaymentPlan = {
    name: string;
    amount: number;
    interval: string;
    duration: number;
    currency: "USD";
    planId: string;
    planRef: string;
    tierId: string | null;
    flw?: FlutterwavePaymentPlanResponse | null;
  };



export enum UserFollowAction {
    FOLLOW = "FOLLOW",
    UNFOLLOW = "UNFOLLOW",
    ACCEPT = "ACCEPT", 
    REJECT = "REJECT",
    CANCEL = "CANCEL"
}

export enum ConvoKind {
    CHAT = "chat",
    ANONYMOUS = "anonymous"
}