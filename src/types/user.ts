import { UserRoleEnum, UserTypeEnum } from "@prisma/client";

type UserMeta = {
    type: string;
    color: string;
    status: string;
    isPro: boolean
    isLegacy: boolean
    isActive: boolean,
};

export interface UserInfo {
    id: string;
    avatar?: string | null;
    username: string;
    name: string;
    bio: string;
    role: UserRoleEnum;
    userType: UserTypeEnum;
    meta: UserMeta
}

export interface UserPublic extends UserInfo {
    
}

export interface UserConnection extends UserInfo {
    followBack: boolean,
    hasFollowed: boolean;
    followerCount: number,
    followingCount: number

}

interface UserFollower extends UserInfo {
    followerCount: number;
    followingCount: number;
}

export interface UserMiniProfile extends UserInfo {
    followerCount: number;
    followingCount: number;
    mutualCount: number;
    followers: UserFollower[];
}

export enum ConnTypeEnum {
    SUGGESTED = "suggested",
    MUTUAL_FOLLOWS = "mutual_follows",
    POPULAR_CREATORS = "popular_creators",
    INTEREST = "interest",
    NEAR_YOU = "near_you"
  }