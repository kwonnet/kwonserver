import prisma from "@/db";
import logger from "@/logger";
import { FeedPost } from "@/types";
import {
  PollThread,
  PostCreate,
  PostTagMention,
  QuizThread,
} from "@/types/post";
import { generateUniqueRef } from "@/utils";
import webpush from "@/utils/webpush";
import {
  NotifAction,
  NotifTypeEnum,
  Post,
  PostKindEnum,
  PostMedia,
  PostContext,
  PostScopeEnum,
  PostStatus,
  PostTypeEnum,
  Quiz,
  ReportStatus,
  ScopeEnum,
  SubStatusEnum,
  TxnCategoryEnum,
  TxnCurrencyEnum,
  TxnGatewayEnum,
  TxnSourceEnum,
  TxnStatusEnum,
  TxnTypeEnum,
  PostAction,
  UserRoleEnum,
  Prisma,
  PostMediaKind,
  PostMediaAction,
  PostMetricAction,
  PostMetricSource,
  TipSource,
  TipStatus,
  FollowStatus,
} from "@prisma/client";
import {
  analyticsPercentageChange,
  composeAuthUser,
  composePostAuthor,
  serializeBigInts,
  getAnalyticsDuration,
  transformPost,
  transformPrismaTagMentions,
} from "../utils";
import { ReportSchema } from "@/schema";
import redisClient from "@/redis";
import { DetectResult, ResultDevice } from "node-device-detector";
import { LookupResult } from "ip-location-api";
import { AppError, cleanTextContent, generateEmbedding, removeProperty, commentClassifier, contentTopicClassifier, topicClassifier, cleanTextContentWithHashtag } from "@/utils/helpers";
import { SessionUser, AuthUser } from "@/types/user";
import { clickHouseClient } from "@/db/clickhouse";
import { prismaAnalytics, sequelizeAnalytics } from "@/db/timescaleDb";
import axios from "axios";
import { removeStopwords, eng, fra } from 'stopword'

// Precompute script — GOLD STANDARD 2025

interface CreatePostThread extends Post {
  quiz?: Quiz | null;
}

