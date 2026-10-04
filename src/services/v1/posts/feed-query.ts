import { FollowStatus, SubStatusEnum, Prisma } from "@prisma/client";
import { recommendationVisibility } from "@/services/recommendation-visibility";

/** Keep all visibility and viewer-specific fields in the authoritative database read. */
export function newsfeedQuery(userId: string, recs: string[]) {
  const viewerReposts = {
    where: { userId, kind: "REPOST", status: "PUBLISHED", deletedAt: null },
    select: { id: true, parentId: true },
  } satisfies Prisma.Post$repliesArgs;
  return {
      // One database round trip for the complete page, including viewer reactions.
      relationLoadStrategy: "join",
      where: {
        ...recommendationVisibility(userId),
        id: { in: recs },
      },
      include: {
        replies: viewerReposts,
        thread: false,
        media: true,
        replyContinents: true,
        replyCountries: true,
        root: {
          select: {
            id: true,
            scope: true,
            userId: true,
            rootId: true,
            replyContinents: true,
            replyCountries: true,
            user: {
              select: {
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: userId },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: userId },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: userId },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: userId },
                },
              },
            },
          },
        },
        pins: {
          where: { userId: userId },
          select: { id: true, userId: true },
        },
        highlights: {
          where: { userId: userId },
          select: { id: true, userId: true },
        },
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            bio: true,
            role: true,
            userType: true,
            meta: true,
            isVerified: true,
            metadata: true,
            createdAt: true,
            status: true,
            followers: {
              where: {
                followerId: userId,
              },
              select: {
                id: true,
                followerId: true,
                followingId: true,
                status: true,
              },
            },
            following: {
              where: {
                followingId: userId,
              },
              select: {
                id: true,
                followerId: true,
                followingId: true,
                status: true,
              },
            },
            // 1. if this target user blocked the current user
            blockedUsers: {
              where: { blockedId: userId },
            },
            // 2. if current user blocked the target user
            blockedBy: {
              where: { blockerId: userId },
            },
            // 1. if this target user blocked the current user
            mutedUsers: {
              where: { mutedId: userId },
            },
            // 2. if current user blocked the target user
            mutedBy: {
              where: { muterId: userId },
            },
            subscriptions: {
              where: {
                status: {
                  in: [
                    SubStatusEnum.ACTIVE,
                    SubStatusEnum.TRIAL,
                    SubStatusEnum.PAYMENT_ERROR,
                  ],
                },
              },
            },
            country: {
              select: {
                id: true,
                name: true,
                iso2: true,
                iso3: true,
                emoji: true,
                continentId: true,
                continent: true,
              },
            },
          },
        },
        tagUsers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                _count: {
                  select: {
                    followers: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                    following: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                  },
                },
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: userId },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: userId },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: userId },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: userId },
                },
                subscriptions: {
                  where: {
                    status: {
                      in: [
                        SubStatusEnum.ACTIVE,
                        SubStatusEnum.TRIAL,
                        SubStatusEnum.PAYMENT_ERROR,
                      ],
                    },
                  },
                },
                country: {
                  select: {
                    id: true,
                    name: true,
                    iso2: true,
                    iso3: true,
                    emoji: true,
                    continentId: true,
                    continent: true,
                  },
                },
              },
            },
          },
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                _count: {
                  select: {
                    followers: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                    following: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                  },
                },
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: userId },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: userId },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: userId },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: userId },
                },
                subscriptions: {
                  where: {
                    status: {
                      in: [
                        SubStatusEnum.ACTIVE,
                        SubStatusEnum.TRIAL,
                        SubStatusEnum.PAYMENT_ERROR,
                      ],
                    },
                  },
                },
                country: {
                  select: {
                    id: true,
                    name: true,
                    iso2: true,
                    iso3: true,
                    emoji: true,
                    continentId: true,
                    continent: true,
                  },
                },
              },
            },
          },
        },
        poll: {
          include: {
            options: {
              include: {
                voters: {
                  where: {
                    userId: userId,
                  },
                },
              },
            },
            continents: true,
            countries: true,
          },
        },
        quiz: {
          include: {
            options: {
              include: {
                participants: {
                  where: {
                    userId: userId,
                  },
                },
              },
            },
            continents: true,
            countries: true,
          },
        },
        parent: {
          include: {
            replies: viewerReposts,
            media: true,
            replyContinents: true,
            replyCountries: true,
            root: {
              select: {
                id: true,
                scope: true,
                userId: true,
                rootId: true,
                replyContinents: true,
                replyCountries: true,
                user: {
                  select: {
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: userId },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: userId },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: userId },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: userId },
                    },
                  },
                },
              },
            },
            pins: {
              where: { userId: userId },
              select: { id: true, userId: true },
            },
            highlights: {
              where: { userId: userId },
              select: { id: true, userId: true },
            },
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: userId },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: userId },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: userId },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: userId },
                },
                subscriptions: {
                  where: {
                    status: {
                      in: [
                        SubStatusEnum.ACTIVE,
                        SubStatusEnum.TRIAL,
                        SubStatusEnum.PAYMENT_ERROR,
                      ],
                    },
                  },
                },
                country: {
                  select: {
                    id: true,
                    name: true,
                    iso2: true,
                    iso3: true,
                    emoji: true,
                    continentId: true,
                    continent: true,
                  },
                },
              },
            },
            tagUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: userId },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: userId },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: userId },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: userId },
                    },
                    subscriptions: {
                      where: {
                        status: {
                          in: [
                            SubStatusEnum.ACTIVE,
                            SubStatusEnum.TRIAL,
                            SubStatusEnum.PAYMENT_ERROR,
                          ],
                        },
                      },
                    },
                    country: {
                      select: {
                        id: true,
                        name: true,
                        iso2: true,
                        iso3: true,
                        emoji: true,
                        continentId: true,
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            mentions: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: userId },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: userId },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: userId },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: userId },
                    },
                    subscriptions: {
                      where: {
                        status: {
                          in: [
                            SubStatusEnum.ACTIVE,
                            SubStatusEnum.TRIAL,
                            SubStatusEnum.PAYMENT_ERROR,
                          ],
                        },
                      },
                    },
                    country: {
                      select: {
                        id: true,
                        name: true,
                        iso2: true,
                        iso3: true,
                        emoji: true,
                        continentId: true,
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            quiz: {
              include: {
                options: {
                  include: {
                    participants: {
                      where: {
                        userId: userId,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            poll: {
              include: {
                options: {
                  include: {
                    voters: {
                      where: {
                        userId: userId,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            likes: {
              where: {
                userId: userId, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            bookmarks: {
              where: {
                userId: userId, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            parent: {
              include: {
                replies: viewerReposts,
                media: true,
                replyContinents: true,
                replyCountries: true,
                pins: {
                  where: { userId: userId },
                  select: { id: true, userId: true },
                },
                highlights: {
                  where: { userId: userId },
                  select: { id: true, userId: true },
                },
                root: {
                  select: {
                    id: true,
                    scope: true,
                    userId: true,
                    rootId: true,
                    replyContinents: true,
                    replyCountries: true,
                    user: {
                      select: {
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: userId },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: userId },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: userId },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: userId },
                        },
                      },
                    },
                  },
                },
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: userId },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: userId },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: userId },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: userId },
                    },
                    subscriptions: {
                      where: {
                        status: {
                          in: [
                            SubStatusEnum.ACTIVE,
                            SubStatusEnum.TRIAL,
                            SubStatusEnum.PAYMENT_ERROR,
                          ],
                        },
                      },
                    },
                    country: {
                      select: {
                        id: true,
                        name: true,
                        iso2: true,
                        iso3: true,
                        emoji: true,
                        continentId: true,
                        continent: true,
                      },
                    },
                  },
                },
                tagUsers: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: userId },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: userId },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: userId },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: userId },
                        },
                        subscriptions: {
                          where: {
                            status: {
                              in: [
                                SubStatusEnum.ACTIVE,
                                SubStatusEnum.TRIAL,
                                SubStatusEnum.PAYMENT_ERROR,
                              ],
                            },
                          },
                        },
                        country: {
                          select: {
                            id: true,
                            name: true,
                            iso2: true,
                            iso3: true,
                            emoji: true,
                            continentId: true,
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                mentions: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: userId },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: userId },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: userId },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: userId },
                        },
                        subscriptions: {
                          where: {
                            status: {
                              in: [
                                SubStatusEnum.ACTIVE,
                                SubStatusEnum.TRIAL,
                                SubStatusEnum.PAYMENT_ERROR,
                              ],
                            },
                          },
                        },
                        country: {
                          select: {
                            id: true,
                            name: true,
                            iso2: true,
                            iso3: true,
                            emoji: true,
                            continentId: true,
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                quiz: {
                  include: {
                    options: {
                      include: {
                        participants: {
                          where: {
                            userId: userId,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                poll: {
                  include: {
                    options: {
                      include: {
                        voters: {
                          where: {
                            userId: userId,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                likes: {
                  where: {
                    userId: userId, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                bookmarks: {
                  where: {
                    userId: userId, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
              },
            },
          },
        },
        likes: {
          where: {
            userId: userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
        bookmarks: {
          where: {
            userId: userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    } satisfies Prisma.PostFindManyArgs;
}
