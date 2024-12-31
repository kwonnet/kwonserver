import { BillingCycleEnum, TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum, TxnTypeEnum, UserRoleEnum, UserTypeEnum } from "@prisma/client";
import { Request } from "express";

export type RequestWithUser = Request & {
  user?: {
    id: string;
    telId: string;
    name: string;
    username: string;
    avatar: string;
  };
};

export interface AuthUser {
    id: string;
    name: string;
    telId: string;
    username: string;
    avatar: string;
    role: UserRoleEnum;
    userType: UserTypeEnum;
    email: string;
    meta: {
      type: "LEGACY" | "PRO";
      status: "ACTIVE" | "INACTIVE" | "PAUSED";
      color: "blue" | "gold" | "grey";
      isActive: boolean;
      isPro: boolean;
      isLegacy: boolean;
    };
  }


export interface User {
    id: string,
    telId: string,
    name: string,
    username: string,
    avatar: string
    
}

export interface Coin {
  id: string;
  name: string;
  amount: number;
  price: number;
  bonus: number;
}

export enum CoinPayTypeEnum {
    STARS = "STARS",
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
    GAME_ROOM_PARTICIPANTS = "game_room_participants",
    GAME_ROOM_ACHIEVEMENT = "game_room_achievement",
    GAME_TOTAL_PLAYERS = "game_total_players",
    GAME_ERROR_NOTIFY = "game_error_notify",
    GAME_PLAYER_ENERGY = "game_player_energy",
    GAME_PLAYER_DATA = "game_player_data",
    GAME_PLAYER_WALLET_UPDATE = "game_player_wallet_update",
    PLAYER_JOINED = "player_joined",
    MESSAGE = "message",
    NOTIFY_MESSAGE = "notify_message",
}
export interface TempGameRoom {
    status: GameStatusEnum;
    roomId: string;
    catId: string;
    timer?: number;
}

export interface ThemedGameQuestion {
    id: string | number;
    question: string;
    options: string[];
    answer: string;
}

export interface ThemedGameAnswer {
    qId: number | string;
    name: string;
    roomId: string;
    catId: string;
    playerId: string;
    choice: string;
    timer: number;
}

export interface ThemedGameChoice {
    timer:number; 
    choice: string, 
    qId: string | number
}

export interface ThemedGameScore {
    roomId: string;
    catId: string;
    playerId: string;
    name: string;
    choice: string;
    timer: number;
    score: number
}

export interface ThemedGameScoreStat {
    score: number
    playerId: string;
    catId: string;
    roomId: string;
    month: number;
    year: number;
}

export interface PlayerGameEnergy {
    playerId: string, 
    catId: string, 
    amount: number, 
    gauge: number, 
    turbo: number
}

export enum GameActionEnum {
    CHAT = "CHAT",
    ANSWER = "ANSWER",
}

export interface RewardQuery {
    catId?: string | null;
    userId: string;
    year?: number | null;
    page: number;
    limit: number;
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
        telId: string;
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
        telId: string;
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

export enum TmaPaymentGateway {
    STARS = "STARS",
    SMART_GLOCAL = "SMART_GLOCAL",
    UNLIMINT = "UNLIMINT",
}
