import { Country, FollowStatus, UserRoleEnum, UserStatus, UserTypeEnum } from "@prisma/client";

type UserMeta = {
    type: string;
    color: string;
    status: string;
    isPro: boolean
    isLegacy: boolean
    isActive: boolean,
    isPrivate: boolean
    message: string
    accountStatus: UserStatus,
    tier: string
    level: string
};

export interface UserInfo {
    id: string;
    avatar?: string | null;
    banner?: string | null;
    website?: string | null;
    username: string;
    name: string;
    bio: string;
    role: UserRoleEnum;
    userType: UserTypeEnum;
    createdAt: Date | string;
    country?: Country
    email?: string
    meta: UserMeta
}

export interface SessionUser extends Pick<UserInfo, 'id' | 'avatar' | 'username' | 'name'| 'email' | 'role'> {
    sessionId?: string;
    
}

export interface AuthUser extends UserInfo {sessionId?: string}

export interface MutualFollower {
    id: string;
    name: string;
    avatar?: string | null;
    username: string;
    conn: {
        followerCount: number;
        followingCount: number;
    }
}

export interface UserConnInfo {
    followerCount: number;
    followingCount: number;
    mutualCount: number;
    isFollowingUser: boolean
    isFollowedByUser: boolean
    followingStatus?: FollowStatus
    followedStatus?: FollowStatus
}

export interface UserPublic extends UserInfo {
    conn: UserConnInfo
    mutualFollowers?: MutualFollower[];
}

export interface UserProfileOverview extends UserInfo {
  dateOfBirth?: string | null;
    stats: {
        totalReplies: number;
        totalMediaPosts: number;
        totalPosts: number;
        totalBookmarks: number;
        totalHighlights: number;
        totalLikes: number;
        totalScheduled: number;
    }
    actions: {
        hasBlockedUser: boolean;
        isBlockedByUser: boolean;
        hasMutedUser: boolean;
        isMutedByUser: boolean
    }
    conn: UserConnInfo
    mutualFollowers?: MutualFollower[];
}

export enum ConnTypeEnum {
    SUGGESTED = "suggested",
    MUTUAL_FOLLOWS = "mutual_follows",
    POPULAR_CREATORS = "popular_creators",
    INTEREST = "interest",
    NEAR_YOU = "near_you"
  }