export const createPost = async (body: PostCreate, userId: string) => {
  try {
    // if(!body.isDraft){
    //   body.thread = await Promise.all(body?.thread?.map(async(item) => {
    //     const text = cleanTextContent(item?.content);
    //     const contentEmbedding = text ? await generateEmbedding(text) : null
    //     return {
    //       ...item,
    //       contentEmbedding
    //     }
    //   }))
    // }
    // check rewarded quiz and check if user has enough coins
    const rewardedQuiz = body.thread.filter(
      (item) => item.type === PostTypeEnum.QUIZ || item.quiz?.isPaid
    );
    const totalRewardAmount = rewardedQuiz.reduce(
      (prev, curr) => prev + (curr.quiz?.rewardAmount ?? 0),
      0
    );
    //  check user wallet balance
    if (rewardedQuiz.length > 0) {
      const userWallet = await prisma.wallet.findUniqueOrThrow({
        where: { userId },
      });
      if (userWallet.coins < totalRewardAmount) {
        return {
          data: "Insufficient balance to create reward quiz",
          status: 400,
        };
      }
    }
    const isScheduled = !!body.scheduleAt;
    

    const result = await prisma.$transaction(async (tx) => {
      // locked user wallet temporary
      if (rewardedQuiz.length > 0) {
        await tx.wallet.update({
          where: { userId },
          data: {
            isLocked: true,
          },
        });
      }
      // check if scheduled
      const schedule = body.scheduleAt
        ? {
            status: body.isDraft ? PostStatus.DRAFT : PostStatus.SCHEDULED,
            scheduleAt: new Date(body.scheduleAt),
          }
        : {};
      // Step 1: Create the root post (first item in the array)
      const {
        poll,
        quiz,
        tags,
        mentions,
        tagUsers,
        countries,
        continents,
        ...rest
      } = body.thread[0];
      let rootPost = undefined;
      // get mentioned users if any
      const users = await prisma.user.findMany({
        where: { username: { in: mentions } },
      });

      const mentionedUsers = users.map((user) => user.id);

      if (rest.type === PostTypeEnum.POLL) {
        const _pollItem = poll as PollThread;
        const expireAt = getExpiryDate(_pollItem.duration);
        const pollItem = removeProperty(_pollItem, "duration");
        rootPost = await tx.post.create({
          data: {
            ...rest,
            ...schedule,
            location: body.location,
            
            media: { createMany: { data: rest.media } },
            replyCountries: {
              createMany: {
                data: countries.map((id) => ({ countryId: id })),
              },
            },
            replyContinents: {
              createMany: {
                data: continents.map((id) => ({
                  continentId: id,
                })),
              },
            },
            hashTags: {
              create: tags.map((name) => ({
                tag: {
                  connectOrCreate: {
                    where: { name },
                    create: { name },
                  },
                },
              })),
            },
            mentions: {
              createMany: {
                data: mentionedUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            tagUsers: {
              createMany: {
                data: tagUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            poll: {
              create: {
                ...pollItem,
                expireAt,
                options: {
                  createMany: {
                    data: pollItem.options.map((opt) => ({ text: opt.text })),
                  },
                },
                countries: {
                  createMany: {
                    data: pollItem.countries.map((id) => ({ countryId: id })),
                  },
                },
                continents: {
                  createMany: {
                    data: pollItem.continents.map((id) => ({
                      continentId: id,
                    })),
                  },
                },
              },
            },
            userId,
            kind: PostKindEnum.ROOT,
          },
          include: {
            quiz: true,
          },
        });
      } else if (rest.type === PostTypeEnum.QUIZ) {
        const _quizItem = quiz as QuizThread;
        const expireAt = getExpiryDate(_quizItem.duration);
        const quizItem = removeProperty(_quizItem, "duration");
        rootPost = await tx.post.create({
          data: {
            ...rest,
            ...schedule,
            location: body.location,
            userId,
            kind: PostKindEnum.ROOT,
            media: { createMany: { data: rest.media } },
            replyCountries: {
              createMany: {
                data: countries.map((id) => ({ countryId: id })),
              },
            },
            replyContinents: {
              createMany: {
                data: continents.map((id) => ({
                  continentId: id,
                })),
              },
            },
            hashTags: {
              create: tags.map((name) => ({
                tag: {
                  connectOrCreate: {
                    where: { name },
                    create: { name },
                  },
                },
              })),
            },
            mentions: {
              createMany: {
                data: mentionedUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            tagUsers: {
              createMany: {
                data: tagUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            quiz: {
              create: {
                ...quizItem,
                expireAt,
                options: {
                  createMany: {
                    data: quizItem.options.map((opt) => ({
                      text: opt.text,
                      isCorrect: opt.isCorrect,
                    })),
                  },
                },
                countries: {
                  createMany: {
                    data: quizItem.countries.map((id) => ({ countryId: id })),
                  },
                },
                continents: {
                  createMany: {
                    data: quizItem.continents.map((id) => ({
                      continentId: id,
                    })),
                  },
                },
              },
            },
          },
          include: {
            quiz: true,
          },
        });
      } else {
        rootPost = await tx.post.create({
          data: {
            ...rest,
            ...schedule,
            location: body.location,
            media: { createMany: { data: rest.media } },
            replyCountries: {
              createMany: {
                data: countries.map((id) => ({ countryId: id })),
              },
            },
            replyContinents: {
              createMany: {
                data: continents.map((id) => ({
                  continentId: id,
                })),
              },
            },
            hashTags: {
              create: tags.map((name) => ({
                tag: {
                  connectOrCreate: {
                    where: { name },
                    create: { name },
                  },
                },
              })),
            },
            mentions: {
              createMany: {
                data: mentionedUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            tagUsers: {
              createMany: {
                data: tagUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            userId,
            kind: PostKindEnum.ROOT,
          },
          include: {
            quiz: true,
          },
        });
      }
      const thread: CreatePostThread[] = [];
      if (body.thread.length > 1) {
        // Step 2: Insert thread posts (all linked to root post)
        const threadPosts = body.thread.slice(1);

        for (let i = 0; i < threadPosts.length; i++) {
          const { mentions, tags, poll, quiz, tagUsers, ...item } =
            threadPosts[i];
          // get mentioned users if any
          const users =
            mentions.length > 0
              ? await prisma.user.findMany({
                  where: { username: { in: mentions } },
                })
              : [];
          const mentionedUsers = users.map((user) => user.id);
          // check post type
          if (item.type === PostTypeEnum.POLL) {
            const _pollItem = poll as PollThread;
            const expireAt = getExpiryDate(_pollItem.duration);
            const pollItem = removeProperty(_pollItem, "duration");
            const res = await tx.post.create({
              data: {
                ...item,
                parentId: rootPost.id,
                ...schedule,
                location: body.location,
                media: { createMany: { data: item.media } },
                hashTags: {
                  create: tags.map((name) => ({
                    tag: {
                      connectOrCreate: {
                        where: { name },
                        create: { name },
                      },
                    },
                  })),
                },
                mentions: {
                  createMany: {
                    data: mentionedUsers.map((id) => ({ userId: id })),
                    skipDuplicates: true,
                  },
                },
                tagUsers: {
                  createMany: {
                    data: tagUsers.map((id) => ({ userId: id })),
                    skipDuplicates: true,
                  },
                },
                poll: {
                  create: {
                    ...pollItem,
                    expireAt,
                    options: {
                      createMany: {
                        data: pollItem.options.map((opt) => ({
                          text: opt.text,
                        })),
                      },
                    },
                    countries: {
                      createMany: {
                        data: pollItem.countries.map((id) => ({
                          countryId: id,
                        })),
                      },
                    },
                    continents: {
                      createMany: {
                        data: pollItem.continents.map((id) => ({
                          continentId: id,
                        })),
                      },
                    },
                  },
                },
                userId,
                kind: PostKindEnum.THREAD,
              },
              include: {
                quiz: true,
              },
            });
            thread.push(res);
          } else if (item.type === PostTypeEnum.QUIZ) {
            const _quizItem = quiz as QuizThread;
            const expireAt = getExpiryDate(_quizItem.duration);
            const quizItem = removeProperty(_quizItem, "duration");
            const res = await tx.post.create({
              data: {
                ...item,
                ...schedule,
                parentId: rootPost.id,
                location: body.location,
                userId,
                kind: PostKindEnum.THREAD,
                media: { createMany: { data: item.media } },
                hashTags: {
                  create: tags.map((name) => ({
                    tag: {
                      connectOrCreate: {
                        where: { name },
                        create: { name },
                      },
                    },
                  })),
                },
                mentions: {
                  createMany: {
                    data: mentionedUsers.map((id) => ({ userId: id })),
                    skipDuplicates: true,
                  },
                },
                tagUsers: {
                  createMany: {
                    data: tagUsers.map((id) => ({ userId: id })),
                    skipDuplicates: true,
                  },
                },
                quiz: {
                  create: {
                    ...quizItem,
                    expireAt,
                    options: {
                      createMany: {
                        data: quizItem.options.map((opt) => ({
                          text: opt.text,
                          isCorrect: opt.isCorrect,
                        })),
                      },
                    },
                    countries: {
                      createMany: {
                        data: quizItem.countries.map((id) => ({
                          countryId: id,
                        })),
                      },
                    },
                    continents: {
                      createMany: {
                        data: quizItem.continents.map((id) => ({
                          continentId: id,
                        })),
                      },
                    },
                  },
                },
              },
              include: {
                quiz: true,
              },
            });
            thread.push(res);
          } else {
            const res = await tx.post.create({
              data: {
                ...item,
                ...schedule,
                parentId: rootPost.id,
                location: body.location,
                userId,
                kind: PostKindEnum.THREAD,
                media: { createMany: { data: item.media } },
                hashTags: {
                  create: tags.map((name) => ({
                    tag: {
                      connectOrCreate: {
                        where: { name },
                        create: { name },
                      },
                    },
                  })),
                },
                mentions: {
                  createMany: {
                    data: mentionedUsers.map((id) => ({ userId: id })),
                    skipDuplicates: true,
                  },
                },
                tagUsers: {
                  createMany: {
                    data: tagUsers.map((id) => ({ userId: id })),
                    skipDuplicates: true,
                  },
                },
              },
              include: {
                quiz: true,
              },
            });
            thread.push(res);
          }
        }
      }

      // deduct user wallet for the paid quiz
      const rewardPostQuizzes = [rootPost, ...thread]
        .filter((p) => p.type === PostTypeEnum.QUIZ)
        .filter((p) => p.quiz?.isPaid);
      if (rewardPostQuizzes.length > 0) {
        await Promise.all(
          rewardPostQuizzes.map(async (post) => {
            const quiz = post.quiz!;
            const wallet = await tx.wallet.update({
              where: { userId },
              data: {
                isLocked: false,
                coins: {
                  decrement: quiz.rewardAmount,
                },
              },
            });

            return tx.transaction.create({
              data: {
                userId,
                amount: quiz.rewardAmount,
                postId: post.id,
                txnRef: generateUniqueRef(),
                description: `Quiz reward pool`,
                senderId: post.userId,
                walletId: wallet.id,
                type: TxnTypeEnum.DEBIT,
                currency: TxnCurrencyEnum.COINS,
                source: TxnSourceEnum.COINS,
                gateway: TxnGatewayEnum.WALLET,
                status: TxnStatusEnum.COMPLETED,
                category: TxnCategoryEnum.QUIZ_POST,
              },
            });
          })
        );
      }
      return { ...rootPost, thread };
    });

    triggerPushNotification(
      "cm8wuohmp0002c9jnx181fdno",
      result.content?.slice(0, 100) ?? "User just published a post"
    );

    // 1. if this is a scheduled post, schedule the post
    // isScheduled, scheduleAt, postId: result.id
    // 2. Notify tagged & mentioned users

    return { data: serializeBigInts(result), status: 200 };
  } catch (error: any) {
    console.log(error?.message)
    return {
      data: "Error occurred trying to create post, please try again",
      status: 500,
    };
  }
};

export const createPostQuote = async (
  postId: string,
  userId: string,
  body: PostCreate
) => {
  try {
    const isScheduled = !!body.scheduleAt;
    const result = await prisma.$transaction(async (tx) => {
      // check if post exists
      await tx.post.findUniqueOrThrow({ where: { id: postId } });
      // check if scheduled
      const schedule = body.scheduleAt
        ? {
            status: body.isDraft ? PostStatus.DRAFT : PostStatus.SCHEDULED,
            scheduleAt: new Date(body.scheduleAt),
          }
        : {};
      // Step 1: Create the root post (first item in the array)
      const {
        poll,
        quiz,
        tags,
        mentions,
        tagUsers,
        continents,
        countries,
        ...rest
      } = body.thread[0];
      let rootPost = undefined;
      // get mentioned users if any
      const users = await prisma.user.findMany({
        where: { username: { in: mentions } },
      });

      const mentionedUsers = users.map((user) => user.id);

      if (rest.type === PostTypeEnum.POLL) {
        const _pollItem = poll as PollThread;
        const expireAt = getExpiryDate(_pollItem.duration);
        const pollItem = removeProperty(_pollItem, "duration");
        rootPost = await tx.post.create({
          data: {
            ...rest,
            ...schedule,
            location: body.location,
            media: { createMany: { data: rest.media } },
            replyCountries: {
              createMany: {
                data: countries.map((id) => ({ countryId: id })),
              },
            },
            replyContinents: {
              createMany: {
                data: continents.map((id) => ({
                  continentId: id,
                })),
              },
            },
            hashTags: {
              create: tags.map((name) => ({
                tag: {
                  connectOrCreate: {
                    where: { name },
                    create: { name },
                  },
                },
              })),
            },
            mentions: {
              createMany: {
                data: mentionedUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            tagUsers: {
              createMany: {
                data: tagUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            poll: {
              create: {
                ...pollItem,
                expireAt,
                options: {
                  createMany: {
                    data: pollItem.options.map((opt) => ({ text: opt.text })),
                  },
                },
                countries: {
                  createMany: {
                    data: pollItem.countries.map((id) => ({ countryId: id })),
                  },
                },
                continents: {
                  createMany: {
                    data: pollItem.continents.map((id) => ({
                      continentId: id,
                    })),
                  },
                },
              },
            },
            userId,
            kind: PostKindEnum.QUOTE,
            parentId: postId,
          },
        });
      } else {
        rootPost = await tx.post.create({
          data: {
            ...rest,
            ...schedule,
            location: body.location,
            media: { createMany: { data: rest.media } },
            replyCountries: {
              createMany: {
                data: countries.map((id) => ({ countryId: id })),
              },
            },
            replyContinents: {
              createMany: {
                data: continents.map((id) => ({
                  continentId: id,
                })),
              },
            },
            hashTags: {
              create: tags.map((name) => ({
                tag: {
                  connectOrCreate: {
                    where: { name },
                    create: { name },
                  },
                },
              })),
            },
            mentions: {
              createMany: {
                data: mentionedUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            tagUsers: {
              createMany: {
                data: tagUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            userId,
            kind: PostKindEnum.QUOTE,
            parentId: postId,
          },
        });
      }

      // if (body.thread.length === 1){
      //   return { isQuoted: true, data: { postId, userId } };
      // }

      // Step 2: Insert thread posts (all linked to root post)
      const threadPosts = body.thread.slice(1);
      const thread = [];
      for (let i = 0; i < threadPosts.length; i++) {
        let res = undefined;
        const { mentions, tags, quiz, poll, tagUsers, ...item } =
          threadPosts[i];
        // get mentioned users if any
        const users =
          mentions.length > 0
            ? await prisma.user.findMany({
                where: { username: { in: mentions } },
              })
            : [];
        const mentionedUsers = users.map((user) => user.id);
        // check post type
        if (item.type === PostTypeEnum.POLL) {
          const _pollItem = poll as PollThread;
          const expireAt = getExpiryDate(_pollItem.duration);
          const pollItem = removeProperty(_pollItem, "duration");
          res = await tx.post.create({
            data: {
              ...item,
              ...schedule,
              location: body.location,
              media: { createMany: { data: item.media } },
              hashTags: {
                create: tags.map((name) => ({
                  tag: {
                    connectOrCreate: {
                      where: { name },
                      create: { name },
                    },
                  },
                })),
              },
              mentions: {
                createMany: {
                  data: mentionedUsers.map((id) => ({ userId: id })),
                  skipDuplicates: true,
                },
              },
              tagUsers: {
                createMany: {
                  data: tagUsers.map((id) => ({ userId: id })),
                  skipDuplicates: true,
                },
              },
              poll: {
                create: {
                  ...pollItem,
                  expireAt,
                  options: {
                    createMany: {
                      data: pollItem.options.map((opt) => ({ text: opt.text })),
                    },
                  },
                  countries: {
                    createMany: {
                      data: pollItem.countries.map((id) => ({
                        countryId: id,
                      })),
                    },
                  },
                  continents: {
                    createMany: {
                      data: pollItem.continents.map((id) => ({
                        continentId: id,
                      })),
                    },
                  },
                },
              },
              userId,
              kind: PostKindEnum.THREAD,
              parentId: rootPost.id,
            },
          });
        } else {
          res = await tx.post.create({
            data: {
              ...item,
              ...schedule,
              location: body.location,
              userId,
              kind: PostKindEnum.THREAD,
              parentId: rootPost.id,
              media: { createMany: { data: item.media } },
              hashTags: {
                create: tags.map((name) => ({
                  tag: {
                    connectOrCreate: {
                      where: { name },
                      create: { name },
                    },
                  },
                })),
              },
              mentions: {
                createMany: {
                  data: mentionedUsers.map((id) => ({ userId: id })),
                  skipDuplicates: true,
                },
              },
              tagUsers: {
                createMany: {
                  data: tagUsers.map((id) => ({ userId: id })),
                  skipDuplicates: true,
                },
              },
            },
          });
        }
        thread.push(res);
      }
      // Increase totalQuotes count for the original post
      await tx.post.update({
        where: { id: postId },
        data: { totalQuotes: { increment: 1 } },
      });
      return { isQuoted: true, data: { postId, userId } };
    });
    return { data: result, status: 200 };
  } catch (error) {
    return {
      data: "Error occurred while processing request, please try again",
      status: 500,
    };
  }
};

export const createPostReply = async (
  postId: string,
  body: PostCreate,
  user: AuthUser
) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      let reply: Post | undefined = undefined;
      const post = await tx.post.findUniqueOrThrow({ where: { id: postId } });
      const rootId = post.rootId || post.id;
      // check if scheduled
      const { isDraft, thread } = body;
      const schedule = body.scheduleAt
        ? {
            status: isDraft ? PostStatus.DRAFT : PostStatus.SCHEDULED,
            scheduleAt: new Date(body.scheduleAt),
          }
        : {};
      // create new post reply
      const {
        mentions,
        tagUsers,
        tags,
        media,
        poll,
        quiz,
        countries,
        continents,
        ...rest
      } = thread[0];
      // get mentioned users if any
      const users = await prisma.user.findMany({
        where: { username: { in: mentions } },
      });
      const mentionedUsers = users.map((user) => user.id);
      if (rest.type === PostTypeEnum.POLL) {
        const _pollItem = poll as PollThread;
        const expireAt = getExpiryDate(_pollItem.duration);
        const pollItem = removeProperty(_pollItem, "duration");
        reply = await tx.post.create({
          data: {
            ...rest,
            ...schedule,
            location: body.location,
            rootId,
            media: { createMany: { data: media } },
            hashTags: {
              create: tags.map((name) => ({
                tag: {
                  connectOrCreate: {
                    where: { name },
                    create: { name },
                  },
                },
              })),
            },
            mentions: {
              createMany: {
                data: mentionedUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            tagUsers: {
              createMany: {
                data: tagUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            poll: {
              create: {
                ...pollItem,
                expireAt,
                options: {
                  createMany: {
                    data: pollItem.options.map((opt) => ({ text: opt.text })),
                  },
                },
                countries: {
                  createMany: {
                    data: pollItem.countries.map((id) => ({ countryId: id })),
                  },
                },
                continents: {
                  createMany: {
                    data: pollItem.continents.map((id) => ({
                      continentId: id,
                    })),
                  },
                },
              },
            },
            userId: user.id,
            kind: PostKindEnum.REPLY,
            parentId: postId,
          },
        });
      } else {
        reply = await tx.post.create({
          data: {
            ...rest,
            ...schedule,
            location: body.location,
            rootId,
            media: { createMany: { data: media } },
            hashTags: {
              create: tags.map((name) => ({
                tag: {
                  connectOrCreate: {
                    where: { name },
                    create: { name },
                  },
                },
              })),
            },
            mentions: {
              createMany: {
                data: mentionedUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            tagUsers: {
              createMany: {
                data: tagUsers.map((id) => ({ userId: id })),
                skipDuplicates: true,
              },
            },
            userId: user.id,
            kind: PostKindEnum.REPLY,
            parentId: postId,
          },
        });
      }
      // Increase totalReplies count for the parent post
      await tx.post.update({
        where: { id: postId },
        data: { totalReplies: { increment: 1 } },
      });
      // insert reply notification IF Not owner
      if (post?.userId !== user.id) {
        // insert notification
        await tx.notification.create({
          data: {
            senderId: user.id,
            recipientId: post.userId,
            postId: reply.id,
            type: NotifTypeEnum.POST,
            action: NotifAction.COMMENT,
            message: `${user.name} replied to your ${
              post.kind === PostKindEnum.REPLY ? "comment" : "post"
            }`,
            title: "New post comment",
          },
        });
      }
      return { reply, replied: true, id: postId, userId: user.id };
    });
    const { reply, ...rest } = result;
    // check if it's neither schedule nor draft and return the reply to the ui
    if (reply && !body.isDraft && !body.scheduleAt) {
      const res = await getSinglePost(reply.id, user.id);
      if (!res) return { data: rest, status: 200 };
      const transformed = transformPost(res, user);
      return { data: serializeBigInts({ ...rest, reply: transformed }), status: 200 };
    }
    return { data: serializeBigInts(rest), status: 200 };
  } catch (error: any) {
    logger.error(error?.message);
    return { data: "Error occurred reposting, please try again", status: 500 };
  }
};

export const reportPost = async (body: ReportSchema, user: SessionUser) => {
  try {
    const report = await prisma.postReport.findFirst({
      where: { postId: body.id, userId: user.id },
      orderBy: [{ createdAt: "desc" }],
    });
    // check if the user has already reported the post with 24 hours
    if (
      report &&
      new Date(report.createdAt).getTime() >
        new Date(Date.now() - 1000 * 60 * 60 * 24).getTime()
    ) {
      return {
        data: "You have already reported this post, wait till after 24hrs to report again",
        status: 400,
      };
    }
    // check if the post exists
    const post = await prisma.post.findUniqueOrThrow({
      where: { id: body.id },
    });
    // report the post
    await prisma.postReport.create({
      data: {
        postId: body.id,
        userId: user.id,
        reason: body.code,
        meta: body.meta,
        message: body.message,
      },
    });
    return { data: { id: post.id, userId: user.id }, status: 200 };
  } catch (error) {
    return { data: "Error ocurred, please try again", status: 500 };
  }
};

export const createPostPin = async (
  args: { id: string; context: PostContext },
  user: SessionUser
) => {
  try {
    // check if user is the post owner
    const post = await prisma.post.findFirst({
      where: { id: args.id, userId: user.id, status: PostStatus.PUBLISHED },
    });
    if (!post)
      return {
        data: "Post doesn't exist or you are not the post owner",
        status: 404,
      };
    // check post pins
    const result = await prisma.postPin.findFirst({
      where: { postId: args.id, contextType: args.context, userId: user.id },
      orderBy: [{ createdAt: "desc" }],
    });

    // check if the user has already pinned this post
    if (result) {
      await prisma.postPin.delete({ where: { id: result.id } });
      return {
        data: { id: args.id, userId: user.id, isPinned: false },
        status: 200,
      };
    }
    // check current count
    const checkCount = await prisma.postPin.count({
      where: { contextType: args.context, userId: user.id },
    });
    logger.info(`Post pins ${checkCount}`);
    if (checkCount >= 5) {
      return {
        data: "You've reached max of 5 post pins, please unpin others to pin again",
        status: 400,
      };
    }
    // report the post
    await prisma.postPin.create({
      data: {
        postId: args.id,
        userId: user.id,
        contextType: args.context,
      },
    });
    return {
      data: { id: post.id, userId: user.id, isPinned: true },
      status: 200,
    };
  } catch (error) {
    return { data: "Error ocurred, please try again", status: 500 };
  }
};

export const createPostHighlight = async (
  args: { id: string; context: PostContext },
  user: SessionUser
) => {
  try {
    // check if user is the post owner
    const post = await prisma.post.findFirst({
      where: { id: args.id, userId: user.id, status: PostStatus.PUBLISHED },
    });
    if (!post)
      return {
        data: "Post doesn't exist or you are not the post owner",
        status: 404,
      };
    // check post pins
    const result = await prisma.postHighlight.findFirst({
      where: { postId: args.id, contextType: args.context, userId: user.id },
      orderBy: [{ createdAt: "desc" }],
    });
    // check if the user has already reported the post with 24 hours
    if (result) {
      await prisma.postHighlight.delete({ where: { id: result.id } });
      return {
        data: { id: args.id, userId: user.id, isHighlighted: false },
        status: 200,
      };
    }
    // check current count
    const checkCount = await prisma.postHighlight.count({
      where: { contextType: args.context, userId: user.id },
    });
    logger.info(`Post hightlights ${checkCount}`);
    if (checkCount >= 20) {
      return {
        data: "You've reached max of 20 hightlight posts, please remove some highlight to add more",
        status: 400,
      };
    }
    // report the post
    await prisma.postHighlight.create({
      data: {
        postId: args.id,
        userId: user.id,
        contextType: args.context,
      },
    });
    return {
      data: { id: post.id, userId: user.id, isHighlighted: true },
      status: 200,
    };
  } catch (error) {
    return { data: "Error ocurred, please try again", status: 500 };
  }
};

export const notInterestedPost = async (postId: string, userId: string) => {
  try {
    const result = await prisma.postDisinterest.findFirst({
      where: { postId, userId },
    });
    if (!result) {
      await prisma.postDisinterest.create({
        data: {
          postId,
          userId,
        },
      });
      return { data: { id: postId, userId, interested: false }, status: 200 };
    } else {
      await prisma.postDisinterest.delete({
        where: { id: result.id },
      });
      return { data: { id: postId, userId, interested: true }, status: 200 };
    }
  } catch (error: any) {
    logger.error(" Not interested error " + error.message);
    return { data: "Error ocurred, please try again", status: 500 };
  }
};

export async function createPostImpression(args: {
  device: DetectResult;
  meta: LookupResult | null;
  postId: string;
  userId: string;
  sessionId: string | null | undefined;
  timestamp: string;
  referer?: string | null;
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.postImpression.create({
        data: args,
      });
      // increment the post impression counter
      await tx.post.update({
        where: { id: args.postId },
        data: { totalImpressions: { increment: 1 } },
      });
      return { data: { id: args.postId, userId: args.userId }, status: 200 };
    });
    return result;
  } catch (error) {
    return { data: "Sorry an error occurred to process request ", status: 500 };
  }
}

export async function createPostView(args: {
  device: DetectResult;
  meta: LookupResult | null;
  postId: string;
  userId: string;
  sessionId: string | null | undefined;
  timestamp: string;
  duration: number;
  referer?: string | null;
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.postView.create({
        data: args,
      });
      // increment the post impression counter
      await tx.post.update({
        where: { id: args.postId },
        data: { totalViews: { increment: 1 } },
      });
      return { data: { id: args.postId, userId: args.userId }, status: 200 };
    });
    return result;
  } catch (error) {
    return { data: "Sorry an error occurred to process request ", status: 500 };
  }
}

export async function createPostClick(args: {
  device: DetectResult;
  meta: LookupResult | null;
  postId: string;
  userId: string;
  sessionId?: string | null;
  timestamp: string;
  referer?: string | null;
  action: PostMetricAction;
  source: PostMetricSource;
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.postClick.create({
        data: args,
      });
      // increment the post impression counter
      // await tx.post.update({where: { id: args.postId }, data: { totalViews: { increment: 1}}})
      return { data: { id: args.postId, userId: args.userId }, status: 200 };
    });
    return result;
  } catch (error: any) {
    return { data: "Sorry an error occurred to process request ", status: 500 };
  }
}

export async function createPostMediaLog(args: {
  device: DetectResult;
  meta: LookupResult | null;
  postId: string;
  userId: string;
  mediaId: string;
  muted: boolean;
  timestamp: string;
  duration: number;
  playbackRate: number;
  watchedPct: number;
  sessionId?: string | null;
  referer?: string | null;
  kind: PostMediaKind;
  action: PostMediaAction;
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.postMediaLog.create({
        data: args,
      });
      // increment the post media action counter
      if (args.action === PostMediaAction.DOWNLOAD) {
        await tx.postMedia.update({
          where: { id: args.mediaId },
          data: { totalDownloads: { increment: 1 } },
        });
      }
      if (args.action === PostMediaAction.VIEW) {
        await tx.postMedia.update({
          where: { id: args.mediaId },
          data: { totalViews: { increment: 1 } },
        });
      }
      return {
        data: {
          id: args.postId,
          mediaId: args.mediaId,
          userId: args.userId,
          isDownload: args.action === PostMediaAction.DOWNLOAD,
          isView: args.action === PostMediaAction.VIEW,
        },
        status: 200,
      };
    });
    return result;
  } catch (error) {
    return { data: "Sorry an error occurred to process request ", status: 500 };
  }
}

export async function createPostTip(
  args: {
    device: DetectResult;
    meta: LookupResult | null;
    referer?: string | null;
    postId: string;
    recipientId: string;
    senderId: string;
    tipId: string;
    message?: string;
    isAnon?: boolean;
  },
  user: SessionUser
) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // check recipient
      const recipient = await tx.user.findUniqueOrThrow({
        where: { id: args.recipientId },
        select: { id: true, name: true, wallet: { select: { id: true } } },
      });
      if (!recipient.wallet) {
        throw new AppError("Recipient's wallet not found.");
      }
      // check tip package
      const tip = await tx.tipPackage.findUniqueOrThrow({
        where: { id: args.tipId },
      });
      // checker sender wallet balance
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: args.senderId },
      });
      let info = { isCredit: false, amount: tip.price };
      if (wallet.coins < tip.price) {
        if (wallet.credit * 2.2 < tip.price) {
          throw new AppError("Insufficient balance, please purchase coins");
        }
        info = { amount: Number((tip.price / 2.2).toFixed(2)), isCredit: true };
      }
      // deduct sender wallet - package price(coins) from wallet amount(coins)
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          ...(info.isCredit
            ? { credit: { decrement: info.amount } }
            : { coins: { decrement: info.amount } }),
        },
      });
      // log sender transaction
      await tx.transaction.create({
        data: {
          amount: info.amount,
          currency: info.isCredit ? TxnCurrencyEnum.TZX : TxnCurrencyEnum.COINS,
          type: TxnTypeEnum.DEBIT,
          walletId: wallet.id,
          tipPackageId: tip.id,
          category: TxnCategoryEnum.POST_TIP,
          postId: args.postId,
          senderId: args.senderId,
          recipientId: args.senderId,
          status: TxnStatusEnum.COMPLETED,
          source: info.isCredit ? TxnSourceEnum.CREDIT : TxnSourceEnum.COINS,
          gateway: TxnGatewayEnum.WALLET,
          txnRef: generateUniqueRef(),
          description: `Post tip sent to ${recipient.name}`,
        },
      });
      // credit recipient wallet - package price(coins) from wallet amount(coins)
      // we sell 2.2 coins for 1TZX but buy back at 3 coins --- tip.price is in coins
      // The system takes 45% of all tips and the recipient takes 55%
      const creditAmount = Number(((tip.price * 0.55) / 3).toFixed(2));
      // log recipient transaction
      const txn = await tx.transaction.create({
        data: {
          amount: creditAmount,
          currency: TxnCurrencyEnum.TZX,
          type: TxnTypeEnum.CREDIT,
          walletId: recipient.wallet.id,
          tipPackageId: tip.id,
          category: TxnCategoryEnum.POST_TIP,
          postId: args.postId,
          senderId: args.senderId,
          recipientId: args.recipientId,
          status: TxnStatusEnum.PENDING,
          source: TxnSourceEnum.CREDIT,
          gateway: TxnGatewayEnum.WALLET,
          txnRef: generateUniqueRef(),
          description: `Tip reward from ${
            args.isAnon ? "anonymous" : user.name
          } on your post`,
        },
      });
      // log post tip until available at
      await tx.postTip.create({
        data: {
          postId: args.postId,
          senderId: args.senderId,
          recipientId: args.recipientId,
          tipId: tip.id,
          message: args.message,
          isAnon: args.isAnon,
          device: args.device,
          meta: args.meta,
          referer: args.referer,
          rewardTip: {
            create: {
              userId: recipient.id,
              walletId: recipient.wallet.id,
              amount: creditAmount,
              source: TipSource.POST,
              status: TipStatus.PENDING,
              txnId: txn.id,
              availableAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
            },
          },
        },
      });
      // increment post tips
      await tx.post.update({
        where: { id: args.postId },
        data: { totalTips: { increment: 1 } },
      });

      return {
        data: {
          id: args.postId,
          userId: args.senderId,
          isTip: true,
        },
        status: 200,
      };
    });
    return result;
  } catch (error) {
    if (error instanceof AppError) {
      return { data: error.message, status: error.statusCode };
    }
    return { data: "Sorry an error occurred to process request ", status: 500 };
  }
}

export async function insertImpressionQueue(args: {
  device: ResultDevice;
  meta: LookupResult | null;
  postId: string;
  userId: string;
  sessionId: string | null | undefined;
  timestamp: string;
}) {
  try {
    const key = `impressions:${args.postId}:${
      args?.userId?.slice(-10) || args?.sessionId
    }`;
    const now = Date.now();
    const lastSeen = await redisClient.get(key);
    if (!lastSeen || now - Number(lastSeen) > 2 * 60 * 1000) {
      await redisClient.set(key, now, { EX: 10 * 60 }); // keep for 1h
      await redisClient.rPush("impression:queue", JSON.stringify(args));
      return { data: { id: args.postId, userId: args.userId }, status: 200 };
    }
    return { data: "Too frequent & depublicated event", status: 400 };
  } catch (error) {
    return { data: "Sorry an error occurred to process request ", status: 500 };
  }
}

export const getNewsfeed = async (recs: string[], user: AuthUser, args: { feed: string; limit?: number; page?: number }) => {
  try {

     const userId = user?.id;
    const { limit = 21, page = 1 } = args;
        // 1. Get the total count
    const totalPosts = await prisma.post.count(); // Assuming 300
    // 3. Calculate a random skip offset
    // Ensure the skip offset doesn't exceed the total count minus the batch size
    const maxSkip = totalPosts - limit;
    const skipAmount = Math.floor(Math.random() * maxSkip);
   
    const feedPosts = await prisma.post.findMany({
      where: {
        id: { in : recs},
        status: PostStatus.PUBLISHED,
        OR: [{ kind: "ROOT" }, { kind: "REPOST" }, { kind: "QUOTE" }],
        disinterest: { none: { userId: user.id } }, // exclude not interested posts
        user: {
          NOT: [
            { blockedUsers: { some: { blockedId: user.id } } },
            { blockedBy: { some: { blockerId: user.id } } },
            { mutedUsers: { some: { mutedId: user.id } } },
            { mutedBy: { some: { muterId: user.id } } },
          ],
        },
      },
      // skip: (page - 1) * limit,
      // skip: skipAmount,
      // take: limit,
      include: {
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
          where: { userId: user.id },
          select: { id: true, userId: true },
        },
        highlights: {
          where: { userId: user.id },
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
                followerId: user.id,
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
                followingId: user.id,
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
                    followerId: user.id,
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
                    followingId: user.id,
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
                    followerId: user.id,
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
                    followingId: user.id,
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
                    userId: user.id,
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
                    userId: user.id,
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
              where: { userId: user.id },
              select: { id: true, userId: true },
            },
            highlights: {
              where: { userId: user.id },
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
                    followerId: user.id,
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
                    followingId: user.id,
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
                        followerId: user.id,
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
                        followingId: user.id,
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
                        followerId: user.id,
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
                        followingId: user.id,
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
                        userId: user.id,
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
                        userId: user.id,
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
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            bookmarks: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            parent: {
              include: {
                media: true,
                replyContinents: true,
                replyCountries: true,
                pins: {
                  where: { userId: user.id },
                  select: { id: true, userId: true },
                },
                highlights: {
                  where: { userId: user.id },
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
                        followerId: user.id,
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
                        followingId: user.id,
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
                            followerId: user.id,
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
                            followingId: user.id,
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
                            followerId: user.id,
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
                            followingId: user.id,
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
                            userId: user.id,
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
                            userId: user.id,
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
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                bookmarks: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
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
            userId: user.id, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
        bookmarks: {
          where: {
            userId: user.id, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    // Step 2: Fetch all reposts by the current user for these posts
    const postIds = feedPosts.map((post) => post.id); // Collect all post IDs

    const userReposts = await prisma.post.findMany({
      where: {
        userId: user.id, // Current user's posts
        kind: PostKindEnum.REPOST, // Only reposts
        OR: [
          { parentId: { in: postIds } }, // User reposted the post itself
          { id: { in: postIds } }, // The post itself is the user's repost (child repost)
        ],
      },
      select: {
        id: true, // User's repost (child repost)
        parentId: true, // Get only parent post IDs (original posts the user reposted)
      },
    });
    // Step 3: Attach repost status to feed posts
    const data = feedPosts.map((post) => ({
      ...post,
      reposts: userReposts.filter((repost) => repost.parentId === post.id),
      parent: post.parent
        ? {
            ...post.parent,
            reposts: userReposts.filter(
              (repost) => repost.parentId === post?.parentId
            ),
          }
        : post.parent,
      // Check if this post was reposted by the user
    }));

    // convert all bigint to js convertible number
    // const convertedPosts = serializeBigInts(data)

    const _posts = data
      ?.map(transformPrismaTagMentions)
      .map((p) => transformPost(p, user));

    const idToIndexMap: Record<string, number> = {};
    recs.forEach((id, index) => {
      idToIndexMap[id] = index;
    });

  // --- Step 3: Sort the fetched posts based on the index map ---
  const reorderedPosts = _posts.sort((a, b) => {
    const indexA = idToIndexMap[a.id];
    const indexB = idToIndexMap[b.id];

    // Handle cases where a post ID from the database might be missing 
    // in the map (though rare if IDsInOrder came directly from the map source)
    if (indexA === undefined || indexB === undefined) {
      // Should not happen if data integrity is maintained, 
      // but safe practice might be to handle missing IDs last.
      return 0; 
    }

    return indexA - indexB; // Ascending sort based on rank (lower index = higher rank)
  });

    return {
      data: reorderedPosts.length > 0 ? reorderedPosts : "Not found",
      status: reorderedPosts.length > 0 ? 200 : 404,
    };
  } catch (error: any) {
    console.log(error?.message);
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
  }
};

export const getPostTagUsersOrMentions = async (
  userId: string,
  args: {
    limit: number;
    page: number;
    query?: string;
    id: string;
    type?: string;
  }
) => {
  try {
    if (args.query === PostTagMention.TAG_USERS) {
      return await getPostTagUsers(args, userId);
    }
    if (args.query === PostTagMention.MENTIONS) {
      return await getPostMentionUsers(args, userId);
    }
    return { data: "Invalid query provided, try again", status: 400 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getPostTagUsers = async (
  {
    id,
    limit = 50,
    page = 1,
  }: {
    id?: string;
    limit?: number;
    page?: number;
  },
  userId?: string
) => {
  const skip = (page - 1) * limit;
  try {
    const result = await prisma.postUserTag.findMany({
      where: {
        postId: id,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            bio: true,
            meta: true,
            role: true,
            userType: true,
            accountVerified: true,
            createdAt: true,
            metadata: true,
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
              },
            },

            // 1. is follower following current user?
            following: {
              where: { followingId: userId },
              select: { id: true, status: true },
            },
            // 2. is current user following follower?
            followers: {
              where: { followerId: userId },
              select: { id: true, status: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
    });

    if (result.length === 0) {
      return { status: 404, data: "not found" };
    }
    // compose result
    const data = result
      .map((t) => ({
        ...t.user,
        followerCount: t.user._count.followers,
        followingCount: t.user._count.following,
      }))
      .map((u) => ({
        ...composePostAuthor(u),
      }));
    return { status: 200, data };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getPostMentionUsers = async (
  {
    id,
    limit = 50,
    page = 1,
  }: {
    id?: string;
    limit?: number;
    page?: number;
  },
  userId?: string
) => {
  const skip = (page - 1) * limit;
  try {
    const result = await prisma.postMention.findMany({
      where: {
        postId: id,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            bio: true,
            meta: true,
            role: true,
            userType: true,
            accountVerified: true,
            createdAt: true,
            metadata: true,
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
              },
            },

            // 1. is follower following current user?
            following: {
              where: { followingId: userId },
              select: { id: true, status: true },
            },
            // 2. is current user following follower?
            followers: {
              where: { followerId: userId },
              select: { id: true, status: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
    });

    if (result.length === 0) {
      return { status: 404, data: "not found" };
    }
    // compose result
    const data = result
      .map((t) => ({
        ...t.user,
        followerCount: t.user._count.followers,
        followingCount: t.user._count.following,
      }))
      .map((u) => ({
        ...composePostAuthor(u),
      }));
    return { status: 200, data };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getEmbedPost = async (postId: string, userId?: string) => {
  try {
    // get some post replies of the current post
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        status: PostStatus.PUBLISHED,
      },
      include: {
        media: true,
        root: {
          select: {
            id: true,
            scope: true,
            userId: true,
            rootId: true,
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
            accountVerified: true,
            followers: {
              where: {
                followerId: userId,
              },
              select: { id: true, followerId: true, followingId: true },
            },
            following: {
              where: {
                followingId: userId,
              },
              select: { id: true, followerId: true, followingId: true },
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
                username: true,
                avatar: true,
                name: true,
                isVerified: true,
                accountVerified: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
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
                username: true,
                avatar: true,
                name: true,
                isVerified: true,
                accountVerified: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
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
                    userId,
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
            userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
        bookmarks: {
          where: {
            userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
      },
    });

    const data = transformPost(post);

    return { data, status: 200 };
  } catch (error) {
    return {
      data: "Error occurred trying to get post, please try again",
      status: 500,
    };
  }
};

export const getPostReplies = async (
  args: {
    postId: string;
    userId?: string;
    page?: number;
    limit?: number;
    hidden?: boolean;
  },
  user?: AuthUser
) => {
  try {
    const post = await prisma.post.findUniqueOrThrow({
      where: { id: args.postId },
      include: { root: true },
    });

    let userCanReply = false;
    if (
      post.scope === PostScopeEnum.FOLLOWED &&
      post?.root?.userId !== args.userId
    ) {
      // check if the post author is following the current user
      const result2 = await prisma.follow.findFirst({
        where: {
          followerId: post?.root?.userId,
          followingId: args.userId,
          status: FollowStatus.ACCEPTED,
        },
      });
      userCanReply = !!result2;
    }

    const result = await fetchFeedPostReplies(args);

    const transformed = result.map((p) =>
      transformPost({ ...p, replies: [] }, user)
    );

    return {
      data: transformed,
      status: 200,
    };
  } catch (error: any) {
    return {
      data: "Error occurred trying to get post replies, please try again",
      status: 500,
    };
  }
};

export const getPostQuotes = async (
  {
    postId,
    limit = 20,
    page = 1,
  }: { postId: string; page?: number; limit?: number },
  user: AuthUser
) => {
  const userId = user.id;
  const skip = (page - 1) * limit;
  try {
    // get some post replies of the current post
    const result = await prisma.post.findMany({
      where: {
        parentId: postId,
        kind: PostKindEnum.QUOTE,
        status: PostStatus.PUBLISHED,
      },
      skip,
      take: limit,
      orderBy: [{ createdAt: "desc" }],
      include: {
        media: true,
        root: {
          select: {
            id: true,
            scope: true,
            userId: true,
            rootId: true,
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
            accountVerified: true,
            status: true,
            metadata: true,
            createdAt: true,
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
                    followerId: user.id,
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
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
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
                    followerId: user.id,
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
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
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
                    userId,
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
            media: true,
            root: {
              select: {
                id: true,
                scope: true,
                userId: true,
                rootId: true,
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
                status: true,
                metadata: true,
                createdAt: true,
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
                        followerId: user.id,
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
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
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
                        followerId: user.id,
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
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
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
                        userId,
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
                        userId,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
          },
        },
        likes: {
          where: {
            userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
        bookmarks: {
          where: {
            userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
      },
    });

    if (result.length > 0) {
      // Step 1:  loop through the replies to check the current user reposted any
      const postIds = result.map((post) => post.id); // Collect all post IDs
      const userReposts = await prisma.post.findMany({
        where: {
          userId, // Current user's posts
          kind: PostKindEnum.REPOST, // Only reposts
          OR: [
            { parentId: { in: postIds } }, // User reposted the post itself
            { id: { in: postIds } }, // The post itself is the user's repost (child repost)
          ],
        },
        select: {
          id: true, // User's repost (child repost)
          parentId: true, // Get only parent post IDs (original posts the user reposted)
          userId: true,
        },
      });
      // Step 3: Attach repost status to replies posts
      const posts = result.map((post) => ({
        ...post,
        reposts: userReposts.filter((r) => r.parentId === post.id),
        ...transformPrismaTagMentions(post),
      }));
      const data = posts.map((p) => transformPost(p, user));
      return { data, status: 200 };
    }
    // const data = result.map(p => transformPost(p, false, user))
    return { data: "Not found", status: 404 };
  } catch (error: any) {
    return {
      data: "Error trying to process request, please try again",
      status: 500,
    };
  }
};

export const getPostReposters = async (
  {
    postId,
    limit,
    page,
  }: {
    postId: string;
    limit: number;
    page: number;
  },
  user: SessionUser
) => {
  try {
    const result = await prisma.post.findMany({
      where: {
        kind: PostKindEnum.REPOST,
        status: PostStatus.PUBLISHED,
        parentId: postId,
      },
      take: limit,
      skip: (page - 1) * limit,
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
            status: true,
            metadata: true,
            createdAt: true,
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
                followerId: user.id,
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
                followingId: user.id,
              },
              select: {
                id: true,
                followerId: true,
                followingId: true,
                status: true,
              },
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
      orderBy: [{ createdAt: "desc" }],
    });

    const reposters = result?.map((r) =>
      composePostAuthor({
        ...r.user,
        followerCount: r.user._count.followers,
        followingCount: r.user._count.following,
      })
    );

    return {
      data: reposters.length > 0 ? reposters : "Not found",
      status: reposters.length > 0 ? 200 : 404,
    };
  } catch (error: any) {
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
  }
};

export const getPostFeedDetails = async (postId: string, user?: AuthUser) => {
  try {
    const userId = user?.id;
    // get post details and parentChain if any
    // const result2 = await getPostParentChain(postId, userId!);
    const result = await fetchPostAncestry(postId, userId);

    if (!result) return { data: "not found", status: 404 };

    // get feed post thread

    const thread = await getFeedPostThread(postId, userId);

    // get feed post replies
    const replies = await fetchFeedPostReplies({ postId, userId });
    // check if the current user is following author

    const data = transformPost(
      {
        ...result,
        thread,
        replies,
      },
      user
    );

    return {
      data,
      status: 200,
    };
  } catch (error: any) {
    console.log(error?.message);
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
  }
};

const getFeedPostThread = async (postId: string, userId?: string) => {
  try {
    let thread = await prisma.post.findMany({
      where: {
        parentId: postId,
        kind: PostKindEnum.THREAD,
        status: PostStatus.PUBLISHED,
      },
      orderBy: [{ createdAt: "asc" }],
      include: {
        media: true,
        replyContinents: true,
        replyCountries: true,
        _count: { select: { replies: { where: { isHidden: true } } } },
        pins: { where: { userId }, select: { id: true, userId: true } },
        highlights: { where: { userId }, select: { id: true, userId: true } },
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
            status: true,
            metadata: true,
            createdAt: true,
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
                    userId,
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
                    userId,
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
            media: true,
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
            pins: { where: { userId }, select: { id: true, userId: true } },
            highlights: {
              where: { userId },
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
                status: true,
                metadata: true,
                createdAt: true,
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
                        userId,
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
                        userId,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
          },
        },
        likes: {
          where: {
            userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
        bookmarks: {
          where: {
            userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
      },
    });
    // if (!result) return { data: "Post not found", status: 404 };
    // loop through the thread and check if the current user has reposted any of them
    if (thread.length > 0) {
      // Step 1: Check for repost by the current user for each thread
      const postIds = thread.map((post) => post.id); // Collect all post IDs
      const userReposts = await prisma.post.findMany({
        where: {
          userId, // Current user's posts
          kind: PostKindEnum.REPOST, // Only reposts
          OR: [
            { parentId: { in: postIds } }, // User reposted the post itself
            { id: { in: postIds } }, // The post itself is the user's repost (child repost)
          ],
        },
        select: {
          id: true, // User's repost (child repost)
          parentId: true, // Get only parent post IDs (original posts the user reposted)
        },
      });
      // );
      // Step 2: Attach repost status to replies posts
      return thread?.map(transformPrismaTagMentions).map((post) => ({
        ...post,
        reposts: userReposts.filter((r) => r.parentId === post.id),
        parent: post.parent
          ? {
              ...post.parent,
              reposts: userReposts.filter(
                (r) => r.parentId === post?.parent?.id
              ),
            }
          : post.parent,
      }));
    }
    return thread;
  } catch (error) {
    throw error;
  }
};

export const fetchFeedPostReplies = async ({
  userId,
  postId,
  limit = 20,
  page = 1,
  hidden = false,
}: {
  postId: string;
  userId?: string;
  page?: number;
  limit?: number;
  hidden?: boolean;
}) => {
  const skip = (page - 1) * limit;
  try {
    // get some post replies of the current post
    let replies = await prisma.post.findMany({
      where: {
        parentId: postId,
        kind: PostKindEnum.REPLY,
        status: PostStatus.PUBLISHED,
        // isHidden: hidden,
        ...(hidden
          ? {
              isHidden: hidden,
              OR: [
                { status: PostStatus.DELETED },
                { totalReplies: { gte: 1 } },
              ],
            }
          : { isHidden: hidden }),
      },
      skip,
      take: limit,
      orderBy: [{ createdAt: "desc" }],
      include: {
        media: true,
        _count: { select: { replies: { where: { isHidden: true } } } },
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
        pins: { where: { userId }, select: { id: true, userId: true } },
        highlights: { where: { userId }, select: { id: true, userId: true } },
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
            accountVerified: true,
            status: true,
            metadata: true,
            createdAt: true,
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
                    userId,
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
            media: true,
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
            pins: { where: { userId }, select: { id: true, userId: true } },
            highlights: {
              where: { userId },
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
                status: true,
                metadata: true,
                createdAt: true,
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
                        userId,
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
                        userId,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
          },
        },
        likes: {
          where: {
            userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
        bookmarks: {
          where: {
            userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
      },
    });

    if (replies.length > 0) {
      // Step 1:  loop through the replies to check the current user reposted any
      const postIds = replies.map((post) => post.id); // Collect all post IDs
      const userReposts = await prisma.post.findMany({
        where: {
          userId, // Current user's posts
          kind: PostKindEnum.REPOST, // Only reposts
          OR: [
            { parentId: { in: postIds } }, // User reposted the post itself
            { id: { in: postIds } }, // The post itself is the user's repost (child repost)
          ],
        },
        select: {
          id: true, // User's repost (child repost)
          parentId: true, // Get only parent post IDs (original posts the user reposted)
          userId: true,
        },
      });

      // Step 3: Attach repost status to replies posts
      return replies?.map(transformPrismaTagMentions).map((post) => ({
        ...post,
        reposts: userReposts.filter((r) => r.parentId === post.id),
      }));
    }
    return replies;
  } catch (error: any) {
    console.log(error?.message);
    throw error;
  }
};

export const getPostAnalytics = async (
  postId: string,
  user: AuthUser,
  args: { duration: string }
) => {
  const userId = user.id;
  try {
    const startDate = getAnalyticsDuration(args.duration);
    const rangeLengthMs = Date.now() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - rangeLengthMs);

    const [
      currentPostImpressions,
      prevPostImpressions,

      currentPostLikes,
      prevPostLikes,

      currentPostQuotes,
      prevPostQuotes,

      currentPostReplies,
      prevPostReplies,

      currentPostReposts,
      prevPostReposts,

      currentPostViews,
      prevPostViews,

      currentPostShares,
      prevPostShares,

      currentPostBookmarks,
      prevPostBookmarks,

      currentPostTips,
      prevPostTips,

      currentPostFollows,
      prevPostFollows,

      currentPostProfileVisits,
      prevPostProfileVisits,

      currentPostClicks,
      prevPostClicks,

      currentPostDisinterest,
      prevPostDisinterest,

      currentPostReports,
      prevPostReports,

      currentPostMediaClicks,
      prevPostMediaClicks,

      // currentProfileVisits,
      // prevProfileVisits,

      currentPostMediaStats,
      prevPostMediaStats,
    ] = await Promise.all([
      // current post impression
      prisma.postImpression.count({
        where: { postId, post: { userId }, createdAt: { gte: startDate } },
      }),
      // previous post impression
      prisma.postImpression.count({
        where: {
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post likes
      prisma.likedPost.count({
        where: { postId, post: { userId }, createdAt: { gte: startDate } },
      }),
      // previous post likes
      prisma.likedPost.count({
        where: {
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post quotes
      prisma.post.count({
        where: {
          id: postId,
          kind: PostKindEnum.QUOTE,
          status: PostStatus.PUBLISHED,
          parent: { userId },
          createdAt: { gte: startDate },
        },
      }),
      // previous post quotes
      prisma.post.count({
        where: {
          id: postId,
          kind: PostKindEnum.QUOTE,
          status: PostStatus.PUBLISHED,
          parent: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post replies
      prisma.post.count({
        where: {
          id: postId,
          kind: PostKindEnum.REPLY,
          status: PostStatus.PUBLISHED,
          parent: { userId },
          createdAt: { gte: startDate },
        },
      }),
      // previous post replies
      prisma.post.count({
        where: {
          id: postId,
          kind: PostKindEnum.REPLY,
          status: PostStatus.PUBLISHED,
          parent: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post reposts
      prisma.post.count({
        where: {
          id: postId,
          kind: PostKindEnum.REPOST,
          status: PostStatus.PUBLISHED,
          parent: { userId },
          createdAt: { gte: startDate },
        },
      }),
      // previous post reposts
      prisma.post.count({
        where: {
          id: postId,
          kind: PostKindEnum.REPOST,
          status: PostStatus.PUBLISHED,
          parent: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post views
      prisma.postView.count({
        where: { postId, post: { userId }, createdAt: { gte: startDate } },
      }),
      // previous post views
      prisma.postView.count({
        where: {
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post shares
      prisma.postShare.count({
        where: { postId, post: { userId }, createdAt: { gte: startDate } },
      }),
      // previous post shares
      prisma.postShare.count({
        where: {
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post bookmarks
      prisma.bookmark.count({
        where: { postId, post: { userId }, createdAt: { gte: startDate } },
      }),
      // previous post bookmarks
      prisma.bookmark.count({
        where: {
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post tips
      prisma.postTip.count({
        where: { postId, post: { userId }, createdAt: { gte: startDate } },
      }),
      // previous post tips
      prisma.postTip.count({
        where: {
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post follows
      prisma.postClick.count({
        where: {
          action: PostMetricAction.FOLLOW,
          postId,
          post: { userId },
          createdAt: { gte: startDate },
        },
      }),
      // previous post follows
      prisma.postClick.count({
        where: {
          action: PostMetricAction.FOLLOW,
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post profile visit
      prisma.postClick.count({
        where: {
          action: PostMetricAction.PROFILE,
          postId,
          post: { userId },
          createdAt: { gte: startDate },
        },
      }),
      // previous post profile visit
      prisma.postClick.count({
        where: {
          action: PostMetricAction.PROFILE,
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post interactions
      prisma.postClick.count({
        where: { postId, post: { userId }, createdAt: { gte: startDate } },
      }),
      // previous post interactions
      prisma.postClick.count({
        where: {
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post not interested
      prisma.postDisinterest.count({
        where: { postId, post: { userId }, createdAt: { gte: startDate } },
      }),
      // previous post not interested
      prisma.postDisinterest.count({
        where: {
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post reports
      prisma.postReport.count({
        where: { postId, post: { userId }, createdAt: { gte: startDate } },
      }),
      // previous post reports
      prisma.postReport.count({
        where: {
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // current post media interaction
      prisma.postMediaLog.count({
        where: { postId, post: { userId }, createdAt: { gte: startDate } },
      }),
      // previous post media interaction
      prisma.postMediaLog.count({
        where: {
          postId,
          post: { userId },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
      }),
      // // current post profile visits
      // prisma.profileVisit.count({
      //   where: { userId, postId, createdAt: { gte: startDate } },
      // }),
      // // previous post profile visits
      // prisma.profileVisit.count({
      //   where: {
      //     userId,
      //     postId,
      //     createdAt: { gte: prevStartDate, lt: startDate },
      //   },
      // }),
      // current user post media stats
      prisma.postMedia.aggregate({
        _sum: {
          totalDownloads: true,
          totalViews: true,
        },
        where: {
          createdAt: { gte: startDate },
          postId,
          post: {
            userId,
          },
        },
      }),
      // prev user post media stats
      prisma.postMedia.aggregate({
        _sum: {
          totalDownloads: true,
          totalViews: true,
        },
        where: {
          createdAt: { gte: prevStartDate, lt: startDate },
          postId,
          post: {
            userId,
          },
        },
      }),
    ]);

    // calculate engagement on post level
    const calcEngagement = () => {
      // current
      const currSum =
        currentPostLikes +
        currentPostQuotes +
        currentPostReplies +
        currentPostReposts +
        currentPostViews +
        currentPostShares +
        currentPostBookmarks +
        currentPostTips +
        currentPostClicks +
        currentPostMediaClicks;

      // engagement rate on post level
      const currImpressions = Number(currentPostImpressions);
      const currRate =
        currSum > 0 && currImpressions > 0
          ? Number(((currSum / currImpressions) * 100).toFixed(2))
          : 0;
      // previous
      const prevSum =
        prevPostLikes +
        prevPostQuotes +
        prevPostReplies +
        prevPostReposts +
        prevPostViews +
        prevPostShares +
        prevPostBookmarks +
        prevPostTips +
        prevPostClicks +
        currentPostMediaClicks;
      // engagement rate on post level
      const prevImpressions = Number(prevPostImpressions);
      const prevRate =
        prevSum > 0 && prevImpressions > 0
          ? Number(((prevSum / prevImpressions) * 100).toFixed(2))
          : 0;

      return { currRate, prevRate };
    };

    const engageStats = calcEngagement();

    const analytics = [
      {
        title: "Engagement Rate",
        value: engageStats.currRate,
        change: analyticsPercentageChange(
          engageStats.currRate,
          engageStats.prevRate
        ),
      },
      {
        title: "Post Impressions",
        value: currentPostImpressions,
        change: analyticsPercentageChange(
          currentPostImpressions,
          prevPostImpressions
        ),
      },
      {
        title: "Post Likes",
        value: currentPostLikes,
        change: analyticsPercentageChange(currentPostLikes, prevPostLikes),
      },

      {
        title: "Post Quotes",
        value: currentPostQuotes,
        change: analyticsPercentageChange(currentPostQuotes, prevPostQuotes),
      },

      {
        title: "Post Replies",
        value: currentPostReplies,
        change: analyticsPercentageChange(currentPostReplies, prevPostReplies),
      },

      {
        title: "Post Reposts",
        value: currentPostReplies,
        change: analyticsPercentageChange(currentPostReposts, prevPostReposts),
      },

      {
        title: "Post Views",
        value: currentPostViews,
        change: analyticsPercentageChange(currentPostViews, prevPostViews),
      },

      {
        title: "Post Shares",
        value: currentPostShares,
        change: analyticsPercentageChange(currentPostShares, prevPostShares),
      },

      {
        title: "Post Bookmarks",
        value: currentPostBookmarks,
        change: analyticsPercentageChange(
          currentPostBookmarks,
          prevPostBookmarks
        ),
      },

      {
        title: "Post Clicks",
        value: currentPostClicks,
        change: analyticsPercentageChange(currentPostClicks, prevPostClicks),
      },

      {
        title: "Post Media Clicks",
        value: currentPostMediaClicks,
        change: analyticsPercentageChange(
          currentPostMediaClicks,
          prevPostMediaClicks
        ),
      },

      {
        title: "Post Follows",
        value: currentPostFollows,
        change: analyticsPercentageChange(currentPostFollows, prevPostFollows),
      },

      {
        title: "Post Tips",
        value: currentPostTips,
        change: analyticsPercentageChange(currentPostTips, prevPostTips),
      },

      {
        title: "Post Profile Visits",
        value: currentPostProfileVisits,
        change: analyticsPercentageChange(
          currentPostProfileVisits,
          prevPostProfileVisits
        ),
      },

      // {
      //   title: "Post Profile Visits 2",
      //   value: currentProfileVisits,
      //   change: analyticsPercentageChange(
      //     currentProfileVisits,
      //     prevProfileVisits
      //   ),
      // },

      {
        title: "Post Reports",
        value: currentPostReports,
        change: analyticsPercentageChange(currentPostReports, prevPostReports),
      },

      {
        title: "Post Disinterest",
        value: currentPostDisinterest,
        change: analyticsPercentageChange(
          currentPostDisinterest,
          prevPostDisinterest
        ),
      },

      {
        title: "Media Views",
        value: Number(currentPostMediaStats._sum.totalViews),
        change: analyticsPercentageChange(
          Number(currentPostMediaStats._sum.totalViews),
          Number(prevPostMediaStats._sum.totalViews)
        ),
      },

      {
        title: "Media Downloads",
        value: Number(currentPostMediaStats._sum.totalDownloads),
        change: analyticsPercentageChange(
          Number(currentPostMediaStats._sum.totalDownloads),
          Number(prevPostMediaStats._sum.totalDownloads)
        ),
      },

      // {
      //   title: "Follows",
      //   value: currentFollow._count.followerId,
      //   change: analyticsPercentageChange(
      //     currentFollow._count.followerId,
      //     prevFollow._count.followerId
      //   ),
      // },

      // {
      //   title: "Unfollows",
      //   value: currentUnfollow._count.followerId,
      //   change: analyticsPercentageChange(
      //     currentUnfollow._count.followerId,
      //     prevUnfollow._count.followerId
      //   ),
      // },

      // {
      //   title: "Blockers",
      //   value: currentBlockers._count.blockerId,
      //   change: analyticsPercentageChange(
      //     currentBlockers._count.blockerId,
      //     prevBlockers._count.blockerId
      //   ),
      // },

      // {
      //   title: "Muters",
      //   value: currentMuters._count.muterId,
      //   change: analyticsPercentageChange(
      //     currentMuters._count.muterId,
      //     prevMuters._count.muterId
      //   ),
      // },

      // {
      //   title: "Reporters",
      //   value: currentReporters._count.reporterId,
      //   change: analyticsPercentageChange(
      //     currentReporters._count.reporterId,
      //     prevReporters._count.reporterId
      //   ),
      // },
    ];
    return {
      data: analytics,
      status: 200,
    };
  } catch (error: any) {
    console.log(error?.message);
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const updatePostReactions = async (postId: string, user: AuthUser) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // check if post exists
      let result2 = await tx.likedPost.findUnique({
        where: {
          userId_postId: { userId: user.id, postId }, // Composite unique constraint
        },
        include: { post: { select: { id: true, userId: true, kind: true } } },
      });
      let liked = false;
      if (result2) {
        // Unlike (delete the like)
        result2 = await tx.likedPost.delete({
          where: { id: result2.id },
          include: { post: { select: { id: true, userId: true, kind: true } } },
        });
        await tx.post.update({
          where: { id: postId },
          data: { totalLikes: { decrement: 1 } },
        });
      } else {
        // Like (create new like)
        result2 = await tx.likedPost.create({
          data: { userId: user.id, postId },
          include: { post: { select: { id: true, userId: true, kind: true } } },
        });
        await tx.post.update({
          where: { id: postId },
          data: { totalLikes: { increment: 1 } },
        });
        liked = true;
      }
      const { post, ...rest } = result2;
      if (liked && result2.post.userId !== user.id) {
        // check if there is similar notif
        const kind =
          result2.post.kind === PostKindEnum.REPLY ? "comment" : "post";
        // check if there is similar notif
        const check = await tx.notification.findFirst({
          where: {
            senderId: user.id,
            recipientId: post.userId,
            postId: post.id,
            type: NotifTypeEnum.POST,
            action: NotifAction.LIKE,
          },
        });
        if (!check) {
          // insert notification
          await tx.notification.create({
            data: {
              senderId: user.id,
              recipientId: post.userId,
              postId: post.id,
              type: NotifTypeEnum.POST,
              action: NotifAction.LIKE,
              message: `${user.name} reacted to your ${kind}`,
              title: "New post reaction",
            },
          });
        }
      }
      return { data: rest, liked };
    });
    return { data: result, status: 200 };
  } catch (error) {
    return {
      data: "Error occurred reacting to post, please try again",
      status: 500,
    };
  }
};

export const updatePostBookmarks = async (postId: string, userId: string) => {
  try {
    const data = await prisma.$transaction(async (tx) => {
      const result = await tx.bookmark.findUnique({
        where: {
          userId_postId: { userId, postId }, // Composite unique constraint
        },
      });

      if (result) {
        // Unlike (delete the like)
        const data = await tx.bookmark.delete({
          where: { id: result.id },
        });
        await tx.post.update({
          where: { id: postId },
          data: { totalBookmarks: { decrement: 1 } },
        });
        return { isBookmarked: false, data };
      } else {
        // Like (create new like)
        const data = await tx.bookmark.create({
          data: { userId, postId },
        });
        await tx.post.update({
          where: { id: postId },
          data: { totalBookmarks: { increment: 1 } },
        });
        return { isBookmarked: true, data };
      }
    });
    return { data, status: 200 };
  } catch (error) {
    return {
      data: "Error occurred updating post bookmarks, please try again",
      status: 500,
    };
  }
};

export const createAndUpdatePostShares = async (body: {
  device: DetectResult;
  meta: LookupResult | null;
  postId: string;
  userId: string;
  sessionId: string | null | undefined;
  timestamp: string;
  referer?: string | null;
}) => {
  try {
    await prisma.$transaction([
      prisma.post.update({
        where: { id: body.postId },
        data: { totalShares: { increment: 1 } },
      }),
      prisma.postShare.create({ data: body }),
    ]);
    return { data: { id: body.postId, userId: body.userId }, status: 200 };
  } catch (error) {
    return {
      data: "Error occurred updating post shares, please try again",
      status: 500,
    };
  }
};

export const updateReposts = async (postId: string, user: AuthUser) => {
  try {
    const data = await prisma.$transaction(async (tx) => {
      let isReposted = false;
      let post = await tx.post.findFirst({
        where: {
          parentId: postId,
          kind: PostKindEnum.REPOST,
          userId: user.id,
        },
        include: {
          parent: {
            select: { id: true, kind: true, userId: true, parentId: true },
          },
        },
      });

      if (post) {
        // delete the repost
        post = await tx.post.delete({
          where: { id: post.id },
          include: {
            parent: {
              select: { id: true, kind: true, userId: true, parentId: true },
            },
          },
        });
        await tx.post.update({
          where: { id: postId },
          data: { totalReposts: { decrement: 1 } },
        });
      } else {
        const _post = await tx.post.findUniqueOrThrow({
          where: { id: postId },
        });
        // repost (create new repost)
        post = await tx.post.create({
          data: {
            kind: PostKindEnum.REPOST,
            type: _post.type,
            userId: user.id,
            parentId: postId, // Links to the original post
            rootId: _post.rootId || _post.id,
          },
          include: {
            parent: {
              select: { id: true, kind: true, userId: true, parentId: true },
            },
          },
        });
        // Increase repost count for the original post
        await tx.post.update({
          where: { id: postId },
          data: { totalReposts: { increment: 1 } },
        });
        isReposted = true;
      }
      if (isReposted && post?.parent?.userId !== user.id) {
        // check if there is similar notif
        const check = await tx.notification.findFirst({
          where: {
            senderId: user.id,
            recipientId: post?.parent?.userId,
            postId: post?.parentId,
            type: NotifTypeEnum.POST,
            action: NotifAction.REPOST,
          },
        });
        if (!check) {
          // insert notification
          const kind =
            post?.parent?.kind === PostKindEnum.REPLY ? "comment" : "post";
          await tx.notification.create({
            data: {
              senderId: user.id,
              recipientId: post?.parent?.userId,
              postId: post.parentId,
              type: NotifTypeEnum.POST,
              action: NotifAction.REPOST,
              message: `${user.name} reposted your ${kind}`,
              title: "New post repost",
            },
          });
        }
      }
      return { isReposted, data: serializeBigInts(post) };
    });
    return { data, status: 200 };
  } catch (error: any) {
    return { data: "Error occurred reposting, please try again", status: 500 };
  }
};

export const deletePost = async (postId: string, user: SessionUser) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // check post ownership
      const check = await tx.post.findUniqueOrThrow({
        where: { id: postId },
        include: { user: { select: { id: true, role: true } } },
      });
      if (
        check?.user?.role === UserRoleEnum.USER &&
        check.user.id !== user.id
      ) {
        throw new Error("Invalid permission");
      }
      const post = await tx.post.update({
        where: { id: postId },
        data: { deletedAt: new Date(), status: PostStatus.DELETED },
      });
      // decrease counters for the original post
      await updateParentCounter(tx, post, "decrement");
      // save history record
      await tx.postHistory.create({
        data: { postId, userId: user.id, action: PostAction.DELETE },
      });
      return post;
    });
    return {
      data: {
        id: result.id,
        userId: user.id,
        deletedAt: result.deletedAt,
        status: result.status,
      },
      status: 200,
    };
  } catch (error) {
    return { data: "Error occurred reposting, please try again", status: 500 };
  }
};

export const restorePost = async (postId: string, user: SessionUser) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // check post ownership
      const check = await tx.post.findUniqueOrThrow({
        where: { id: postId },
        include: { user: { select: { id: true, role: true } } },
      });
      if (
        check?.user?.role === UserRoleEnum.USER &&
        check.user.id !== user.id
      ) {
        throw new Error("Invalid permission");
      }
      const post = await tx.post.update({
        where: { id: postId },
        data: { deletedAt: null, status: PostStatus.PUBLISHED },
      });
      // increase counters for the original post
      await updateParentCounter(tx, post, "increment");
      // save history record
      await tx.postHistory.create({
        data: { postId, userId: user.id, action: PostAction.RESTORE },
      });
      return post;
    });
    return {
      data: {
        id: result.id,
        userId: user.id,
        deletedAt: result.deletedAt,
        status: result.status,
      },
      status: 200,
    };
  } catch (error) {
    return { data: "Error occurred reposting, please try again", status: 500 };
  }
};

export const hidePostReply = async (postId: string, user: SessionUser) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // check post ownership
      const check = await tx.post.findUniqueOrThrow({
        where: { id: postId },
        include: {
          user: { select: { id: true, role: true } },
          root: { select: { id: true, userId: true } },
        },
      });
      const isPostAuthor = check?.root
        ? check?.root?.userId === user.id
        : check?.userId === user?.id;
      const isHidden = !check.isHidden;
      if (check?.user?.role === UserRoleEnum.USER && !isPostAuthor) {
        throw new Error("Invalid permission");
      }
      const post = await tx.post.update({
        where: { id: postId },
        data: { isHidden },
      });
      // save history record
      await tx.postHistory.create({
        data: {
          postId,
          userId: user.id,
          action: isHidden ? PostAction.HIDDEN : PostAction.UNHIDDEN,
        },
      });
      return { id: post.id, isHidden };
    });
    return {
      data: { id: result.id, userId: user.id, hidden: result.isHidden },
      status: 200,
    };
  } catch (error: any) {
    logger.error(error.message);
    return {
      data: "Error occurred processing request, please try again",
      status: 500,
    };
  }
};

async function updateParentCounter(
  tx: Prisma.TransactionClient,
  post: Post,
  direction: "increment" | "decrement"
) {
  const counters = {
    [PostKindEnum.QUOTE]: "totalQuotes",
    [PostKindEnum.REPOST]: "totalReposts",
    [PostKindEnum.REPLY]: "totalReplies",
  } as const;

  const counterField = counters[post.kind as keyof typeof counters];

  if (!counterField || !post.parentId) return;

  await tx.post.update({
    where: { id: post.parentId },
    data: {
      [counterField]: { [direction]: 1 },
    },
  });
}

export const votePollPost = async (
  postId: string,
  optionId: string,
  userId: string
) => {
  try {
    const data = await prisma.post.update({
      where: {
        id: postId,
      },
      data: {
        poll: {
          update: {
            options: {
              update: {
                where: { id: optionId },
                data: {
                  votes: { increment: 1 },
                  voters: { create: { userId } },
                },
              },
            },
          },
        },
      },
    });
    return {
      data: JSON.parse(
        JSON.stringify(data, (_, value) =>
          typeof value === "bigint" ? Number(value) : value
        )
      ),
      status: 200,
    };
  } catch (error: any) {
    return { data: "Error occurred reposting, please try again", status: 500 };
  }
};

export const voteQuizPost = async (
  postId: string,
  optionId: string,
  userId: string
) => {
  try {
    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: { quiz: { include: { options: true } } },
    });
    const quiz = post.quiz;
    if (!quiz) return { data: "Quiz not found", status: 404 };
    const option = quiz.options.find((o) => o.id === optionId);
    if (!option) return { data: "Option not found", status: 404 };
    const data = await prisma.post.update({
      where: {
        id: postId,
      },
      data: {
        quiz: {
          update: {
            options: {
              update: {
                where: { id: optionId },
                data: {
                  votes: { increment: 1 },
                  participants: {
                    create: {
                      userId,
                      quizId: option.quizId,
                      isCorrect: option.isCorrect,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    logger.info("Post quiz option voted ");
    return {
      data: JSON.parse(
        JSON.stringify(data, (_, value) =>
          typeof value === "bigint" ? Number(value) : value
        )
      ),
      status: 200,
    };
  } catch (error: any) {
    logger.error("Voting option error ", error?.message);
    return { data: "Error occurred reposting, please try again", status: 500 };
  }
};

const triggerPushNotification = async (userId: string, message: string) => {
  try {
    const subs = await prisma.pushNotification.findMany({ where: { userId } });
    if (subs.length === 0) {
      logger.info("User is not subscribed to push notifications");
      return;
    }
    const payload = JSON.stringify({
      title: "🔔 New Message",
      body: message || "Hello from torazon!",
    });
    const result = await Promise.all(
      subs.map((sub) => webpush.sendNotification(sub.config as any, payload))
    );
    logger.warn(result);
    logger.info("Web push notifications sent");
  } catch (error: any) {
    logger.warn(`error sending web push notification ${error.message}`);
    logger.error(error);
  }
};

const getExpiryDate = (duration: {
  days: number;
  hours: number;
  minutes: number;
}): Date => {
  const now = new Date(); // Get current date & time
  now.setDate(now.getDate() + duration.days); // Add days
  now.setHours(now.getHours() + duration.hours); // Add hours
  now.setMinutes(now.getMinutes() + duration.minutes); // Add minutes
  return now;
};

const getSinglePost = async (postId: string, userId?: string) => {
  try {
    // get some post replies of the current post
    const post = await prisma.post.findUnique({
      where: {
        id: postId,
        status: PostStatus.PUBLISHED,
      },
      include: {
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
        _count: { select: { replies: { where: { isHidden: true } } } },
        pins: { where: { userId }, select: { id: true, userId: true } },
        highlights: { where: { userId }, select: { id: true, userId: true } },
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
            status: true,
            metadata: true,
            createdAt: true,
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
                    userId,
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
            userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
        bookmarks: {
          where: {
            userId, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
      },
    });

    if (post) {
      // check if the current user reposted this post
      const repost = await prisma.post.findFirst({
        where: {
          userId, // Current user's posts
          kind: PostKindEnum.REPOST, // Only reposts
          parentId: post.id,
        },
        select: {
          id: true, // User's repost (child repost)
          parentId: true, // Get only parent post IDs (original posts the user reposted)
        },
      });
      return {
        ...transformPrismaTagMentions(post),
        reposts: repost ? [repost] : [],
      };
    }
    return post;
  } catch (error) {
    throw error;
  }
};

export async function fetchPostAncestry(postId: string, userId?: string) {
  const post = await getSinglePost(postId, userId);

  if (!post) return null;

  const parentChain: any[] = [];

  // QUOTE → fetch only the immediate parent
  if (post.kind === PostKindEnum.QUOTE && post.parentId) {
    const parent = await getSinglePost(post.parentId, userId);
    return {
      ...post,
      parent,
      parentChain: [],
    };
  }

  // For other kinds, fetch full ancestry
  let currentParentId = post.parentId;

  while (currentParentId) {
    const parent = await getSinglePost(currentParentId, userId);
    if (!parent) break;

    if (parent.kind === PostKindEnum.QUOTE) {
      const innerParent = parent.parentId
        ? await getSinglePost(parent.parentId, userId)
        : null;

      parentChain.unshift({
        ...parent,
        parent: innerParent,
      });
      break; // Stop at first QUOTE
    }

    parentChain.unshift(parent);
    currentParentId = parent.parentId;
  }

  return {
    ...post,
    parentChain,
  };
}

// partial raw sql query of getting post ancestry
export async function getPostParentChain(postId: string, userId: string) {
  const kindResult = await prisma.post.findUnique({
    where: { id: postId },
    select: { kind: true },
  });

  const isQuote = kindResult?.kind === "QUOTE";

  const posts = isQuote
    ? await prisma.$queryRaw`
      WITH root_post AS (
        SELECT * FROM "Post" WHERE id = ${postId}
      ),
      parent_post AS (
        SELECT * FROM "Post" WHERE id = (SELECT "parentId" FROM root_post)
      ),
      combined AS (
        SELECT * FROM root_post
        UNION ALL
        SELECT * FROM parent_post
      )
      SELECT 
        p.*,
        jsonb_build_object(
          'id', u.id,
          'name', u.name,
          'username', u.username,
          'email', u.email,
          'avatar', u.avatar,
          'meta', u.meta,
          'bio', u.bio,
          'role', u.role,
          'userType', u."userType",
          'accountVerified', u."accountVerified",
          'country', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          ) END,
          'subscriptions', COALESCE((
            SELECT jsonb_agg(to_jsonb(s))
            FROM "Subscription" s
            WHERE s."userId" = u.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
          ), '[]'::jsonb),
          'following', COALESCE((
            SELECT jsonb_agg(to_jsonb(f))
            FROM "Follow" f
            WHERE f."followerId" = ${userId} AND f."followingId" = u.id
          ), '[]'::jsonb),
          'followers', COALESCE((
            SELECT jsonb_agg(to_jsonb(f))
            FROM "Follow" f
            WHERE f."followingId" = ${userId} AND f."followerId" = u.id
          ), '[]'::jsonb)
        ) AS user,
        EXISTS (
          SELECT 1 FROM "LikedPost" l
          WHERE l."userId" = ${userId} AND l."postId" = p.id
        ) AS "hasLiked",
        EXISTS (
          SELECT 1 FROM "Bookmark" b
          WHERE b."userId" = ${userId} AND b."postId" = p.id
        ) AS "hasSaved",
        EXISTS (
          SELECT 1 FROM "Post" r
          WHERE r."kind" = 'REPOST' AND r."userId" = ${userId} AND r."parentId" = p.id
        ) AS "hasReposted",
        COALESCE((
          SELECT jsonb_agg(to_jsonb(m)) FROM "PostMedia" m WHERE m."postId" = p.id
        ), '[]'::jsonb) AS media,
        (
          SELECT jsonb_build_object(
            'id', poll.id,
            'scope', poll."scope",
            'expireAt', poll."expireAt",
            'isMultiVote', poll."isMultiVote",
            'createdAt', poll."createdAt",
            'updatedAt', poll."updatedAt",
            'options', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', po.id,
                  'text', po.text,
                  'voters', COALESCE((
                    SELECT jsonb_agg(to_jsonb(v))
                    FROM "PollVoter" v
                    WHERE v."optionId" = po.id AND v."userId" = ${userId}
                  ), '[]'::jsonb)
                )
              ) FROM "PollOption" po WHERE po."pollId" = poll.id
            ), '[]'::jsonb),
            'countries', COALESCE((
              SELECT jsonb_agg(to_jsonb(pc)) FROM "PollCountry" pc WHERE pc."pollId" = poll.id
            ), '[]'::jsonb),
            'continents', COALESCE((
              SELECT jsonb_agg(to_jsonb(pc)) FROM "PollContinent" pc WHERE pc."pollId" = poll.id
            ), '[]'::jsonb)
          ) FROM "Poll" poll WHERE poll."postId" = p.id
        ) AS poll,
        (
          SELECT jsonb_build_object(
            'id', quiz.id,
            'scope', quiz."scope",
            'expireAt', quiz."expireAt",
            'rewardAmount', quiz."rewardAmount",
            'maxWinners', quiz."maxWinners",
            'createdAt', quiz."createdAt",
            'updatedAt', quiz."updatedAt",
            'options', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', qo.id,
                  'text', qo.text,
                  'votes', qo.votes,
                  'quizId', qo."quizId",
                  'isCorrect', qo."isCorrect",
                  'participants', COALESCE((
                    SELECT jsonb_agg(to_jsonb(qp))
                    FROM "QuizParticipant" qp
                    WHERE qo.id = qp."optionId" AND qp."userId" = ${userId}
                  ), '[]'::jsonb)
                )
              ) FROM "QuizOption" qo WHERE qo."quizId" = quiz.id
            ), '[]'::jsonb),
            'countries', COALESCE((
              SELECT jsonb_agg(to_jsonb(qc))
              FROM "QuizCountry" qc
              WHERE qc."quizId" = quiz.id
            ), '[]'::jsonb),
            'continents', COALESCE((
              SELECT jsonb_agg(to_jsonb(qt))
              FROM "QuizContinent" qt
              WHERE qt."quizId" = quiz.id
            ), '[]'::jsonb)
          ) FROM "Quiz" quiz WHERE quiz."postId" = p.id
        ) AS quiz,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
              'id', mu.id,
              'name', mu.name,
              'username', mu.username,
              'avatar', mu.avatar,
              'meta', mu.meta,
              'bio', mu.bio,
              'role', mu.role,
              'userType', mu."userType",
              'accountVerified', mu."accountVerified",
              'subscriptions', COALESCE((
                SELECT jsonb_agg(to_jsonb(s))
                FROM "Subscription" s
                WHERE s."userId" = mu.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
              ), '[]'::jsonb)
            ))
          FROM "PostMention" pm
          JOIN "User" mu ON mu.id = pm."userId"
          WHERE pm."postId" = p.id
        ), '[]'::jsonb) AS mentions,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
              'id', tu.id,
              'name', tu.name,
              'username', tu.username,
              'avatar', tu.avatar,
              'meta', tu.meta,
              'bio', tu.bio,
              'role', tu.role,
              'userType', tu."userType",
              'accountVerified', tu."accountVerified",
              'subscriptions', COALESCE((
                SELECT jsonb_agg(to_jsonb(s))
                FROM "Subscription" s
                WHERE s."userId" = tu.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
              ), '[]'::jsonb)
          ))
          FROM "PostUserTag" pt
          JOIN "User" tu ON tu.id = pt."userId"
          WHERE pt."postId" = p.id
        ), '[]'::jsonb) AS tagUsers
      FROM combined p
      JOIN "User" u ON u.id = p."userId"
      LEFT JOIN "Country" c ON u."countryId" = c.id
      ORDER BY p."createdAt";
    `
    : await prisma.$queryRaw`WITH RECURSIVE parent_chain AS (
  SELECT * FROM "Post" WHERE id = (SELECT "parentId" FROM "Post" WHERE id = ${postId})
  UNION ALL
  SELECT p.* FROM "Post" p
  INNER JOIN parent_chain pc ON pc."parentId" = p.id
),
root_post AS (
  SELECT * FROM "Post" WHERE id = ${postId}
),
combined AS (
  SELECT * FROM root_post
  UNION ALL
  SELECT * FROM parent_chain
)
SELECT 
  p.*,
  jsonb_build_object(
    'id', u.id,
    'name', u.name,
    'username', u.username,
    'email', u.email,
    'avatar', u.avatar,
    'accountVerified', u."accountVerified",
    'meta', u.meta,
    'bio', u.bio,
    'role', u.role,
    'userType', u."userType",
    'country', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'iso2', c.iso2,
      'iso3', c.iso3,
      'emoji', c.emoji,
      'continentId', c."continentId"
    ) END,
    'subscriptions', COALESCE((
      SELECT jsonb_agg(to_jsonb(s))
      FROM "Subscription" s
      WHERE s."userId" = u.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
    ), '[]'::jsonb),
    'following', COALESCE((
      SELECT jsonb_agg(to_jsonb(f))
      FROM "Follow" f
      WHERE f."followerId" = ${userId} AND f."followingId" = u.id
    ), '[]'::jsonb),
    'followers', COALESCE((
      SELECT jsonb_agg(to_jsonb(f))
      FROM "Follow" f
      WHERE f."followingId" = ${userId} AND f."followerId" = u.id
    ), '[]'::jsonb)
  ) AS user,
  EXISTS (
    SELECT 1 FROM "LikedPost" l
    WHERE l."userId" = ${userId} AND l."postId" = p.id
  ) AS "hasLiked",
  EXISTS (
    SELECT 1 FROM "Bookmark" b
    WHERE b."userId" = ${userId} AND b."postId" = p.id
  ) AS "hasSaved",
  EXISTS (
    SELECT 1 FROM "Post" r
    WHERE r."kind" = 'REPOST' AND r."userId" = ${userId} AND r."parentId" = p.id
  ) AS "hasReposted",
  COALESCE((
    SELECT jsonb_agg(to_jsonb(m)) FROM "PostMedia" m WHERE m."postId" = p.id
  ), '[]'::jsonb) AS media,
  (
    SELECT jsonb_build_object(
      'id', poll.id,
      'scope', poll."scope",
      'expireAt', poll."expireAt",
      'isMultiVote', poll."isMultiVote",
      'createdAt', poll."createdAt",
      'updatedAt', poll."updatedAt",
      'options', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', po.id,
            'text', po.text,
            'voters', COALESCE((
              SELECT jsonb_agg(to_jsonb(v))
              FROM "PollVoter" v
              WHERE v."optionId" = po.id AND v."userId" = ${userId}
            ), '[]'::jsonb)
          )
        ) FROM "PollOption" po WHERE po."pollId" = poll.id
      ), '[]'::jsonb),
      'countries', COALESCE((
        SELECT jsonb_agg(to_jsonb(pc)) FROM "PollCountry" pc WHERE pc."pollId" = poll.id
      ), '[]'::jsonb),
      'continents', COALESCE((
        SELECT jsonb_agg(to_jsonb(pc)) FROM "PollContinent" pc WHERE pc."pollId" = poll.id
      ), '[]'::jsonb)
    ) FROM "Poll" poll WHERE poll."postId" = p.id
  ) AS poll,
  (
    SELECT jsonb_build_object(
      'id', quiz.id,
      'scope', quiz."scope",
      'expireAt', quiz."expireAt",
      'rewardAmount', quiz."rewardAmount",
      'maxWinners', quiz."maxWinners",
      'createdAt', quiz."createdAt",
      'updatedAt', quiz."updatedAt",
      'options', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', qo.id,
            'text', qo.text,
            'votes', qo.votes,
            'quizId', qo."quizId",
            'isCorrect', qo."isCorrect",
            'participants', COALESCE((
              SELECT jsonb_agg(to_jsonb(qp))
              FROM "QuizParticipant" qp
              WHERE qo.id = qp."optionId" AND qp."userId" = ${userId}
            ), '[]'::jsonb)
          )
        ) FROM "QuizOption" qo WHERE qo."quizId" = quiz.id
      ), '[]'::jsonb),
      'countries', COALESCE((
        SELECT jsonb_agg(to_jsonb(qc))
        FROM "QuizCountry" qc
        WHERE qc."quizId" = quiz.id
      ), '[]'::jsonb),
      'continents', COALESCE((
        SELECT jsonb_agg(to_jsonb(qt))
        FROM "QuizContinent" qt
        WHERE qt."quizId" = quiz.id
      ), '[]'::jsonb)
    ) FROM "Quiz" quiz WHERE quiz."postId" = p.id
  ) AS quiz,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', mu.id,
        'name', mu.name,
        'username', mu.username,
        'avatar', mu.avatar,
        'meta', mu.meta,
        'bio', mu.bio,
        'role', mu.role,
        'userType', mu."userType",
        'accountVerified', mu."accountVerified",
        'subscriptions', COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = mu.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb)
    ))
    FROM "PostMention" pm
    JOIN "User" mu ON mu.id = pm."userId"
    WHERE pm."postId" = p.id
  ), '[]'::jsonb) AS mentions,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', tu.id,
        'name', tu.name,
        'username', tu.username,
        'avatar', tu.avatar,
        'meta', tu.meta,
        'bio', tu.bio,
        'role', tu.role,
        'userType', tu."userType",
        'accountVerified', tu."accountVerified",
        'subscriptions', COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = tu.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb)
    ))
    FROM "PostUserTag" pt
    JOIN "User" tu ON tu.id = pt."userId"
    WHERE pt."postId" = p.id
  ), '[]'::jsonb) AS tagUsers
FROM combined p
JOIN "User" u ON u.id = p."userId"
LEFT JOIN "Country" c ON u."countryId" = c.id
ORDER BY p."createdAt"`;

  function nestPosts(posts: any) {
    const map = new Map();
    const parentChain = [];
    const rootRaw = posts.find((p: any) => p.id === postId);
    const rootPost = serializeBigInts(rootRaw);

    for (const post of posts) {
      const converted = serializeBigInts(post);
      map.set(converted.id, converted);
    }

    let current = rootPost;
    while (current?.parentId && map.has(current.parentId)) {
      current = map.get(current.parentId);
      parentChain.unshift(current);
    }

    return {
      parentChain,
      post: rootPost,
    };
  }

  return nestPosts(posts) as { post: FeedPost; parentChain: FeedPost[] };
}

export const retriveUserRecommendationModelData = async (userId: string) => {
  try {
    // Get current date and date 30 days ago
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        likedPosts: {
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
          select: {
            postId: true,
            userId: true,
            createdAt: true,
            post: {
              select: {
                content: true,
                createdAt: true,
                hashTags: { select: { tag: { select: { name: true } } } },
              },
            },
          },
        },

        bookmarks: {
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
          select: {
            postId: true,
            userId: true,
            createdAt: true,
            post: {
              select: {
                content: true,
                createdAt: true,
                hashTags: { select: { tag: { select: { name: true } } } },
              },
            },
          },
        },
        postVotes: {
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
          select: {
            userId: true,
            createdAt: true,
            option: {
              include: {
                poll: {
                  select: {
                    postId: true,
                    post: {
                      select: {
                        content: true,
                        createdAt: true,
                        hashTags: {
                          select: { tag: { select: { name: true } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          distinct: ["optionId"],
        },
        participants: {
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
          select: {
            userId: true,
            createdAt: true,
            option: {
              include: {
                quiz: {
                  select: {
                    postId: true,
                    post: {
                      select: {
                        content: true,
                        createdAt: true,
                        hashTags: {
                          select: { tag: { select: { name: true } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          distinct: ["quizId"],
        },
        posts: {
          where: {
            createdAt: { gte: thirtyDaysAgo },
            status: PostStatus.PUBLISHED,
            OR: [
              { kind: PostKindEnum.REPLY },
              { kind: PostKindEnum.QUOTE },
              { kind: PostKindEnum.REPOST },
            ],
          },
          select: {
            id: true,
            userId: true,
            parentId: true,
            rootId: true,
            createdAt: true,
            content: true,
            kind: true,
            hashTags: { select: { tag: { select: { name: true } } } },
            parent: {
              select: {
                id: true,
                userId: true,
                parentId: true,
                rootId: true,
                createdAt: true,
                content: true,
                kind: true,
                hashTags: { select: { tag: { select: { name: true } } } },
              },
            },
          },
        },
        viewPosts: {
          where: {
            timestamp: { gte: thirtyDaysAgo },
          },
          orderBy: [{ duration: "desc" }],
          select: {
            postId: true,
            userId: true,
            timestamp: true,
            duration: true,
            post: {
              select: {
                content: true,
                createdAt: true,
                hashTags: { select: { tag: { select: { name: true } } } },
              },
            },
          },
          distinct: ["postId"],
        },
        clickPosts: {
          where: {
            timestamp: { gte: thirtyDaysAgo },
          },
          orderBy: [{ timestamp: "desc" }],
          select: {
            postId: true,
            userId: true,
            timestamp: true,
            post: {
              select: {
                content: true,
                createdAt: true,
                hashTags: { select: { tag: { select: { name: true } } } },
              },
            },
          },
          distinct: ["postId"],
        },
        // postMentions: {
        //   where: {
        //     createdAt: { gte: thirtyDaysAgo },
        //   },
        //   select: {
        //     postId: true,
        //     userId: true,
        //     createdAt: true,
        //     post: {
        //       select: {
        //         content: true,
        //         createdAt: true,
        //         hashTags: { select: { tag: { select: { name: true } } } },
        //       },
        //     },
        //   },
        //   distinct: ["postId"],
        // },
        // postUserTags: {
        //   where: {
        //     createdAt: { gte: thirtyDaysAgo },
        //   },
        //   select: {
        //     postId: true,
        //     userId: true,
        //     createdAt: true,
        //     post: {
        //       select: {
        //         content: true,
        //         createdAt: true,
        //         hashTags: { select: { tag: { select: { name: true } } } },
        //       },
        //     },
        //   },
        //   distinct: ["postId"],
        // },
      },
    });
    const {
      likedPosts,
      bookmarks,
      postVotes,
      participants,
      posts,
      viewPosts,
      clickPosts,
      // postMentions,
      // postUserTags,
    } = result;
    // Process each interaction type & Structure the Data:
    const WEIGHTS = {
      // Highest-intent interactions
      reply: 1.0,
      quote: 1.0,

      // Strong signals of preference or endorsement
      bookmark: 0.95,
      repost: 0.95,

      // Expressive but lower-effort actions
      like: 0.85,

      // Participation-based actions
      poll: 0.8,
      quiz: 0.8,

      // View = user read (high quality but passive)
      view: 0.8,

      // Click = intent to explore (not always full consumption)
      click: 0.75,
    };
    const interactions: {
      user_id: string;
      type:
        | "click"
        | "view"
        | "like"
        | "bookmark"
        | "poll_vote"
        | "quiz_vote"
        | "reply"
        | "quote"
        | "repost";
      timestamp: Date;
      weight: number;
      post: {
        id: string;
        content: string | null;
        tags: string[];
        createdAt: string | Date;
      };
    }[] = [];
    // 1. Likes
    likedPosts.forEach((item) => {
      interactions.push({
        user_id: item.userId,
        type: "like",
        timestamp: item.createdAt,
        weight: WEIGHTS.like,
        post: {
          id: item.postId,
          content: item.post.content,
          tags: item.post.hashTags.map((tag) => tag.tag.name),
          createdAt: item.post.createdAt,
        },
      });
    });

    // 2. Bookmarks
    bookmarks.forEach((item) => {
      interactions.push({
        user_id: item.userId,
        type: "bookmark",
        timestamp: item.createdAt,
        weight: WEIGHTS.bookmark,
        post: {
          id: item.postId,
          content: item.post.content,
          tags: item.post.hashTags.map((tag) => tag.tag.name),

          createdAt: item.post.createdAt,
        },
      });
    });

    // 3. Poll Votes
    postVotes.forEach((item) => {
      interactions.push({
        user_id: item.userId,
        type: "poll_vote",
        timestamp: item.createdAt,
        weight: WEIGHTS.poll,
        post: {
          id: item.option.poll.postId,
          content: item.option.poll.post.content,
          tags: item.option.poll.post.hashTags.map((tag) => tag.tag.name),

          createdAt: item.option.poll.post.createdAt,
        },
      });
    });

    // 4. Quiz Votes
    participants.forEach((item) => {
      interactions.push({
        user_id: item.userId,
        type: "quiz_vote",
        timestamp: item.createdAt,
        weight: WEIGHTS.quiz,
        post: {
          id: item.option.quiz.postId,
          content: item.option.quiz.post.content,
          tags: item.option.quiz.post.hashTags.map((tag) => tag.tag.name),

          createdAt: item.option.quiz.post.createdAt,
        },
      });
    });

    // 5. Replies
    posts.forEach((item) => {
      const parentPostId = item.parentId || item.rootId;
      if (parentPostId && item.parent) {
        interactions.push({
          user_id: item.userId,
          type:
            item.kind === PostKindEnum.QUOTE
              ? "quote"
              : item.kind === PostKindEnum.REPOST
              ? "repost"
              : "reply",
          timestamp: item.createdAt,
          weight:
            item.kind === PostKindEnum.QUOTE
              ? WEIGHTS.quote
              : item.kind === PostKindEnum.REPOST
              ? WEIGHTS.repost
              : WEIGHTS.reply,
          post: {
            id: parentPostId,
            content: item?.parent?.content,
            tags: item?.parent?.hashTags.map((tag) => tag.tag.name) ?? [],
            createdAt: item?.parent?.createdAt,
          },
        });
      }
    });

    // 6. Views

    viewPosts.forEach((item) => {
      const MAX_VIEW_DURATION = 120; // 2 minutes (in seconds)
      const duration = item.duration || 0;

      // Calculate duration multiplier (0-1 scale)
      const durationMultiplier = Math.min(duration / MAX_VIEW_DURATION, 1);

      // Apply scaling to base view weight
      const weight = Number((WEIGHTS.view * durationMultiplier).toFixed(2));
      interactions.push({
        user_id: item.userId!,
        type: "view",
        timestamp: item.timestamp,
        weight,
        post: {
          id: item.postId,
          content: item.post.content,
          tags: item.post.hashTags.map((tag) => tag.tag.name),

          createdAt: item.post.createdAt,
        },
      });
    });

    // 7. Clicks
    clickPosts.forEach((item) => {
      interactions.push({
        user_id: item.userId!,
        type: "click",
        timestamp: item.timestamp,
        weight: WEIGHTS.click,
        post: {
          id: item.postId,
          content: item.post.content,
          tags: item.post.hashTags.map((tag) => tag.tag.name),

          createdAt: item.post.createdAt,
        },
      });
    });

    // // 8. Mentions & Tags
    // postMentions.forEach((item) => {
    //   interactions.push({
    //     user_id: item.userId,
    //     type: "mention",
    //     timestamp: item.createdAt,
    //     weight: WEIGHTS.mention,
    //     post: {
    //       id: item.postId,
    //       content: item.post.content,
    //       tags: item.post.hashTags.map((tag) => tag.tag.name),

    //       createdAt: item.post.createdAt,
    //     },
    //   });
    // });
    // postUserTags.forEach((item) => {
    //   interactions.push({
    //     user_id: item.userId,
    //     type: "tag",
    //     timestamp: item.createdAt,
    //     weight: WEIGHTS.tag,
    //     post: {
    //       id: item.postId,
    //       content: item.post.content,
    //       tags: item.post.hashTags.map((tag) => tag.tag.name),
    //       createdAt: item.post.createdAt,
    //     },
    //   });
    // });
    // console.log(interactions);
    return { data: { user_id: userId, interactions }, status: 200 };
  } catch (error) {
    logger.error(error);
    return { data: "Sorry an error occurred", status: 500 };
  }
};

const convertPostContentToEmbedding = async () => {
  try {
    

    const posts = await prisma.post.findMany({
      where: { content: { not: null } },
    });

    const item = posts[0];

    const text = cleanTextContent(item.content);

    const contentEmbedding = await generateEmbedding(text);

    // console.log(contentEmbedding);


  //   if(posts.length > 0){
  //     const filterPosts = await Promise.all(posts.map(async(item) => {

  //        const text = cleanText(item.content)

  //       const contentEmbedding = await generateEmbedding(text)

  //       prisma.post.update({
  //         where: { id: item.id },
  //         data: { contentEmbedding }
  //       })

  //       return { id: item.id, textEmbedding: contentEmbedding }
  //     })
  //   )
  // }
  } catch (error) {}
};

// convertPostContentToEmbedding()


export const getRecommendedPosts = async(userId: string, recs: string[]) => {
  try {
    const result = await prisma.post.findMany({where: { id: { in: recs}}, select: {id: true, content: true, userId: true, createdAt: true}})
    // --- Step 2: Create a mapping from Post ID to its desired index/rank ---
  // This allows for O(1) lookup during the sorting process.
  const idToIndexMap: Record<string, number> = {};
  recs.forEach((id, index) => {
    idToIndexMap[id] = index;
  });

  // --- Step 3: Sort the fetched posts based on the index map ---
  const reorderedPosts = result.sort((a, b) => {
    const indexA = idToIndexMap[a.id];
    const indexB = idToIndexMap[b.id];

    // Handle cases where a post ID from the database might be missing 
    // in the map (though rare if IDsInOrder came directly from the map source)
    if (indexA === undefined || indexB === undefined) {
      // Should not happen if data integrity is maintained, 
      // but safe practice might be to handle missing IDs last.
      return 0; 
    }

    return indexA - indexB; // Ascending sort based on rank (lower index = higher rank)
  });
    return { data: reorderedPosts, status: 200}
  } catch (error) {
    return { data: "Error getting posts ", status: 500}
  }
}

const BATCH_SIZE = 100; // reduced for debugging
const EMBED_BATCH_SIZE = 10;

interface InteractionRow {
  user_id: string;
  post_id: string;
  author_id: string;
  type: string;
  weight: number;
  label: number;
  timestamp: string;
  post_content: string;
  post_created_at: string;
  post_age_hours: number;
  post_created_hour: number;
  post_day_of_week: number;
  interaction_count: number;
  total_duration_seconds?: number;
}

async function fetchPaginated<T>(
  queryFn: (params: { skip: number; take: number }) => Promise<T[]>
): Promise<T[]> {
  const results: T[] = [];
  let skip = 0;
  while (true) {
    const batch = await queryFn({ skip, take: BATCH_SIZE });
    if (batch.length === 0) break;
    results.push(...batch);
    skip += batch.length;
    logger.info(`Fetched ${skip} rows from this source`);
  }
  return results;
}

async function getLastSyncTime(): Promise<Date> {
  try {
    const result = await clickHouseClient.query({
      query: `SELECT * FROM sync_timestamp WHERE kind = 'interactions'`,
      format: "JSONEachRow",
    });
    const rows = await result.json<{ sync_at: string }>();
    const ts = rows[0]?.sync_at;
    if (ts && ts !== "1970-01-01T00:00:00.000Z") {
      return new Date(ts);
    }
  } catch (err) {
    logger.warn(
      "sync_timestamp table missing or empty — starting from 7 days ago"
    );
  }
  // TEMP: Force recent data for testing
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

async function upsertSyncTimestamp(kind: string) {
  const exists = await clickHouseClient
    .query({
      query: `SELECT 1 FROM sync_timestamp WHERE kind = {kind: String} LIMIT 1`,
      query_params: { kind },
    })
    .then((res) => res.json())
    .then((data) => data.data.length > 0);

  if (exists) {
    await clickHouseClient.command({
      query: `ALTER TABLE sync_timestamp UPDATE sync_at = now64(3) WHERE kind = {kind: String}`,
      query_params: { kind },
    });
  } else {
    await clickHouseClient.command({
      query: `INSERT INTO sync_timestamp (kind, sync_at) VALUES ({kind: String}, now64(3))`,
      query_params: { kind },
    });
  }
}

async function syncUsersInteractionsToClickHouse() {
  try {
    logger.info("=== STARTING INTERACTIONS SYNC ===");

    const LAST_SYNC = await getLastSyncTime();
    logger.info(`Looking for interactions since: ${LAST_SYNC.toISOString()}`);

    const allInteractions: InteractionRow[] = [];

    // Helper — clean and safe
    const addInteraction = (
      userId: string,
      postId: string,
      authorId: string,
      type: string,
      weight: number,
      timestamp: Date,
      postContent: string,
      postCreatedAt: Date
    ) => {
      allInteractions.push({
        user_id: userId,
        post_id: postId,
        author_id: authorId,
        type,
        weight,
        label: weight >= 0.5 ? 1 : 0,
        timestamp: timestamp.toISOString(),
        post_content: cleanTextContent(postContent),
        post_created_at: postCreatedAt.toISOString(),
        post_age_hours: Number(((Date.now() - postCreatedAt.getTime()) / 3600000).toFixed(2)),
        post_created_hour: postCreatedAt.getHours(),
        post_day_of_week: postCreatedAt.getDay(),
        interaction_count: 0,
      });
    };

    // === 1. Strong positives (money & virality first) ===
    logger.info("1. Fetching money & viral signals...");

    // Tips — money = king
    const tips = await fetchPaginated(({ skip, take }) => prisma.postTip.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { senderId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true } } },
    }));
    for (const t of tips) if (t.post?.content) addInteraction(t.senderId, t.postId!, t.post.userId!, "tip", 13.5, t.createdAt, t.post.content, t.post.createdAt);

    // Shares
    const shares = await fetchPaginated(({ skip, take }) => prisma.postShare.findMany({
      where: { createdAt: { gte: LAST_SYNC }, userId: { not: null } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true } } },
    }));
    for (const s of shares) if (s.post?.content) addInteraction(s.userId!, s.postId!, s.post.userId!, "share", 6.5, s.createdAt, s.post.content, s.post.createdAt);

    // Bookmarks
    const bookmarks = await fetchPaginated(({ skip, take }) => prisma.bookmark.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true } } },
    }));
    for (const b of bookmarks) if (b.post?.content) addInteraction(b.userId, b.postId, b.post.userId!, "bookmark", 7.0, b.createdAt, b.post.content, b.post.createdAt);

    // Likes
    const likes = await fetchPaginated(({ skip, take }) => prisma.likedPost.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));
    for (const l of likes) if (l.post?.content) addInteraction(l.userId, l.postId, l.post.userId!, "like", 5.5, l.createdAt, l.post.content, l.post.createdAt);

    // Clicks
    const clicks = await fetchPaginated(({ skip, take }) => prisma.postClick.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));
    for (const c of clicks) if (c.post?.content) addInteraction(c.userId!, c.postId!, c.post.userId!, "click", 2.3, c.createdAt, c.post.content, c.post.createdAt);

    // === 2. Replies + Quotes + Reposts (with toxicity-aware reply boost) ===
    logger.info("2. Fetching replies, reposts, quotes + toxicity analysis...");
    const childPosts = await fetchPaginated(({ skip, take }) => prisma.post.findMany({
      where: {
        createdAt: { gte: LAST_SYNC },
        parentId: { not: null },
        kind: { in: [PostKindEnum.REPLY, PostKindEnum.REPOST, PostKindEnum.QUOTE] },
      },
      skip, take,
      orderBy: { createdAt: "asc" },
      select: {
        userId: true,
        parentId: true,
        kind: true,
        content: true,
        createdAt: true,
        parent: { select: { content: true, createdAt: true, userId: true} },
      },
    }));

    logger.info(`→ Found ${childPosts.length} child posts`);

    for (const post of childPosts) {
      if (!post.parent?.content) continue;

      let type: string;
      let weight = 0;

      switch (post.kind) {
        case PostKindEnum.QUOTE:
          type = "quote";
          weight = 9.5;
          break;

        case PostKindEnum.REPOST:
          type = "repost";
          weight = 7.6;
          break;

        case PostKindEnum.REPLY:
          type = "reply";
          weight = 8.5; // base

          const text = cleanTextContent(post.content || "");
          if (text.length >= 5) {
            let toxicityScore = 0.5;
            try {
              const result = await commentClassifier(text);
              toxicityScore = result.score; // 0.0 = clean, 1.0 = very toxic
            } catch (err) {
              logger.warn("Toxicity classifier failed", err);
            }

            const cleanliness = 1.0 - toxicityScore;
            const lengthBonus = Math.min(text.length / 120, 1.0) * 4.0; // max +4.0
            const cleanBonus = cleanliness * 4.0;                     // max +4.0

            weight = 4.0 + lengthBonus + cleanBonus;

            // Strong toxicity → penalty
            if (toxicityScore > 0.7) {
              weight -= (toxicityScore - 0.7) * 30; // max -9.0
            }

            weight = Math.max(-10.0, Math.min(12.0, weight)); // sane caps
          } else {
            weight = 1.5; // "k", "lol"
          }
          break;

        default:
          continue;
      }

      addInteraction(post.userId, post.parentId!, post.parent.userId!, type, weight, post.createdAt, post.parent.content, post.parent.createdAt);
    }

    // Long views
    const longViews = await fetchPaginated(({ skip, take }) => prisma.postView.findMany({
      where: { timestamp: { gte: LAST_SYNC }, duration: { gt: 30 } },
      skip, take,
      select: { userId: true, postId: true, duration: true, timestamp: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));
    for (const v of longViews) {
      if (!v.post?.content) continue;
      const dwellBonus = Math.min(v.duration / 120, 1) * 2.0;
      addInteraction(v.userId!, v.postId, v.post.userId!, "view", 1.5 + dwellBonus, v.timestamp, v.post.content, v.post.createdAt);
    }

    // === 3. Hard negatives ===
    logger.info("3. Fetching hard negatives...");

    const reports = await fetchPaginated(({ skip, take }) => prisma.postReport.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));
    for (const r of reports) if (r.post?.content) addInteraction(r.userId, r.postId!, r.post.userId!, "report", -15.0, r.createdAt, r.post.content, r.post.createdAt);

    const dislikes = await fetchPaginated(({ skip, take }) => prisma.postDisinterest.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));
    for (const d of dislikes) if (d.post?.content) addInteraction(d.userId!, d.postId!, d.post.userId!, "dislike", -8.0, d.createdAt, d.post.content, d.post.createdAt);

    // === 4. Impressions (weak positive) ===
    logger.info("4. Adding impressions...");
    const positiveIds = new Set(allInteractions.map(i => i.post_id));

    const impressions = await fetchPaginated(({ skip, take }) => prisma.postImpression.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));

    let impCount = 0;
    for (const i of impressions) {
      if (positiveIds.has(i.postId)) continue;
      if (!i.post?.content) continue;
      addInteraction(i.userId!, i.postId, i.post.userId!, "impression", 0.1, i.createdAt, i.post.content, i.post.createdAt);
      if (++impCount >= allInteractions.length * 4) break;
    }

    logger.info(`Total raw interactions: ${allInteractions.length}`);

    // === 5. Smart Aggregation (final fix) ===
    const aggregated = new Map<string, InteractionRow>();

    for (const row of allInteractions) {
      const key = `${row.user_id}-${row.post_id}`;
      let e = aggregated.get(key);

      if (!e) {
        e = { ...row, weight: 0, interaction_count: 0 };
        aggregated.set(key, e);
      }

      const w = {
        tip: 13.5, quote: 9.5, repost: 7.6, share: 6.5, bookmark: 7.0,
        reply: row.weight, // already computed with toxicity
        like: 5.5, click: 2.3, view: 3.5, impression: 0.1,
        report: -15, dislike: -8,
      }[row.type] ?? row.weight;

      // --- NEW LOGIC: Negative Weight Precedence ---
      const negativeSignals = ["report", "dislike"];

      if (negativeSignals.includes(row.type)) {
        // If the current interaction is a negative signal,
        // it immediately becomes the new aggregated weight if it's lower (more negative).
        // This takes precedence over all other logic.
        if (w < e.weight) {
             e.weight = w;
        }
      } 
      // --- END NEW LOGIC ---

      // --- ORIGINAL LOGIC (for non-negative signals) ---
      else if (["quote", "repost", "bookmark", "like", "reply", "tip", "share"].includes(row.type)) {
        // One-time/High-value signals: strongest wins
        // This logic is now only applied to positive/neutral one-time signals
        if (w > e.weight) e.weight = w;
      }
      else { 
        // Repeatable/Low-value signals: small boost (view, click, impression)
        // Note: For repeatable signals like 'view', you might want straight summation instead of this min/max logic.
        if (w > e.weight) e.weight = w;
        else e.weight = Math.min(e.weight + w * 0.2, w * 1.5);
      }
      // --- END ORIGINAL LOGIC ---

      e.interaction_count++;
      if (row.timestamp > e.timestamp) e.timestamp = row.timestamp;
    }

    const finalInteractions = Array.from(aggregated.values());
    logger.info(`After aggregation: ${finalInteractions.length} unique user-post pairs`);

    if (finalInteractions.length === 0) {
      await upsertSyncTimestamp("interactions");
      return;
    }

    // === 6. Embedding + Insert (unchanged, but safe) ===
    logger.info("Generating embeddings for each post>>>>>>")
    const slicedArray = finalInteractions.slice(0,100)
    const rowsForInsert = [];
    for (let i = 0; i < slicedArray.length; i += EMBED_BATCH_SIZE) {
      const batch = slicedArray.slice(i, i + EMBED_BATCH_SIZE);
      const embedded = await Promise.all(
        batch.map(async (row) => {
          try {
            const { post_content, ...rest } = row;
            const embedding = await generateEmbedding(post_content);
            return { ...rest, embedding, timestamp: new Date(rest.timestamp), post_created_at: new Date(rest.post_created_at) };
          } catch (e) {
            logger.error(`Embedding failed for post ${row.post_id}`, e);
            return null;
          }
        })
      );
      rowsForInsert.push(...embedded.filter(Boolean));
    }
    logger.info(`Syncing data into clickhouse>>>>>> ${rowsForInsert.length}`)
    // console.log(rowsForInsert[0])
    if (rowsForInsert.length > 0) {
      for (let i = 0; i < rowsForInsert.length; i += 5) {
        await clickHouseClient.insert({
          table: "interactions",
          values: rowsForInsert.slice(i, i + 5),
          format: "JSONEachRow",
        });
      }
      // await upsertSyncTimestamp("interactions");
      logger.info(`SUCCESS: Synced ${rowsForInsert.length} interactions`);
    }
  } catch (error: any) {
    logger.error("Sync failed", error?.message);
    throw error;
  }
}

const getContentTopic = async() => {
  try {
    const labels = [ 'news', 'music', 'business', 'education', 'technology', 'entertainment',  'politics', 'arts & culture', 'inspiration', 'learning', 'gaming',
      'movies', 'comedy', 'lifestyle', 'community', 'shopping', 'sports' ]
    const text = `Your Timeline Is Yours Alone
Maybe you took longer to heal.
Maybe you failed and had to restart.
Maybe you changed your mind.
Maybe life hit you hard and paused everything.
That doesn’t make you broken. That makes you human.
Everyone’s story is uniquely messy, beautiful, unpredictable. That’s what makes it worth telling. The timeline you’re on? It’s not behind. It’s yours.
Own it.`
    console.log("Sending request...")
    const start = performance.now()
    const resp = await axios.post(`http://localhost:8003/classify`, { labels, text })
    const result = resp.data
    const end = performance.now()

    console.log("Performance measure ", ((end - start) / 1000))
    
    console.log("API response ", result)
    
    // const result = await topicClassifier("Hello world this, what will be today's UCL outcome?")
    // console.log(result)
    // const posts = await prisma.post.findMany({})
    // for (let index = 0; index < posts.length; index++) {
    //   const post = posts[index];
    //   const content = cleanTextContent(post.content)
    //   if(content.length > 5){
    //     const result = await contentTopicClassifier(`Lol Naija no dey carry last`)
    //     await prisma.post.update({where: { id: post.id }, data: { topic: result.answer}})
    //   }else{
    //     await prisma.post.update({where: { id: post.id }, data: { topic: "generic"}})
    //   }
    // }
  } catch (error: any) {
    console.log(error?.message)
  }
}

// getContentTopic()

function tokenize(content: string) {
  const text = content.toLowerCase();
  const words = text.match(/[a-z0-9#']+/g) || [];

  const unigrams = words;
  const bigrams = words.slice(0, -1).map((w, i) => `${w} ${words[i + 1]}`);

  const hashtags = words.filter(w => w.startsWith("#"));

  return [...unigrams, ...bigrams, ...hashtags];
}

const text = `Your Timeline Is Yours Alone
Maybe you took longer to heal.
Maybe you failed and had to restart.
Maybe you changed your mind.
Maybe life hit you hard and paused everything.
That doesn’t make you broken. That makes you human.
Everyone’s story is uniquely messy, beautiful, unpredictable. That’s what makes it worth telling. The timeline you’re on? It’s not behind. It’s yours.
Own it. As e dey hot, we hope peter obi becomes the the next president of nigeria`

// console.log(tokenize(text))

// const content = removeStopwords(text.split(" "))

// console.log(content)


const getContentKeywords = async() => {
  try {

  // const text = `Your Timeline Is Yours Alone
  //       Maybe you took longer to heal.
  //       Maybe you failed and had to restart.
  //       Maybe you changed your mind.
  //       Maybe life hit you hard and paused everything.
  //       That doesn’t make you broken. That makes you human.
  //       Everyone’s story is uniquely messy, beautiful, unpredictable. That’s what makes it worth telling. The timeline you’re on? It’s not behind. It’s yours.
  //       Own it.`
  const text = `Music has no borders, and artists like Davido, Eminem, and Nicki Minaj prove that impact isn’t limited by geography or genre. Davido represents the global rise of Afrobeats, blending African rhythm with mainstream appeal. Eminem remains one of the most technically gifted lyricists in hip-hop history, known for raw storytelling and unmatched wordplay. Nicki Minaj stands as a cultural icon, reshaping female rap with versatility, confidence, and chart-dominating records.Despite coming from different worlds, all three artists share one thing in common: influence. Their music travels across continents, shapes pop culture, and inspires millions of fans worldwide. #Davido #Wizkid #Eminem @codesermon`

  const cleaned = cleanTextContentWithHashtag(text)

  console.log(cleaned)

    console.log("Sending request...")
    // const start = performance.now()
    // const resp = await axios.post(`http://localhost:8003/keywords`, { text })
    // const result = resp.data
    // const end = performance.now()

    // console.log("Performance measure ", ((end - start) / 1000))
    
    // console.log("API response ", result)
    
  } catch (error: any) {
    console.log(error?.message)
  }
}


getContentKeywords()






// generator client {
//   provider        = "prisma-client-js"
//   previewFeatures = ["fullTextSearchPostgres", "postgresqlExtensions"]
// }

// generator json {
//   provider = "prisma-json-types-generator"
// }

// datasource db {
//   provider   = "postgresql"
//   url        = env("DATABASE_URL")
//   extensions = [vector]
// }

// model User {
//   id                    String             @id @default(cuid())
//   name                  String
//   username              String             @unique
//   email                 String             @unique
//   avatar                String?
//   password              String?
//   phone                 String?
//   telId                 String?
//   countryId             String?
//   role                  UserRoleEnum       @default(USER)
//   status                UserStatus         @default(ACTIVE)
//   userType              UserTypeEnum       @default(PERSONAL)
//   isVerified            Boolean            @default(false)
//   identityVerified      Boolean            @default(false)
//   accountVerified       Boolean            @default(false)
//   accountVerifiedAt     DateTime?
//   identityVerifiedAt    DateTime?
//   verifiedAt            DateTime?
//   /// [UserMeta]
//   meta                  Json?              @default("{\"type\": \"LEGACY\", \"color\": \"blue\", \"status\": \"INACTIVE\"}")
//   metadata              Json[]             @default([])
//   createdAt             DateTime           @default(now())
//   updatedAt             DateTime           @updatedAt
//   bio                   String?
//   deactivatedAt         DateTime?
//   deletedAt             DateTime?
//   isPrivate             Boolean            @default(false)
//   blockerHistory        BlockHistory[]     @relation("HistoryBlocked")
//   blockedHistory        BlockHistory[]     @relation("HistoryBlocker")
//   blockedBy             BlockUser[]        @relation("Blocked")
//   blockedUsers          BlockUser[]        @relation("Blocker")
//   bookmarks             Bookmark[]
//   creatorCoinPackages   CoinPackage[]
//   convoDevices          ConvoDevice[]
//   convoMemberships      ConvoMembership?
//   convoMessages         ConvoMessage[]
//   cryptoAddreses        CryptoAddress[]
//   following             Follow[]           @relation("Follower")
//   followers             Follow[]           @relation("Following")
//   followingHistory      FollowHistory[]    @relation("HistoryFollower")
//   followerHistory       FollowHistory[]    @relation("HistoryFollowing")
//   creatorGames          Game[]
//   gameAchievements      GameAchievement[]
//   creatorCategories     GameCategory[]
//   gameEnergies          GameEnergy[]
//   creatorGameMilestones GameMilestone[]
//   gameMonthStats        GameMonthStat[]
//   creatorGameRooms      GameRoom[]
//   gameYearStats         GameYearStat[]
//   likedPosts            LikedPost[]
//   muterHistory          MuteHistory[]      @relation("HistoryMuted")
//   mutedHistory          MuteHistory[]      @relation("HistoryMuter")
//   mutedBy               MuteUser[]         @relation("Muted")
//   mutedUsers            MuteUser[]         @relation("Muter")
//   notifications         Notification[]     @relation("NotificationsReceived")
//   sentNotifications     Notification[]     @relation("NotificationsSent")
//   postVotes             PollVoter[]
//   posts                 Post[]             @relation("PostAuthor")
//   clickPosts            PostClick[]
//   disinterestPosts      PostDisinterest[]
//   highlightPosts        PostHighlight[]
//   historyPosts          PostHistory[]
//   impressionPosts       PostImpression[]
//   mediaPostLogs         PostMediaLog[]
//   postMentions          PostMention[]
//   pinPosts              PostPin[]
//   postReports           PostReport[]
//   sharePosts            PostShare[]
//   postTipsReceived      PostTip[]          @relation("PostTipsReceived")
//   postTipsSent          PostTip[]          @relation("PostTipsSent")
//   postUserTags          PostUserTag[]
//   viewPosts             PostView[]
//   profileVisitors       ProfileVisit[]
//   profileVisits         ProfileVisit[]     @relation("Visitor")
//   pushNotifications     PushNotification[]
//   participants          QuizParticipant[]
//   winners               QuizReward?
//   referralsReceived     Referral[]         @relation("ReferralsReceived")
//   referralsSent         Referral[]         @relation("ReferralsSent")
//   revenues              Revenue[]
//   tips                  RewardTip[]
//   stories               Story[]
//   storyMention          StoryMention[]
//   storyReactions        StoryReaction[]
//   storyViewed           StoryViewer[]
//   subscriptions         Subscription[]
//   creatorTasks          Task[]
//   creatorTipPackages    TipPackage[]
//   transactionsReceived  Transaction[]      @relation("Recipient")
//   transactionsSent      Transaction[]      @relation("Sender")
//   transactions          Transaction[]
//   transactionLogs       TransactionLogs[]
//   country               Country?           @relation(fields: [countryId], references: [id])
//   location              UserLocation?
//   reportedBy            UserReport[]       @relation("Reported")
//   reportedUsers         UserReport[]       @relation("Reporter")
//   performedTasks        UserTask[]
//   userTaskSettings      UserTaskSettings?
//   wallet                Wallet?
//   walletAddress         WalletAddress?

//   @@index([name])
//   @@index([email])
//   @@index([phone])
//   @@index([username])
//   @@index([createdAt])
// }

// model ConvoDevice {
//   id              String          @id @default(cuid())
//   userId          String
//   identityKeyPub  Bytes
//   signedPrekeyPub Bytes
//   meta            Json?
//   createdAt       DateTime        @default(now())
//   updatedAt       DateTime        @updatedAt
//   user            User            @relation(fields: [userId], references: [id])
//   oneTimePrekeys  OneTimePrekey[]
// }

// model OneTimePrekey {
//   id        String      @id @default(cuid())
//   deviceId  String
//   keyPub    Bytes
//   consumed  Boolean     @default(false)
//   createdAt DateTime    @default(now())
//   device    ConvoDevice @relation(fields: [deviceId], references: [id])
// }

// model Conversation {
//   id          String            @id @default(cuid())
//   createdAt   DateTime          @default(now())
//   updatedAt   DateTime          @updatedAt
//   callLogs    CallLog[]
//   memberships ConvoMembership[]
//   messages    ConvoMessage[]
// }

// model ConvoMembership {
//   id             String       @id @default(cuid())
//   conversationId String
//   userId         String       @unique
//   createdAt      DateTime     @default(now())
//   updatedAt      DateTime     @updatedAt
//   conversation   Conversation @relation(fields: [conversationId], references: [id])
//   user           User         @relation(fields: [userId], references: [id])
// }

// model ConvoMessage {
//   id             String       @id @default(cuid())
//   cipherText     Bytes
//   nonce          Bytes
//   metaEnc        Bytes?
//   conversationId String
//   senderId       String
//   createdAt      DateTime     @default(now())
//   updatedAt      DateTime     @updatedAt
//   attachments    Attachment[]
//   conversation   Conversation @relation(fields: [conversationId], references: [id])
//   sender         User         @relation(fields: [senderId], references: [id])
// }

// model Attachment {
//   id         String       @id @default(cuid())
//   messageId  String
//   storageKey String
//   cipherKey  Bytes
//   mimeType   String
//   size       Int
//   createdAt  DateTime     @default(now())
//   updatedAt  DateTime     @updatedAt
//   message    ConvoMessage @relation(fields: [messageId], references: [id])
// }

// model CallLog {
//   id             String       @id @default(cuid())
//   callerId       String
//   calleeId       String
//   startedAt      DateTime     @default(now())
//   endedAt        DateTime?
//   status         CallStatus
//   conversationId String
//   createdAt      DateTime     @default(now())
//   updatedAt      DateTime     @updatedAt
//   conversation   Conversation @relation(fields: [conversationId], references: [id])
// }

// model ProfileVisit {
//   id        String   @id @default(cuid())
//   postId    String?
//   userId    String?
//   visitorId String?
//   createdAt DateTime @default(now())
//   sessionId String?
//   device    Json?
//   meta      Json?
//   referer   String?
//   Post      Post?    @relation(fields: [postId], references: [id])
//   user      User?    @relation(fields: [userId], references: [id])
//   visitor   User?    @relation("Visitor", fields: [visitorId], references: [id])

//   @@index([createdAt])
// }

// model UserReport {
//   id           String       @id @default(cuid())
//   reporterId   String
//   reportedId   String
//   reason       ReportReason
//   message      String?
//   meta         Json?
//   status       ReportStatus @default(PENDING)
//   createdAt    DateTime     @default(now())
//   updatedAt    DateTime     @updatedAt
//   reportedUser User         @relation("Reported", fields: [reportedId], references: [id])
//   reporter     User         @relation("Reporter", fields: [reporterId], references: [id])

//   @@index([createdAt])
// }

// model Follow {
//   id          String       @id @default(cuid())
//   followerId  String
//   followingId String
//   createdAt   DateTime     @default(now())
//   updatedAt   DateTime     @updatedAt
//   status      FollowStatus @default(ACCEPTED)
//   follower    User         @relation("Follower", fields: [followerId], references: [id])
//   following   User         @relation("Following", fields: [followingId], references: [id])

//   @@unique([followerId, followingId])
//   @@index([createdAt])
// }

// model FollowHistory {
//   id          String       @id @default(cuid())
//   followerId  String
//   followingId String
//   action      FollowAction
//   createdAt   DateTime     @default(now())
//   updatedAt   DateTime     @updatedAt
//   isPrivate   Boolean      @default(false)
//   follower    User         @relation("HistoryFollower", fields: [followerId], references: [id])
//   following   User         @relation("HistoryFollowing", fields: [followingId], references: [id])

//   @@index([createdAt])
// }

// model BlockUser {
//   id        String   @id @default(cuid())
//   blockerId String
//   blockedId String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   blocked   User     @relation("Blocked", fields: [blockedId], references: [id])
//   blocker   User     @relation("Blocker", fields: [blockerId], references: [id])

//   @@unique([blockerId, blockedId])
//   @@index([createdAt])
// }

// model BlockHistory {
//   id        String      @id @default(cuid())
//   blockerId String
//   blockedId String
//   action    BlockAction
//   createdAt DateTime    @default(now())
//   updatedAt DateTime    @updatedAt
//   blocked   User        @relation("HistoryBlocked", fields: [blockedId], references: [id])
//   blocker   User        @relation("HistoryBlocker", fields: [blockerId], references: [id])

//   @@index([createdAt])
// }

// model MuteUser {
//   id        String   @id @default(cuid())
//   muterId   String
//   mutedId   String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   muted     User     @relation("Muted", fields: [mutedId], references: [id])
//   muter     User     @relation("Muter", fields: [muterId], references: [id])

//   @@unique([muterId, mutedId])
//   @@index([createdAt])
// }

// model MuteHistory {
//   id        String     @id @default(cuid())
//   muterId   String
//   mutedId   String
//   createdAt DateTime   @default(now())
//   updatedAt DateTime   @updatedAt
//   action    MuteAction
//   muted     User       @relation("HistoryMuted", fields: [mutedId], references: [id])
//   muter     User       @relation("HistoryMuter", fields: [muterId], references: [id])

//   @@index([createdAt])
// }

// model UserLocation {
//   id        String   @id @default(cuid())
//   latitude  Float
//   longitude Float
//   updatedAt DateTime @updatedAt
//   userId    String   @unique
//   createdAt DateTime @default(now())
//   meta      Json?
//   user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

//   @@index([createdAt])
// }

// model Story {
//   id         String          @id @default(cuid())
//   userId     String
//   contentUrl String
//   type       StoryType       @default(IMAGE)
//   createdAt  DateTime        @default(now())
//   expiresAt  DateTime
//   user       User            @relation(fields: [userId], references: [id])
//   mentions   StoryMention[]
//   reactions  StoryReaction[]
//   viewers    StoryViewer[]

//   @@index([createdAt])
// }

// model StoryViewer {
//   id        String   @id @default(cuid())
//   storyId   String
//   userId    String
//   viewedAt  DateTime @default(now())
//   createdAt DateTime @default(now())
//   story     Story    @relation(fields: [storyId], references: [id])
//   user      User     @relation(fields: [userId], references: [id])

//   @@unique([storyId, userId])
//   @@index([createdAt])
//   @@index([viewedAt])
// }

// model StoryMention {
//   id        String   @id @default(cuid())
//   storyId   String
//   userId    String
//   viewedAt  DateTime @default(now())
//   createdAt DateTime @default(now())
//   story     Story    @relation(fields: [storyId], references: [id])
//   user      User     @relation(fields: [userId], references: [id])

//   @@unique([storyId, userId])
//   @@index([createdAt])
// }

// model StoryReaction {
//   id        String   @id @default(cuid())
//   storyId   String
//   userId    String
//   viewedAt  DateTime @default(now())
//   createdAt DateTime @default(now())
//   story     Story    @relation(fields: [storyId], references: [id])
//   user      User     @relation(fields: [userId], references: [id])

//   @@unique([storyId, userId])
//   @@index([createdAt])
// }

// model Post {
//   id                             String               @id @default(cuid())
//   content                        String?
//   scheduleAt                     DateTime?
//   location                       String?
//   topic                          String?
//   status                         PostStatus           @default(PUBLISHED)
//   type                           PostTypeEnum
//   kind                           PostKindEnum
//   scope                          PostScopeEnum        @default(ANYONE)
//   totalViews                     BigInt               @default(0)
//   totalLikes                     BigInt               @default(0)
//   totalReplies                   BigInt               @default(0)
//   totalShares                    BigInt               @default(0)
//   totalBookmarks                 BigInt               @default(0)
//   totalReposts                   BigInt               @default(0)
//   totalQuotes                    BigInt               @default(0)
//   totalImpressions               BigInt               @default(0)
//   parentId                       String?
//   userId                         String
//   countryId                      String?
//   meta                           Json?
//   createdAt                      DateTime             @default(now())
//   updatedAt                      DateTime             @updatedAt
//   rootId                         String?
//   deletedAt                      DateTime?
//   isHidden                       Boolean              @default(false)
//   totalTips                      BigInt               @default(0)
//   Bookmark                       Bookmark[]
//   LikedPost                      LikedPost[]
//   Notification                   Notification[]
//   Poll                           Poll?
//   country                        Country?             @relation(fields: [countryId], references: [id])

//   // Correct self-relations
//   parent   Post?  @relation("PostParent", fields: [parentId], references: [id])
//   replies  Post[] @relation("PostParent")

//   root     Post?  @relation("PostRoot", fields: [rootId], references: [id])
//   thread   Post[] @relation("PostRoot")
//   user                           User                 @relation("PostAuthor", fields: [userId], references: [id])
//   PostClick                      PostClick[]
//   PostDisinterest                PostDisinterest[]
//   PostHashTag                    PostHashTag[]
//   PostHighlight                  PostHighlight[]
//   PostHistory                    PostHistory[]
//   PostImpression                 PostImpression[]
//   PostMedia                      PostMedia[]
//   PostMediaLog                   PostMediaLog[]
//   PostMention                    PostMention[]
//   PostPin                        PostPin[]
//   PostReplyContinent             PostReplyContinent[]
//   PostReplyCountry               PostReplyCountry[]
//   PostReport                     PostReport[]
//   PostShare                      PostShare[]
//   PostTip                        PostTip[]
//   PostTopic                      PostTopic[]
//   PostUserTag                    PostUserTag[]
//   PostView                       PostView[]
//   ProfileVisit                   ProfileVisit[]
//   Quiz                           Quiz?
//   Transaction                    Transaction[]

//   @@index([userId, createdAt, kind, status])
//   @@index([createdAt])
// }

// model PostTrendingEvent {
//   postId     String
//   authorId   String    // ← Required for unique users
//   keyword    String
//   createdAt  DateTime  @db.Timestamptz(6)
//   countryId  String?
//   isHashtag  Boolean   @default(false)

//   @@id([postId, keyword, createdAt])
//   @@index([createdAt])
//   @@index([keyword, createdAt(sort: Desc)])
//   @@index([authorId, createdAt(sort: Desc)])
//   @@index([countryId, createdAt(sort: Desc)])
// }

// model PostReplyCountry {
//   id        String   @id @default(cuid())
//   postId    String
//   countryId String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   country   Country  @relation(fields: [countryId], references: [id])
//   Post      Post     @relation(fields: [postId], references: [id])

//   @@index([createdAt])
// }

// model PostReplyContinent {
//   id          String    @id @default(cuid())
//   postId      String
//   continentId String
//   createdAt   DateTime  @default(now())
//   updatedAt   DateTime  @updatedAt
//   continent   Continent @relation(fields: [continentId], references: [id])
//   Post        Post      @relation(fields: [postId], references: [id])

//   @@index([createdAt])
// }

// model PostClick {
//   id        String           @id @default(cuid())
//   postId    String
//   userId    String?
//   sessionId String?
//   source    PostMetricSource
//   action    PostMetricAction
//   timestamp DateTime
//   referer   String?
//   meta      Json?
//   device    Json?
//   createdAt DateTime         @default(now())
//   Post      Post             @relation(fields: [postId], references: [id])
//   user      User?            @relation(fields: [userId], references: [id])

//   @@index([postId, userId])
//   @@index([userId, postId])
//   @@index([userId, createdAt])
//   @@index([userId, timestamp])
//   @@index([createdAt])
// }

// model PostImpression {
//   id        String   @id @default(cuid())
//   postId    String
//   userId    String?
//   sessionId String?
//   createdAt DateTime @default(now())
//   device    Json?
//   timestamp DateTime
//   meta      Json?
//   referer   String?
//   Post      Post     @relation(fields: [postId], references: [id])
//   user      User?    @relation(fields: [userId], references: [id])

//   @@index([postId, userId])
//   @@index([userId, postId])
//   @@index([userId, createdAt])
//   @@index([postId, createdAt])
//   @@index([userId, timestamp])
//   @@index([postId, timestamp])
//   @@index([createdAt])
// }

// model PostShare {
//   id        String   @id @default(cuid())
//   postId    String
//   sessionId String?
//   userId    String?
//   meta      Json?
//   device    Json?
//   timestamp DateTime
//   referer   String?
//   createdAt DateTime @default(now())
//   kind      String?
//   Post      Post     @relation(fields: [postId], references: [id])
//   user      User?    @relation(fields: [userId], references: [id])

//   @@index([postId, userId])
//   @@index([userId, postId])
//   @@index([userId, createdAt])
//   @@index([postId, createdAt])
//   @@index([userId, timestamp])
//   @@index([postId, timestamp])
//   @@index([createdAt])
// }

// model PostView {
//   id        String   @id @default(cuid())
//   postId    String
//   userId    String?
//   sessionId String?
//   createdAt DateTime @default(now())
//   device    Json?
//   timestamp DateTime
//   meta      Json?
//   duration  Int
//   referer   String?
//   Post      Post     @relation(fields: [postId], references: [id])
//   user      User?    @relation(fields: [userId], references: [id])

//   @@index([postId, userId])
//   @@index([userId, postId])
//   @@index([userId, createdAt])
//   @@index([postId, createdAt])
//   @@index([userId, timestamp])
//   @@index([postId, timestamp])
//   @@index([createdAt])
// }

// model PostHistory {
//   id        String     @id @default(cuid())
//   postId    String
//   userId    String
//   action    PostAction
//   reason    String?
//   createdAt DateTime   @default(now())
//   Post      Post       @relation(fields: [postId], references: [id])
//   user      User       @relation(fields: [userId], references: [id])

//   @@index([createdAt])
// }

// model PostPin {
//   id          String      @id @default(cuid())
//   postId      String
//   userId      String
//   contextId   String?
//   createdAt   DateTime    @default(now())
//   updatedAt   DateTime    @updatedAt
//   contextType PostContext @default(PROFILE)
//   Post        Post        @relation(fields: [postId], references: [id])
//   user        User        @relation(fields: [userId], references: [id])

//   @@index([postId, contextType, contextId])
//   @@index([createdAt])
// }

// model PostHighlight {
//   id          String      @id @default(cuid())
//   postId      String
//   userId      String
//   contextType PostContext @default(PROFILE)
//   contextId   String?
//   createdAt   DateTime    @default(now())
//   updatedAt   DateTime    @updatedAt
//   Post        Post        @relation(fields: [postId], references: [id])
//   user        User        @relation(fields: [userId], references: [id])

//   @@index([postId, contextType, contextId])
//   @@index([createdAt])
// }

// model PostDisinterest {
//   id        String   @id @default(cuid())
//   postId    String
//   userId    String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   Post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
//   user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

//   @@unique([postId, userId])
//   @@index([createdAt])
// }

// model PostReport {
//   id        String       @id @default(cuid())
//   userId    String
//   postId    String
//   message   String?
//   meta      Json?
//   status    ReportStatus @default(PENDING)
//   createdAt DateTime     @default(now())
//   updatedAt DateTime     @updatedAt
//   reason    ReportReason
//   Post      Post         @relation(fields: [postId], references: [id])
//   reporter  User         @relation(fields: [userId], references: [id])

//   @@unique([userId, postId])
//   @@index([createdAt])
// }

// model Quiz {
//   id           String            @id @default(cuid())
//   postId       String            @unique
//   isPaid       Boolean           @default(false)
//   rewardAmount Float
//   expireAt     DateTime
//   maxWinners   Int
//   scope        ScopeEnum         @default(NONE)
//   createdAt    DateTime          @default(now())
//   updatedAt    DateTime          @updatedAt
//   Post         Post              @relation(fields: [postId], references: [id])
//   continents   QuizContinent[]
//   countries    QuizCountry[]
//   options      QuizOption[]
//   participants QuizParticipant[]
//   winners      QuizReward[]

//   @@index([createdAt])
// }

// model QuizOption {
//   id           String            @id @default(cuid())
//   quizId       String
//   text         String
//   isCorrect    Boolean           @default(false)
//   createdAt    DateTime          @default(now())
//   updatedAt    DateTime          @updatedAt
//   votes        Int               @default(0)
//   quiz         Quiz              @relation(fields: [quizId], references: [id])
//   participants QuizParticipant[]

//   @@index([createdAt])
// }

// model QuizReward {
//   id        String   @id @default(cuid())
//   userId    String   @unique
//   quizId    String
//   amount    Float
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   quiz      Quiz     @relation(fields: [quizId], references: [id])
//   user      User     @relation(fields: [userId], references: [id])

//   @@unique([userId, quizId])
//   @@index([createdAt])
// }

// model QuizParticipant {
//   id        String     @id @default(cuid())
//   userId    String
//   quizId    String
//   isCorrect Boolean
//   optionId  String
//   createdAt DateTime   @default(now())
//   updatedAt DateTime   @updatedAt
//   option    QuizOption @relation(fields: [optionId], references: [id])
//   quiz      Quiz       @relation(fields: [quizId], references: [id])
//   user      User       @relation(fields: [userId], references: [id])

//   @@unique([userId, quizId])
//   @@index([userId, createdAt])
//   @@index([createdAt])
// }

// model QuizCountry {
//   id        String   @id @default(cuid())
//   quizId    String
//   countryId String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   country   Country  @relation(fields: [countryId], references: [id])
//   quiz      Quiz     @relation(fields: [quizId], references: [id])

//   @@index([createdAt])
// }

// model QuizContinent {
//   id          String    @id @default(cuid())
//   quizId      String
//   continentId String
//   createdAt   DateTime  @default(now())
//   updatedAt   DateTime  @updatedAt
//   continent   Continent @relation(fields: [continentId], references: [id])
//   quiz        Quiz      @relation(fields: [quizId], references: [id])

//   @@index([createdAt])
// }

// model Topic {
//   id        String      @id @default(cuid())
//   word      String      @unique
//   count     Int         @default(0)
//   createdAt DateTime    @default(now())
//   updatedAt DateTime    @updatedAt
//   posts     PostTopic[]

//   @@index([createdAt])
// }

// model PostTopic {
//   id        String   @id @default(cuid())
//   postId    String
//   keywordId String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   keyword   Topic    @relation(fields: [keywordId], references: [id])
//   Post      Post     @relation(fields: [postId], references: [id])

//   @@index([createdAt])
// }

// model PostMedia {
//   id             String         @id @default(cuid())
//   postId         String
//   fileId         String
//   name           String
//   url            String
//   height         Int
//   width          Int
//   size           Int
//   thumbnailUrl   String?
//   fileType       String
//   filePath       String
//   altText        String?
//   flags          String[]       @default([])
//   meta           Json?
//   totalViews     BigInt         @default(0)
//   totalDownloads BigInt         @default(0)
//   createdAt      DateTime       @default(now())
//   updatedAt      DateTime       @updatedAt
//   Post           Post           @relation(fields: [postId], references: [id])
//   analytics      PostMediaLog[]

//   @@index([createdAt])
// }

// model PostMediaLog {
//   id              String          @id @default(cuid())
//   action          PostMediaAction @default(VIEW)
//   kind            PostMediaKind
//   duration        Float           @default(0)
//   watchedPct      Float           @default(0)
//   muted           Boolean         @default(true)
//   playbackRate    Float           @default(0)
//   sessionId       String?
//   device          Json?
//   meta            Json?
//   timestamp       DateTime
//   referer         String?
//   mediaId         String
//   postId          String?
//   userId          String?
//   createdAt       DateTime        @default(now())
//   sessionDuration Float           @default(0)
//   media           PostMedia       @relation(fields: [mediaId], references: [id])
//   Post            Post?           @relation(fields: [postId], references: [id])
//   user            User?           @relation(fields: [userId], references: [id])

//   @@index([createdAt])
// }

// model Poll {
//   id          String          @id @default(cuid())
//   isMultiVote Boolean         @default(false)
//   expireAt    DateTime
//   scope       ScopeEnum       @default(NONE)
//   postId      String          @unique
//   createdAt   DateTime        @default(now())
//   updatedAt   DateTime        @updatedAt
//   Post        Post            @relation(fields: [postId], references: [id])
//   continents  PollContinent[]
//   countries   PollCountry[]
//   options     PollOption[]

//   @@index([createdAt])
// }

// model PollOption {
//   id        String      @id @default(cuid())
//   pollId    String
//   text      String
//   votes     BigInt      @default(0)
//   createdAt DateTime    @default(now())
//   updatedAt DateTime    @updatedAt
//   poll      Poll        @relation(fields: [pollId], references: [id])
//   voters    PollVoter[]

//   @@index([createdAt])
// }

// model PollVoter {
//   id        String     @id @default(cuid())
//   userId    String
//   optionId  String
//   votedAt   DateTime   @default(now())
//   createdAt DateTime   @default(now())
//   updatedAt DateTime   @updatedAt
//   option    PollOption @relation(fields: [optionId], references: [id])
//   user      User       @relation(fields: [userId], references: [id])

//   @@index([userId, createdAt])
//   @@index([createdAt])
// }

// model PollCountry {
//   id        String   @id @default(cuid())
//   pollId    String
//   countryId String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   country   Country  @relation(fields: [countryId], references: [id])
//   poll      Poll     @relation(fields: [pollId], references: [id])

//   @@index([createdAt])
// }

// model PollContinent {
//   id          String    @id @default(cuid())
//   pollId      String
//   continentId String
//   createdAt   DateTime  @default(now())
//   updatedAt   DateTime  @updatedAt
//   continent   Continent @relation(fields: [continentId], references: [id])
//   poll        Poll      @relation(fields: [pollId], references: [id])

//   @@index([createdAt])
// }

// model PostMention {
//   postId    String
//   userId    String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   Post      Post     @relation(fields: [postId], references: [id])
//   user      User     @relation(fields: [userId], references: [id])

//   @@id([postId, userId])
//   @@index([userId, createdAt])
//   @@index([createdAt])
// }

// model PostUserTag {
//   postId    String
//   userId    String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   Post      Post     @relation(fields: [postId], references: [id])
//   user      User     @relation(fields: [userId], references: [id])

//   @@id([postId, userId])
//   @@index([userId, createdAt])
//   @@index([createdAt])
// }

// model PostTag {
//   id        String        @id @default(cuid())
//   name      String        @unique
//   createdAt DateTime      @default(now())
//   updatedAt DateTime      @updatedAt
//   posts     PostHashTag[]

//   @@index([createdAt])
// }

// model PostHashTag {
//   id        String   @id @default(cuid())
//   postId    String
//   tagId     String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   Post      Post     @relation(fields: [postId], references: [id])
//   tag       PostTag  @relation(fields: [tagId], references: [id])

//   @@unique([postId, tagId])
//   @@index([createdAt])
// }

// model LikedPost {
//   id        String   @id @default(cuid())
//   userId    String
//   postId    String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   Post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
//   user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

//   @@unique([userId, postId])
//   @@index([userId, createdAt])
//   @@index([createdAt])
// }

// model Bookmark {
//   id        String   @id @default(cuid())
//   userId    String
//   postId    String
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   Post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
//   user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

//   @@unique([userId, postId])
//   @@index([userId, createdAt])
//   @@index([createdAt])
// }

// model Continent {
//   id                  String               @id @default(cuid())
//   code                String               @unique
//   name                String               @unique
//   createdAt           DateTime             @default(now())
//   updatedAt           DateTime             @updatedAt
//   countries           Country[]
//   pollContinents      PollContinent[]
//   postReplyContinents PostReplyContinent[]
//   quizContinents      QuizContinent[]

//   @@index([code])
//   @@index([createdAt])
// }

// model Country {
//   id                 String             @id @default(cuid())
//   name               String             @unique
//   iso2               String             @unique @db.Char(2)
//   iso3               String             @unique @db.Char(3)
//   emoji              String             @unique
//   continentId        String
//   createdAt          DateTime           @default(now())
//   updatedAt          DateTime           @updatedAt
//   continent          Continent          @relation(fields: [continentId], references: [id])
//   pollCountries      PollCountry[]
//   posts              Post[]
//   postReplyCountries PostReplyCountry[]
//   quizCountries      QuizCountry[]
//   users              User[]

//   @@index([iso2])
//   @@index([iso3])
//   @@index([continentId])
//   @@index([createdAt])
// }

// model SubscriptionPlan {
//   id            String         @id @default(cuid())
//   name          String
//   price         Float
//   discount      Float
//   accountType   UserTypeEnum
//   metadata      Json?
//   /// [PlanTier]
//   tier          Json[]         @default([])
//   createdAt     DateTime       @default(now())
//   updatedAt     DateTime       @updatedAt
//   ngnPrice      Float
//   features      PlanFeature[]
//   subscriptions Subscription[]
//   transactions  Transaction[]

//   @@index([createdAt])
// }

// model PlanFeature {
//   id     String           @id @default(cuid())
//   name   String
//   /// [PlanFeature]        
//   items  Json[]
//   planId String
//   plan   SubscriptionPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
// }

// model Subscription {
//   id           String           @id @default(cuid())
//   userId       String
//   planId       String
//   isPrimary    Boolean          @default(false)
//   isRecurring  Boolean          @default(false)
//   startDate    DateTime
//   endDate      DateTime
//   billingCycle BillingCycleEnum @default(MONTHLY)
//   status       SubStatusEnum    @default(ACTIVE)
//   meta         Json?
//   metadata     Json[]           @default([])
//   createdAt    DateTime         @default(now())
//   updatedAt    DateTime         @updatedAt
//   plan         SubscriptionPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
//   user         User             @relation(fields: [userId], references: [id], onDelete: Cascade)
//   transactions Transaction[]

//   @@index([createdAt])
// }

// model Notification {
//   id          String        @id @default(cuid())
//   title       String
//   message     String
//   meta        Json?
//   isSeen      Boolean?      @default(false)
//   isRead      Boolean?      @default(false)
//   senderId    String?
//   createdAt   DateTime?     @default(now())
//   updatedAt   DateTime?     @updatedAt
//   type        NotifTypeEnum @default(NONE)
//   recipientId String?
//   action      NotifAction   @default(NONE)
//   postId      String?
//   Post        Post?         @relation(fields: [postId], references: [id])
//   recipient   User?         @relation("NotificationsReceived", fields: [recipientId], references: [id], onDelete: Cascade)
//   sender      User?         @relation("NotificationsSent", fields: [senderId], references: [id], onDelete: Cascade)

//   @@index([createdAt])
// }

// model PushNotification {
//   id        String    @id @default(cuid())
//   config    Json?
//   userId    String?
//   createdAt DateTime? @default(now())
//   updatedAt DateTime? @updatedAt
//   user      User?     @relation(fields: [userId], references: [id])

//   @@index([createdAt])
// }

// model Revenue {
//   id        String   @id @default(cuid())
//   userId    String   @map("user_id")
//   amount    Float
//   source    String
//   isPaid    Boolean  @default(false)
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

//   @@index([createdAt])
// }

// model TipPackage {
//   id              String            @id @default(cuid())
//   name            String
//   price           Float
//   kind            TipKindEnum       @default(ALL)
//   thumbnail       String?
//   isActive        Boolean           @default(true)
//   endDate         DateTime?
//   createdAt       DateTime          @default(now())
//   updatedAt       DateTime          @updatedAt
//   userId          String?
//   postTips        PostTip[]
//   user            User?             @relation(fields: [userId], references: [id], onDelete: Cascade)
//   transactions    Transaction[]
//   transactionLogs TransactionLogs[]

//   @@index([createdAt])
// }

// model PostTip {
//   id          String     @id @default(cuid())
//   senderId    String
//   recipientId String
//   postId      String?
//   tipId       String
//   createdAt   DateTime   @default(now())
//   updatedAt   DateTime   @updatedAt
//   isAnon      Boolean    @default(false)
//   message     String?
//   device      Json?
//   meta        Json?
//   referer     String?
//   Post        Post?      @relation(fields: [postId], references: [id], onDelete: Cascade)
//   recipient   User       @relation("PostTipsReceived", fields: [recipientId], references: [id], onDelete: Cascade)
//   sender      User       @relation("PostTipsSent", fields: [senderId], references: [id], onDelete: Cascade)
//   tip         TipPackage @relation(fields: [tipId], references: [id], onDelete: Cascade)
//   rewardTip   RewardTip?
// }

// model RewardTip {
//   id          String      @id @default(cuid())
//   userId      String
//   walletId    String
//   amount      Float
//   source      TipSource
//   status      TipStatus   @default(PENDING)
//   availableAt DateTime
//   createdAt   DateTime    @default(now())
//   updatedAt   DateTime    @updatedAt
//   settledAt   DateTime?
//   postTipId   String      @unique
//   txnId       String      @unique
//   postTip     PostTip     @relation(fields: [postTipId], references: [id], onDelete: Cascade)
//   transaction Transaction @relation(fields: [txnId], references: [id])
//   user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
//   wallet      Wallet      @relation(fields: [walletId], references: [id], onDelete: Cascade)

//   @@index([userId])
//   @@index([availableAt])
//   @@index([settledAt])
// }

// model CoinPackage {
//   id              String            @id @default(cuid())
//   name            String
//   amount          Float
//   price           Float
//   bonus           Float
//   isActive        Boolean           @default(true)
//   endDate         DateTime?
//   createdAt       DateTime          @default(now())
//   updatedAt       DateTime          @updatedAt
//   userId          String?
//   ngnBonus        Float             @default(0)
//   ngnPrice        Float             @default(0)
//   user            User?             @relation(fields: [userId], references: [id], onDelete: Cascade)
//   transactions    Transaction[]
//   transactionLogs TransactionLogs[]

//   @@index([createdAt])
// }

// model Wallet {
//   id           String        @id @default(cuid())
//   credit       Float         @default(0)
//   bonus        Float         @default(0)
//   userId       String        @unique @map("user_id")
//   isLocked     Boolean?      @default(false)
//   createdAt    DateTime      @default(now())
//   updatedAt    DateTime      @updatedAt
//   coins        Float         @default(0)
//   tips         RewardTip[]
//   transactions Transaction[]
//   user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)

//   @@index([createdAt])
// }

// model Transaction {
//   id             String            @id @default(cuid())
//   txnRef         String
//   exTxnRef       String?
//   userId         String?           @map("user_id")
//   senderId       String?
//   recipientId    String?
//   type           TxnTypeEnum
//   amount         Float
//   source         TxnSourceEnum
//   description    String
//   category       TxnCategoryEnum
//   metadata       Json?
//   gateway        TxnGatewayEnum
//   currency       TxnCurrencyEnum
//   status         TxnStatusEnum
//   walletId       String?
//   coinPackageId  String?
//   achievementId  String?           @unique
//   subscriptionId String?
//   subPlanId      String?
//   taskId         String?
//   createdAt      DateTime          @default(now())
//   updatedAt      DateTime          @updatedAt
//   postId         String?
//   tipPackageId   String?
//   achievement    GameAchievement?
//   rewardTip      RewardTip?
//   package        CoinPackage?      @relation(fields: [coinPackageId], references: [id])
//   Post           Post?             @relation(fields: [postId], references: [id])
//   recipient      User?             @relation("Recipient", fields: [recipientId], references: [id])
//   sender         User?             @relation("Sender", fields: [senderId], references: [id])
//   subPlan        SubscriptionPlan? @relation(fields: [subPlanId], references: [id])
//   subscription   Subscription?     @relation(fields: [subscriptionId], references: [id])
//   task           Task?             @relation(fields: [taskId], references: [id])
//   tip            TipPackage?       @relation(fields: [tipPackageId], references: [id])
//   user           User?             @relation(fields: [userId], references: [id])
//   wallet         Wallet?           @relation(fields: [walletId], references: [id])

//   @@index([createdAt])
// }

// model TransactionLogs {
//   id            String       @id @default(cuid())
//   userId        String?      @map("user_id")
//   coinPackageId String?
//   meta          Json?
//   createdAt     DateTime     @default(now())
//   updatedAt     DateTime     @updatedAt
//   tipPackageId  String?
//   package       CoinPackage? @relation(fields: [coinPackageId], references: [id])
//   tipPackage    TipPackage?  @relation(fields: [tipPackageId], references: [id])
//   user          User?        @relation(fields: [userId], references: [id], onDelete: Cascade)

//   @@index([createdAt])
// }

// model UserTaskSettings {
//   id             String   @id @default(cuid())
//   dailyBonusDate DateTime @default(now())
//   adsBonusDate   DateTime @default(now())
//   userId         String   @unique @map("user_id")
//   createdAt      DateTime @default(now())
//   updatedAt      DateTime @updatedAt
//   user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

//   @@index([createdAt])
// }

// model Game {
//   id          String         @id @default(cuid())
//   name        String
//   description String
//   thumbnail   String?
//   userId      String?        @map("user_id")
//   createdAt   DateTime       @default(now())
//   updatedAt   DateTime       @updatedAt
//   modes       GameMode[]
//   user        User?          @relation(fields: [userId], references: [id], onDelete: Cascade)
//   categories  GameCategory[]

//   @@index([createdAt])
// }

// model GameCategory {
//   id                   String                @id @default(cuid())
//   name                 String
//   description          String
//   thumbnail            String?
//   gameId               String
//   userId               String?               @map("user_id")
//   topics               String[]              @default([])
//   createdAt            DateTime              @default(now())
//   updatedAt            DateTime              @updatedAt
//   gameAchievements     GameAchievement[]
//   game                 Game                  @relation(fields: [gameId], references: [id], onDelete: Cascade)
//   user                 User?                 @relation(fields: [userId], references: [id], onDelete: Cascade)
//   gameEnergy           GameEnergy[]
//   gameMonthRewardStats GameMonthRewardStat[]
//   gameMonthStats       GameMonthStat[]
//   rooms                GameRoom[]
//   gameYearStats        GameYearStat[]
// }

// model GameRoom {
//   id          String       @id @default(cuid())
//   name        String
//   description String
//   thumbnail   String?
//   capacity    Int          @default(20)
//   userId      String?      @map("user_id")
//   catId       String       @map("cat_id")
//   createdAt   DateTime     @default(now())
//   updatedAt   DateTime     @updatedAt
//   category    GameCategory @relation(fields: [catId], references: [id], onDelete: Cascade)
//   user        User?        @relation(fields: [userId], references: [id], onDelete: Cascade)
// }

// model GameMonthStat {
//   id               String            @id @default(cuid())
//   catId            String
//   year             Int
//   month            Int
//   playerId         String
//   rank             Int               @default(0)
//   score            Int               @default(0)
//   numPlayed        Int               @default(0)
//   createdAt        DateTime          @default(now())
//   updatedAt        DateTime          @updatedAt
//   mode             GameMode
//   gameAchievements GameAchievement[]
//   category         GameCategory      @relation(fields: [catId], references: [id], onDelete: Cascade)
//   player           User              @relation(fields: [playerId], references: [id], onDelete: Cascade)

//   @@unique([playerId, catId, year, month, mode])
//   @@index([catId, year, month, mode])
// }

// model GameYearStat {
//   id               String            @id @default(cuid())
//   catId            String
//   year             Int
//   playerId         String
//   rank             Int               @default(0)
//   score            Int               @default(0)
//   numPlayed        Int               @default(0)
//   createdAt        DateTime          @default(now())
//   updatedAt        DateTime          @updatedAt
//   mode             GameMode
//   gameAchievements GameAchievement[]
//   category         GameCategory      @relation(fields: [catId], references: [id], onDelete: Cascade)
//   player           User              @relation(fields: [playerId], references: [id], onDelete: Cascade)

//   @@unique([playerId, catId, year, mode])
//   @@index([catId, year, mode])
// }

// model GameMonthRewardStat {
//   id                       String       @id @default(cuid())
//   totalParticipants        Float
//   rewardParticipants       Float
//   coinsRewardParticipants  Float
//   creditRewardParticipants Float
//   bonusRewardParticipants  Float
//   creditParticipantsScore  Float
//   coinsParticipantsScore   Float
//   bonusParticipantsScore   Float
//   numPlayed                Float
//   coinsSpent               Float
//   bonusSpent               Float
//   creditShareAmount        Float
//   coinsShareAmount         Float
//   bonusShareAmount         Float
//   rewardParticipantsScore  Float
//   totalScore               Float
//   year                     Int
//   month                    Int
//   catId                    String
//   createdAt                DateTime     @default(now())
//   updatedAt                DateTime     @updatedAt
//   mode                     GameMode
//   category                 GameCategory @relation(fields: [catId], references: [id], onDelete: Cascade)
// }

// model GameMilestone {
//   id           String            @id @default(cuid())
//   name         MilestoneNameEnum
//   reason       RewardReasonEnum
//   thumbnail    String?
//   milestone    Int
//   reward       Int
//   rewardType   RewardTypeEnum
//   userId       String?           @map("user_id")
//   createdAt    DateTime          @default(now())
//   updatedAt    DateTime          @updatedAt
//   achievements GameAchievement[]
//   user         User?             @relation(fields: [userId], references: [id], onDelete: Cascade)
// }

// model GameAchievement {
//   id          String           @id @default(cuid())
//   reason      RewardReasonEnum
//   description String
//   thumbnail   String?
//   metadata    Json?
//   amount      Float
//   rewardType  RewardTypeEnum
//   txnId       String?          @unique
//   catId       String?
//   playerId    String
//   monthStatId String?          @map("month_stat_id")
//   yearStatId  String?          @map("year_stat_id")
//   milestoneId String?
//   createdAt   DateTime         @default(now())
//   updatedAt   DateTime         @updatedAt
//   mode        GameMode?
//   category    GameCategory?    @relation(fields: [catId], references: [id], onDelete: Cascade)
//   milestone   GameMilestone?   @relation(fields: [milestoneId], references: [id], onDelete: Cascade)
//   monthStat   GameMonthStat?   @relation(fields: [monthStatId], references: [id])
//   player      User             @relation(fields: [playerId], references: [id], onDelete: Cascade)
//   transaction Transaction?     @relation(fields: [txnId], references: [id], onDelete: Cascade)
//   yearStat    GameYearStat?    @relation(fields: [yearStatId], references: [id])
// }

// model GameEnergy {
//   id        String       @id @default(cuid())
//   amount    Int
//   gauge     Int
//   turbo     Int
//   playerId  String
//   catId     String       @map("cat_id")
//   createdAt DateTime     @default(now())
//   updatedAt DateTime     @updatedAt
//   category  GameCategory @relation(fields: [catId], references: [id])
//   player    User         @relation(fields: [playerId], references: [id], onDelete: Cascade)
// }

// model Task {
//   id           String         @id @default(cuid())
//   reward       Float
//   rewardType   RewardTypeEnum
//   title        String
//   description  String
//   url          String
//   code         String?
//   userId       String
//   createdAt    DateTime       @default(now())
//   updatedAt    DateTime       @updatedAt
//   user         User           @relation(fields: [userId], references: [id], onDelete: Cascade)
//   transactions Transaction[]
//   performedBy  UserTask[]
// }

// model UserTask {
//   id        String     @id @default(cuid())
//   userId    String
//   taskId    String
//   status    TaskStatus @default(COMPLETED)
//   createdAt DateTime   @default(now())
//   updatedAt DateTime   @updatedAt
//   task      Task       @relation(fields: [taskId], references: [id], onDelete: Cascade)
//   user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
// }

// model CryptoAddress {
//   id        String     @id @default(cuid())
//   name      CryptoName
//   rate      Float
//   address   String
//   userId    String?
//   metadata  Json?
//   createdAt DateTime   @default(now())
//   updatedAt DateTime   @updatedAt
//   user      User?      @relation(fields: [userId], references: [id], onDelete: Cascade)
// }

// model WalletAddress {
//   id        String     @id @default(cuid())
//   name      CryptoName
//   address   String
//   isPrimary Boolean    @default(false)
//   userId    String     @unique
//   metadata  Json[]     @default([])
//   createdAt DateTime   @default(now())
//   updatedAt DateTime   @updatedAt
//   user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
// }

// model Referral {
//   id         String   @id @default(cuid())
//   referrerId String
//   refereeId  String
//   isRewarded Boolean  @default(false)
//   createdAt  DateTime @default(now())
//   updatedAt  DateTime @updatedAt
//   amount     Float    @default(0)
//   referee    User     @relation("ReferralsReceived", fields: [refereeId], references: [id], onDelete: Cascade)
//   referrer   User     @relation("ReferralsSent", fields: [referrerId], references: [id], onDelete: Cascade)

//   @@unique([referrerId, refereeId])
// }

// enum CallStatus {
//   RINGING
//   CONNECTED
//   ENDED
//   MISSED
// }

// enum StoryType {
//   IMAGE
//   VIDEO
//   TEXT
// }

// enum UserStatus {
//   ACTIVE
//   BANNED
//   SUSPENDED
//   PRIVATE
//   DEACTIVATED
// }

// enum UserTypeEnum {
//   PERSONAL
//   BUSINESS
//   GOVERNMENT
// }

// enum BillingCycleEnum {
//   MONTHLY
//   YEARLY
// }

// enum SubStatusEnum {
//   ACTIVE
//   CANCELLED
//   EXPIRED
//   TRIAL
//   PAYMENT_ERROR
//   PAUSED
//   REVIEW
// }

// enum CryptoName {
//   TON
// }

// enum CoinStatus {
//   FAILED
//   PAID
//   REFUNDED
//   ERROR
// }

// enum TaskStatus {
//   PENDING
//   COMPLETED
//   FAILED
// }

// enum GameMode {
//   SINGLE
//   MULTI
// }

// enum RewardReasonEnum {
//   FIVE_WINNING_STREAK
//   TEN_WINNING_STREAK
//   TWENTY_WINNING_STREAK
//   FIFTY_WINNING_STREAK
//   HUNDRED_WINNING_STREAK
//   TOP_OF_THE_WEEK
//   FIRST_RUNNER_UP_OF_THE_WEEK
//   SECOND_RUNNER_UP_OF_THE_WEEK
//   TOP_OF_THE_MONTH
//   FIRST_RUNNER_UP_OF_THE_MONTH
//   SECOND_RUNNER_UP_OF_THE_MONTH
//   THREE_MONTHS_WINNING_STREAK
//   SIX_MONTHS_WINNING_STREAK
//   NINE_MONTHS_WINNING_STREAK
//   TWELVE_MONTHS_WINNING_STREAK
//   TOP_OF_THE_YEAR
//   FIRST_RUNNER_UP_OF_THE_YEAR
//   SECOND_RUNNER_UP_OF_THE_YEAR
//   CHAMP_OF_THE_YEAR
//   GRAND_CHAMP_OF_THE_YEAR
// }

// enum RewardTypeEnum {
//   COINS
//   BONUS
//   CREDIT
// }

// enum MilestoneNameEnum {
//   ROOM_STREAK
//   WEEK
//   YEAR
//   MONTH
//   CHAMP
//   GRAND_CHAMP
//   MONTH_STREAK
// }

// enum RevenueSourceEnum {
//   ADS_REVENUE
//   GAME_REVENUE
//   CONTEST_REVENUE
// }

// enum TxnCurrencyEnum {
//   TZX
//   TON
//   XTR
//   USDT
//   USD
//   NGN
//   FIAT
//   COINS
// }

// enum TxnTypeEnum {
//   DEBIT
//   CREDIT
// }

// enum TxnSourceEnum {
//   COINS
//   BONUS
//   COINS_BONUS
//   STARS
//   CREDIT
//   FIAT
//   CRYPTO
//   VIRTUAL
// }

// enum TxnCategoryEnum {
//   GAME_DEDUCTION
//   GAME_BONUS
//   GAME_REVENUE
//   COIN_PURCHASE
//   COIN_TRANSFER
//   COIN_RECEIVED
//   COIN_WITHDRAWAL
//   GIFT_PURCHASE
//   GIFT_SENT
//   GIFT_RECEIVED
//   APP_SUBSCRIPTION
//   GAME_SUBSCRIPTION
//   GAME_WEEKLY_REWARD
//   GAME_MONTHLY_REWARD
//   GAME_YEARLY_REWARD
//   DAILY_BONUS
//   APP_TASK
//   QUIZ_POST
//   POST_TIP
//   SPARK_TIP
// }

// enum TxnGatewayEnum {
//   WALLET
//   FLUTTERWAVE
//   PAYSTACK
//   CRYPTO
//   VIRTUAL
//   SMART_GLOCAL
//   UNLIMINT
//   STARS
// }

// enum TxnStatusEnum {
//   COMPLETED
//   PROCESSING
//   FAILED
//   REFUNDED
//   PENDING
// }

// enum UserRoleEnum {
//   SUPER
//   ADMIN
//   USER
// }

// enum PostScopeEnum {
//   ANYONE
//   VERIFIED
//   FOLLOWED
//   MENTIONS
//   COUNTRY
//   CONTINENT
// }

// enum ScopeEnum {
//   NONE
//   COUNTRY
//   CONTINENT
// }

// enum PostKindEnum {
//   ROOT
//   THREAD
//   REPLY
//   REPOST
//   QUOTE
// }

// enum PostTypeEnum {
//   CONTENT
//   POLL
//   QUIZ
// }

// enum PostStatus {
//   PUBLISHED
//   DRAFT
//   SCHEDULED
//   REPORTED
//   DELETED
// }

// enum NotifTypeEnum {
//   USER
//   POST
//   NONE
// }

// enum NotifAction {
//   NONE
//   LIKE
//   COMMENT
//   QUOTE
//   REPOST
// }

// enum FollowAction {
//   FOLLOW
//   UNFOLLOW
// }

// enum BlockAction {
//   BLOCK
//   UNBLOCK
// }

// enum MuteAction {
//   MUTE
//   UNMUTE
// }

// enum ReportReason {
//   HATE
//   ABUSE
//   VIOLENCE
//   CHILD_SAFETY
//   PRIVACY
//   SPAM
//   SELF_HARM
//   SENSITIVE_MEDIA
//   IMPERSONATION
//   VIOLENT_ENTITIES
//   COPYRIGHT
// }

// enum ReportStatus {
//   PENDING
//   REVIEWED
//   ACTIONED
//   DISMISSED
// }

// enum PostContext {
//   PROFILE
//   COMMUNITY
//   GLOBAL
// }

// enum FollowStatus {
//   PENDING
//   ACCEPTED
//   REJECTED
// }

// enum PostAction {
//   DELETE
//   RESTORE
//   HIDDEN
//   UNHIDDEN
// }

// enum PostMediaAction {
//   VIEW
//   WATCH
//   DOWNLOAD
// }

// enum PostMediaKind {
//   IMAGE
//   VIDEO
// }

// enum PostMetricSource {
//   FORYOU
//   FOLLOWING
//   FRIENDS
//   LATEST
//   SEARCH
//   TRENDING
// }

// enum PostMetricAction {
//   CONTENT
//   FOLLOW
//   PROFILE
//   OPTION
//   REPOST
//   REPLY
//   TIP
// }

// enum TipKindEnum {
//   ALL
//   POST
//   SPARK
//   CHAT
//   LIVE
// }

// enum TipSource {
//   POST
//   SPARK
//   LIVE
//   CHAT
// }

// enum TipStatus {
//   PENDING
//   SETTLED
//   EXPIRED
//   REFUNDED
// }
