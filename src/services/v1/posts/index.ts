import { createHash } from 'node:crypto';
import { POST_LABELS } from '@/cron/helpers';
import { enqueuePostTopic } from '@/cron/utils';
import { lockWallets, cents, WalletError, walletOperation, requestKey } from '@/services/walletLedger';
import { recommendationVisibility, kwonrecClient } from "@/services/kwonrec";
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
      (item) => item.type === PostTypeEnum.QUIZ && item.quiz?.isPaid
    );
    const totalRewardAmount = rewardedQuiz.reduce(
      (prev, curr) => prev + cents(curr.quiz?.rewardAmount ?? 0) / 100,
      0
    );
    //  check user wallet balance
    if (rewardedQuiz.length > 0) {
      const userWallet = await prisma.wallet.findUniqueOrThrow({
        where: { userId },
      });
      if (cents(userWallet.coins, true) < cents(totalRewardAmount)) {
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
        await lockWallets(tx, [userId]);
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
        if (wallet.isLocked || cents(wallet.coins, true) < cents(totalRewardAmount)) {
          throw new WalletError('Wallet locked or insufficient quiz funds');
        }
      }
      // check if scheduled
      const schedule = body.scheduleAt
        ? {
            status: body.isDraft ? PostStatus.DRAFT : PostStatus.SCHEDULED,
            scheduleAt: new Date(body.scheduleAt),
            scheduledEffectsPending: !body.isDraft,
          }
        : body.isDraft ? {status: PostStatus.DRAFT} : {};
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
        const expireAt = getExpiryDate(_pollItem.duration, body.scheduleAt);
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
        const expireAt = getExpiryDate(_quizItem.duration, body.scheduleAt);
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
            const expireAt = getExpiryDate(_pollItem.duration, body.scheduleAt);
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
            const expireAt = getExpiryDate(_quizItem.duration, body.scheduleAt);
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

    for (const post of [result, ...result.thread]) {
      void enqueuePostTopic(post.id, post.content).catch(() => console.warn('Topic enqueue failed; background scan will retry'));
    }


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
            scheduledEffectsPending: !body.isDraft,
          }
        : body.isDraft ? {status: PostStatus.DRAFT} : {};
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
        const expireAt = getExpiryDate(_pollItem.duration, body.scheduleAt);
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
          const expireAt = getExpiryDate(_pollItem.duration, body.scheduleAt);
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
      // Scheduled/draft quotes count only when published.
      if (!body.isDraft && !body.scheduleAt) await tx.post.update({
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
            scheduledEffectsPending: !body.isDraft,
          }
        : isDraft ? {status: PostStatus.DRAFT} : {};
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
        const expireAt = getExpiryDate(_pollItem.duration, body.scheduleAt);
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
      // Scheduled/draft replies count only when published.
      if (!body.isDraft && !body.scheduleAt) await tx.post.update({
        where: { id: postId },
        data: { totalReplies: { increment: 1 } },
      });
      // insert reply notification IF Not owner
      if (!body.isDraft && !body.scheduleAt && post?.userId !== user.id) {
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
    idempotencyKey?: string;
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
    if (args.senderId !== user.id || args.senderId === args.recipientId) throw new WalletError('Invalid tip sender or recipient');
    const result = await walletOperation(`tip:${user.id}`, requestKey(args.idempotencyKey),
      { postId: args.postId, recipientId: args.recipientId, tipId: args.tipId }, [args.senderId, args.recipientId], async (tx) => {
      const post = await tx.post.findUniqueOrThrow({ where: { id: args.postId } });
      if (post.userId !== args.recipientId) throw new WalletError('Tip recipient must own the post');
      const txnRef = generateUniqueRef();
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
      if (!tip.isActive || (tip.endDate && tip.endDate < new Date())) throw new WalletError('Tip package unavailable');
      cents(tip.price);
      if (wallet.isLocked) throw new WalletError('Wallet is locked');
      let info = { isCredit: false, amount: cents(tip.price) / 100 };
      if (cents(wallet.coins, true) < cents(tip.price)) {
        if (cents(wallet.credit, true) < Math.ceil(cents(tip.price) * 10 / 22)) {
          throw new AppError("Insufficient balance, please purchase coins");
        }
        info = { amount: Math.ceil(cents(tip.price) * 10 / 22) / 100, isCredit: true };
      }
      if (info.isCredit && cents(wallet.credit, true) < cents(info.amount)) throw new WalletError('Insufficient balance');
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
          userId: args.senderId,
          amount: info.amount,
          currency: info.isCredit ? TxnCurrencyEnum.TZX : TxnCurrencyEnum.COINS,
          type: TxnTypeEnum.DEBIT,
          walletId: wallet.id,
          tipPackageId: tip.id,
          category: TxnCategoryEnum.POST_TIP,
          postId: args.postId,
          senderId: args.senderId,
          recipientId: args.recipientId,
          status: TxnStatusEnum.COMPLETED,
          source: info.isCredit ? TxnSourceEnum.CREDIT : TxnSourceEnum.COINS,
          gateway: TxnGatewayEnum.WALLET,
          txnRef,
          description: `Post tip sent to ${recipient.name}`,
        },
      });
      // credit recipient wallet - package price(coins) from wallet amount(coins)
      // we sell 2.2 coins for 1TZX but buy back at 3 coins --- tip.price is in coins
      // The system takes 45% of all tips and the recipient takes 55%
      const creditAmount = Math.round(cents(tip.price) * 55 / 300) / 100;
      // log recipient transaction
      const txn = await tx.transaction.create({
        data: {
          userId: args.recipientId,
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
          metadata: { settlementVersion: 1 },
          source: TxnSourceEnum.CREDIT,
          gateway: TxnGatewayEnum.WALLET,
          txnRef,
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
          coinsAmount: tip.price,
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
    if (error instanceof WalletError) return { data: error.message, status: error.status };
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

    const userId = user.id;
    if (args.feed === "foryou" && recs.length === 0) return { data: [], status: 200 };
    const feedPosts = await prisma.post.findMany(newsfeedQuery(userId, recs, args));
    // Reposts arrive in the same database read at every displayed nesting level.
    // These filtered children are action flags, not reply content.
    const attachRepostActions = (post: any): any => {
      const { replies, ...rest } = post;
      return {
        ...rest,
        reposts: replies ?? [],
        ...(post.parent ? { parent: attachRepostActions(post.parent) } : {}),
      };
    };
    const data = feedPosts.map(attachRepostActions);

    const _posts = data
      ?.map(transformPrismaTagMentions)
      .map((p) => transformPost(p, user));

    const idToIndexMap: Record<string, number> = {};
    recs.forEach((id, index) => {
      idToIndexMap[id] = index;
    });

  // --- Step 3: Sort the fetched posts based on the index map ---
  const reorderedPosts = args.feed !== "foryou" ? _posts : _posts.sort((a, b) => {
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
      data: reorderedPosts,
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
        user.role !== UserRoleEnum.ADMIN && user.role !== UserRoleEnum.SUPER &&
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
        user.role !== UserRoleEnum.ADMIN && user.role !== UserRoleEnum.SUPER &&
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

const getExpiryDate = (duration: {
  days: number;
  hours: number;
  minutes: number;
}, startsAt?: string | Date | null): Date => {
  const now = startsAt ? new Date(startsAt) : new Date();
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
    const result = await prisma.post.findMany({where: { ...recommendationVisibility(userId), id: { in: recs}}, select: {id: true, content: true, userId: true, createdAt: true}})
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
    const resp = await kwonrecClient.post("/classify", { labels, text })
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


// getContentKeywords()


export const PUBLIC_PREVIEW_LIMIT = 21;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** Public, recent posts ordered by real engagement; never personalized relations. */
export function publicPreviewQuery(now = new Date(), older = false, take = PUBLIC_PREVIEW_LIMIT) {
  const cutoff = new Date(now.getTime() - THREE_DAYS_MS);
  return {
    take,
    relationLoadStrategy: "join",
    where: {
      status: "PUBLISHED", scope: "ANYONE", kind: "ROOT", type: "CONTENT",
      deletedAt: null, isHidden: false, parentId: null, rootId: null,
      createdAt: older ? { lt: cutoff } : { gte: cutoff, lte: now },
      OR: [{ scheduleAt: null }, { scheduleAt: { lte: now } }],
      user: { isPrivate: false, status: "ACTIVE", deletedAt: null, deactivatedAt: null },
    },
    orderBy: older
      ? [{ createdAt: "desc" }, { id: "desc" }]
      : [{ totalLikes: "desc" }, { totalReplies: "desc" }, { totalReposts: "desc" }, { totalShares: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true, content: true, createdAt: true, userId: true,
      totalLikes: true, totalReplies: true, totalReposts: true, totalQuotes: true,
      totalShares: true, totalBookmarks: true, totalImpressions: true, totalTips: true, totalViews: true,
      user: { select: { id: true, name: true, username: true, avatar: true } },
      media: {
        take: 4, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, fileId: true, url: true, thumbnailUrl: true, fileType: true, altText: true, width: true, height: true },
      },
    },
  } satisfies Prisma.PostFindManyArgs;
}

export async function getPublicPostPreview(now = new Date()) {
  const posts = await prisma.post.findMany(publicPreviewQuery(now));
  // Small/new communities should still have a full preview. Only fill from older
  // public posts after recent ones; the identical visibility filter applies.
  if (posts.length < PUBLIC_PREVIEW_LIMIT) {
    posts.push(...await prisma.post.findMany(publicPreviewQuery(now, true, PUBLIC_PREVIEW_LIMIT - posts.length)));
  }
  return posts.map(({ user, totalLikes, totalReplies, totalReposts, totalQuotes, totalShares,
    totalBookmarks, totalImpressions, totalTips, totalViews, ...post }) => ({
    ...post, author: user,
    totalLikes: totalLikes.toString(), totalReplies: totalReplies.toString(), totalReposts: totalReposts.toString(),
    totalQuotes: totalQuotes.toString(), totalShares: totalShares.toString(), totalBookmarks: totalBookmarks.toString(),
    totalImpressions: totalImpressions.toString(), totalTips: totalTips.toString(), totalViews: totalViews.toString(),
  }));
}

/** Keep all visibility and viewer-specific fields in the authoritative database read. */
export function newsfeedQuery(userId: string, recs: string[], args: { feed?: string; limit?: number; page?: number } = {}): Prisma.PostFindManyArgs {
  const viewerReposts = {
    where: { userId, kind: "REPOST", status: "PUBLISHED", deletedAt: null },
    select: { id: true, parentId: true },
  } satisfies Prisma.Post$repliesArgs;
  const ranked = !args.feed || args.feed === "foryou";
  return {
      ...(!ranked ? { take: args.limit ?? 21, skip: ((args.page ?? 1) - 1) * (args.limit ?? 21) } : {}),
      // One database round trip for the complete page, including viewer reactions.
      relationLoadStrategy: "join",
      where: {
        ...(ranked ? { ...recommendationVisibility(userId), id: { in: recs } } : getFeedVisibility(userId, args.feed!)),
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
      orderBy: args.feed === "trending"
        ? [{ totalLikes: "desc" }, { totalReplies: "desc" }, { totalReposts: "desc" }, { totalShares: "desc" }, { createdAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
    } satisfies Prisma.PostFindManyArgs;
}

/** Select each tab from the viewer's own relationships, never from global rankings. */
export function getFeedVisibility(userId: string, feed: string): Prisma.PostWhereInput {
  const now = new Date();
  const visibility = recommendationVisibility(userId);
  const schedules: Prisma.PostWhereInput = { createdAt: { lte: now }, OR: [{ scheduleAt: null }, { scheduleAt: { lte: now } }] };
  if (feed === "following" || feed === "friends") {
    const follows = { some: { followerId: userId, status: FollowStatus.ACCEPTED } };
    // The author or an accepted follower may see private/followers-only posts.
    // Apply the same rules to quoted/reposted parents and roots.
    const visiblePost: Prisma.PostWhereInput = {
      status: "PUBLISHED", deletedAt: null, isHidden: false,
      disinterest: { none: { userId } }, reports: { none: { userId } },
      AND: [schedules, { OR: [
        { userId }, { scope: "ANYONE" },
        { scope: "FOLLOWED", user: { followers: follows } },
      ] }],
      user: {
        status: { in: ["ACTIVE", "PRIVATE"] }, deletedAt: null, deactivatedAt: null,
        NOT: [{ blockedUsers: { some: { blockedId: userId } } }, { blockedBy: { some: { blockerId: userId } } }, { mutedBy: { some: { muterId: userId } } }],
        OR: [{ id: userId }, { isPrivate: false, status: "ACTIVE" }, { followers: follows }],
      },
    };
    return {
      ...visiblePost, kind: { in: ["ROOT", "REPOST", "QUOTE"] },
      AND: [visiblePost, { user: { followers: follows,
        ...(feed === "friends" ? { following: { some: { followingId: userId, status: FollowStatus.ACCEPTED } } } : {}),
      } }, { OR: [{ parentId: null }, { parent: { is: visiblePost } }] }, { OR: [{ rootId: null }, { root: { is: visiblePost } }] }],
    };
  }
  return { ...visibility, AND: [visibility, schedules],
    ...(feed === "trending" ? { createdAt: { gte: new Date(now.getTime() - THREE_DAYS_MS), lte: now } } : {}),
  };
}

/** Semantic inference runs only in the job worker, never during post creation. */
export async function inferPostTopic(id: string, expectedHash?: string) {
  const post = await prisma.post.findFirst({ where: { id, deletedAt: null, status: { in: [PostStatus.PUBLISHED, PostStatus.SCHEDULED] } }, select: { id: true, content: true } });
  if (!post || (expectedHash !== undefined && createHash('sha256').update(post.content ?? '').digest('hex') !== expectedHash)) return;
  let text = post.content ?? '';
  try {
    const raw = JSON.parse(text);
    if (Array.isArray(raw.blocks)) text = raw.blocks.map((block: { text?: string }) => typeof block.text === 'string' ? block.text : '').join(' ');
  } catch { /* Plain text is already rendered content. */ }
  text = text.replace(/https?:\/\/\S+|@[\w]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  let topic = 'generic';
  if (text.length >= 10) {
    const result = await topicClassifier(text);
    const label = result.labels?.[0], score = result.scores?.[0];
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1 || typeof label !== 'string') throw new Error('Invalid topic inference response');
    // Independent entailment must outweigh contradiction before assigning a topic.
    if (score >= 0.5 && POST_LABELS.includes(label)) topic = label;
  }
  // Do not let an old inference overwrite an edit, deletion or unpublished post.
  await prisma.post.updateMany({ where: { id, content: post.content, deletedAt: null, status: { in: [PostStatus.PUBLISHED, PostStatus.SCHEDULED] } }, data: { topic } });
}

/** Search rendered text only; metadata and private posts never become search hits. */
export async function searchPosts(query: string, tab: 'top' | 'latest', page: number, limit: number, viewer?: AuthUser) {
  const terms = query.trim().replace(/^#/, '').split(/\s+/).filter(Boolean);
  if (!terms.length) return { posts: [], hasMore: false };
  const viewerId = viewer?.id ?? '';
  const matches = query.trim().startsWith('#')
    ? [Prisma.sql`EXISTS (SELECT 1 FROM "PostTrendingEvent" e WHERE e."postId" = p.id AND e."isHashtag" = true AND e.keyword = lower(${terms.join(' ')}))`]
    : [Prisma.sql`to_tsvector('simple', kwonnet_trend_text(p.content)) @@ plainto_tsquery('simple', ${terms.join(' ')})`];
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT p.id FROM "Post" p JOIN "User" u ON u.id = p."userId"
    WHERE p.status = 'PUBLISHED' AND p.scope = 'ANYONE' AND p.kind = 'ROOT'
      AND p."parentId" IS NULL AND p."rootId" IS NULL AND p."deletedAt" IS NULL AND NOT p."isHidden"
      AND p."createdAt" <= NOW() AND (p."scheduleAt" IS NULL OR p."scheduleAt" <= NOW() AT TIME ZONE 'UTC')
      AND u.status = 'ACTIVE' AND NOT u."isPrivate" AND u."deletedAt" IS NULL AND u."deactivatedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "BlockUser" b WHERE
        (b."blockerId" = ${viewerId} AND b."blockedId" = u.id) OR (b."blockedId" = ${viewerId} AND b."blockerId" = u.id))
      AND NOT EXISTS (SELECT 1 FROM "MuteUser" m WHERE m."muterId" = ${viewerId} AND m."mutedId" = u.id)
      AND NOT EXISTS (SELECT 1 FROM "PostDisinterest" d WHERE d."postId" = p.id AND d."userId" = ${viewerId})
      AND NOT EXISTS (SELECT 1 FROM "PostReport" r WHERE r."postId" = p.id AND r."userId" = ${viewerId})
      AND ${Prisma.join(matches, ' AND ')}
    ORDER BY ${tab === 'top' ? Prisma.sql`p."totalLikes" DESC, p."totalReplies" DESC, p."totalReposts" DESC,` : Prisma.empty}
      p."createdAt" DESC, p.id DESC
    LIMIT ${limit + 1} OFFSET ${(page - 1) * limit}
  `);
  const ids = rows.slice(0, limit).map(row => row.id);
  if (!ids.length) return { posts: [], hasMore: false };
  if (viewer) {
    const result = await getNewsfeed(ids, viewer, { feed: 'foryou' });
    if (result.status !== 200 || !Array.isArray(result.data)) throw new Error('Unable to load search results');
    return { posts: result.data, hasMore: rows.length > limit };
  }
  const base = publicPreviewQuery();
  const posts = await prisma.post.findMany({ ...base, take: limit,
    where: { ...base.where, createdAt: { lte: new Date() }, id: { in: ids } } });
  const ordered = ids.flatMap(id => posts.filter(post => post.id === id));
  return { posts: ordered.map(({ user, ...post }) => serializeBigInts({ ...post, author: user })), hasMore: rows.length > limit };
}


export async function getPostGifters(postId: string, viewerId: string, page = 1, limit = 21) {
  return prisma.$transaction(async tx => {
    const post = await tx.post.findUnique({where: {id: postId}, select: {userId: true, deletedAt: true}});
    if (!post || post.deletedAt) return {status: 404, data: "Post not found"};
    if (post.userId !== viewerId) return {status: 403, data: "Only the post owner can view gifters"};
    const where = {postId, OR: [{rewardTip: null}, {rewardTip: {status: {in: ['PENDING', 'SETTLED'] as ('PENDING' | 'SETTLED')[]}}}]};
    const [tips, totalGifts, totals] = await Promise.all([
      tx.postTip.findMany({where, skip: (page - 1) * limit, take: limit, orderBy: [{createdAt: 'desc'}, {id: 'desc'}], select: {
        id: true, createdAt: true, isAnon: true, message: true, coinsAmount: true,
        sender: {select: {id: true, name: true, username: true, avatar: true}},
        tip: {select: {name: true, price: true}}, rewardTip: {select: {status: true}},
      }}),
      tx.postTip.count({where}),
      tx.$queryRaw<{totalCoins: string; estimated: boolean}[]>`
        SELECT COALESCE(SUM(COALESCE(t."coinsAmount", p.price)), 0)::text AS "totalCoins",
          COALESCE(BOOL_OR(t."coinsAmount" IS NULL), false) AS estimated
        FROM "PostTip" t JOIN "TipPackage" p ON p.id = t."tipId"
        LEFT JOIN "RewardTip" r ON r."postTipId" = t.id
        WHERE t."postId" = ${postId} AND (r.id IS NULL OR r.status IN ('PENDING', 'SETTLED'))
      `,
    ]);
    return {status: 200, data: {
      gifters: tips.map(tip => ({id: tip.id, createdAt: tip.createdAt, message: tip.message,
        sender: tip.isAnon ? null : tip.sender, anonymous: tip.isAnon,
        coins: (tip.coinsAmount ?? tip.tip.price).toString(), gift: tip.tip.name,
        estimated: tip.coinsAmount === null, status: tip.rewardTip?.status ?? 'SETTLED'})),
      ownerId: viewerId, totalGifts, totalCoins: totals[0]?.totalCoins ?? '0', hasEstimatedAmounts: totals[0]?.estimated ?? false,
      page, hasMore: page * limit < totalGifts,
    }};
  }, {isolationLevel: 'RepeatableRead'});
}

export async function getPostEngagementsOverview(postId: string, viewerId: string) {
  const post = await prisma.post.findUnique({where: {id: postId}, select: {userId: true, deletedAt: true}});
  return !post || post.deletedAt ? {status: 404, data: "Post not found"} : {status: 200, data: {isOwner: post.userId === viewerId}};
}

/** Atomic bounded publication; DB triggers update recommendation/trend indexes. */
export async function publishDueScheduledPosts() {
  return prisma.$transaction(async tx => {
    const due = await tx.$queryRaw<{id: string; kind: string; parentId: string | null; userId: string; scheduledEffectsPending: boolean}[]>`SELECT p.id, p.kind, p."parentId", p."userId", p."scheduledEffectsPending" FROM "Post" p JOIN "User" u ON u.id = p."userId"
      WHERE p.status = 'SCHEDULED' AND p."scheduleAt" <= NOW() AND p."deletedAt" IS NULL
      AND u.status IN ('ACTIVE', 'PRIVATE') AND u."deletedAt" IS NULL AND u."deactivatedAt" IS NULL
      AND (p.kind NOT IN ('REPLY', 'QUOTE') OR EXISTS (SELECT 1 FROM "Post" parent
        WHERE parent.id = p."parentId" AND parent.status = 'PUBLISHED' AND parent."deletedAt" IS NULL AND NOT parent."isHidden"))
      ORDER BY p."scheduleAt", p.id LIMIT 100 FOR UPDATE OF p SKIP LOCKED`;
    if (!due.length) return 0;
    const result = await tx.post.updateMany({where: {id: {in: due.map(post => post.id)}, status: 'SCHEDULED', deletedAt: null}, data: {status: 'PUBLISHED', createdAt: new Date(), scheduledEffectsPending: false}});
    for (const post of due) {
      if (post.scheduledEffectsPending && post.parentId && (post.kind === 'REPLY' || post.kind === 'QUOTE')) {
        await tx.post.update({where: {id: post.parentId}, data: post.kind === 'REPLY' ? {totalReplies: {increment: 1}} : {totalQuotes: {increment: 1}}});
        if (post.kind === 'REPLY') {
          const parent = await tx.post.findUnique({where: {id: post.parentId}, select: {userId: true}});
          if (parent && parent.userId !== post.userId) await tx.notification.create({data: {senderId: post.userId, recipientId: parent.userId, postId: post.id, type: NotifTypeEnum.POST, action: NotifAction.COMMENT, title: 'New post comment', message: 'Someone replied to your post'}});
        }
      }
    }
    return result.count;
  });
}
