import prisma from "@/db";
import logger from "@/logger";
import { AuthUser, FeedPost } from "@/types";
import { PollThread, PostCreate, QuizThread } from "@/types/post";
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
  PostMediaAction
} from "@prisma/client";
import {
  checkPollPermissions,
  checkQuizPermissions,
  composePostAuthor,
  convertBigInts,
  removeProperty,
  transformPost,
} from "../utils";
import { ReportSchema } from "@/schema";
import redisClient from "@/redis";
import { DetectResult, ResultDevice } from "node-device-detector";
import { LookupResult } from "ip-location-api";

interface CreatePostThread extends Post {
  quiz?: Quiz | null;
}

export const createPost = async (body: PostCreate, userId: string) => {
  try {
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
      if (userWallet.amount < totalRewardAmount) {
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
      const { poll, quiz, tags, mentions, tagUsers, ...rest } = body.thread[0];
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
                amount: {
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

    return { data: {}, status: 200 };
  } catch (error: any) {
    console.log(error?.message);
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
      const { poll, quiz, tags, mentions, tagUsers, ...rest } = body.thread[0];
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
      const { mentions, tagUsers, tags, media, poll, quiz, ...rest } =
        thread[0];
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
      // Increase totalQuotes count for the parent post
      await tx.post.update({
        where: { id: postId },
        data: { totalReplies: { increment: 1 } },
      });
      return { reply, replied: true, id: postId, userId: user.id };
    });
    const { reply, ...rest } = result;
    // check if it's neither schedule nor draft and return the reply to the ui
    if (reply && !body.isDraft && !body.scheduleAt) {
      const res = await getSinglePost(reply.id, user.id);
      if (!res) return { data: rest, status: 200 };
      const transformed = transformPost(res, true, user);
      return { data: { ...rest, reply: transformed }, status: 200 };
    }
    return { data: rest, status: 200 };
  } catch (error: any) {
    logger.error(error?.message);
    return { data: "Error occurred reposting, please try again", status: 500 };
  }
};

export const reportPost = async (body: ReportSchema, user: AuthUser) => {
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
  user: AuthUser
) => {
  try {
    const result = await prisma.postPin.findFirst({
      where: { postId: args.id, contextType: args.context, userId: user.id },
      orderBy: [{ createdAt: "desc" }],
    });
    // check if the user has already reported the post with 24 hours
    if (result) {
      await prisma.postPin.delete({ where: { id: result.id } });
      return {
        data: { id: args.id, userId: user.id, isPinned: false },
        status: 200,
      };
    }
    // check if the post exists
    const post = await prisma.post.findUniqueOrThrow({
      where: { id: args.id },
    });
    const checkCount = await prisma.postPin.count({
      where: { contextType: args.context, userId: user.id },
    });
    logger.info(`Post pins ${checkCount}`)
    if(checkCount >= 5){
      return { data: "You've reached max of 5 post pins, please unpin others to pin again", status: 400,}
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
  user: AuthUser
) => {
  try {
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
    // check if the post exists
    const post = await prisma.post.findUniqueOrThrow({
      where: { id: args.id },
    });
    const checkCount = await prisma.postHighlight.count({
      where: { contextType: args.context, userId: user.id },
    });
    logger.info(`Post hightlights ${checkCount}`)
    if(checkCount >= 20){
      return { data: "You've reached max of 20 hightlight posts, please remove some highlight to add more", status: 400,}
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

export async function createPostImpression(args:{
  device: DetectResult;
  meta: LookupResult | null;
  postId: string;
  userId: string;
  sessionId: string | null | undefined;
  timestamp: string;
  referer?: string | null
}) {
  try {
    const result = await prisma.$transaction(async(tx) => {
      await tx.postImpression.create({
        data: args
      })
      // increment the post impression counter
      await tx.post.update({where: { id: args.postId }, data: { totalImpressions: { increment: 1}}})
      return { data: { id: args.postId, userId: args.userId }, status: 200 }
    })
    return result
  } catch (error) {
    return {data: "Sorry an error occurred to process request ", status: 500}
  }
}

export async function createPostView(args:{
  device: DetectResult;
  meta: LookupResult | null;
  postId: string;
  userId: string;
  sessionId: string | null | undefined;
  timestamp: string;
  duration: number;
  referer?: string | null
}) {
  try {
    const result = await prisma.$transaction(async(tx) => {
      await tx.postView.create({
        data: args
      })
      // increment the post impression counter
      await tx.post.update({where: { id: args.postId }, data: { totalViews: { increment: 1}}})
      return { data: { id: args.postId, userId: args.userId }, status: 200 }
    })
    return result
  } catch (error) {
    return {data: "Sorry an error occurred to process request ", status: 500}
  }
}

export async function createPostMediaLog(args:{
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
  sessionId?: string | null
  referer?: string | null
  kind: PostMediaKind,
  action: PostMediaAction
}) {
  try {
    const result = await prisma.$transaction(async(tx) => {
      await tx.postMediaLog.create({
        data: args
      })
      // increment the post media action counter
      if(args.action === PostMediaAction.DOWNLOAD){
        await tx.postMedia.update({where: { id: args.mediaId }, data: { totalDownloads: { increment: 1}}})
      }
      if(args.action === PostMediaAction.VIEW){
        await tx.postMedia.update({where: { id: args.mediaId }, data: { totalViews: { increment: 1}}})
      }
      return { data: { id: args.postId, mediaId: args.mediaId, userId: args.userId, isDownload: args.action === PostMediaAction.DOWNLOAD, isView: args.action === PostMediaAction.VIEW }, status: 200 }
    })
    return result
  } catch (error) {
    return {data: "Sorry an error occurred to process request ", status: 500}
  }
}

export async function insertImpressionQueue(args:{
  device: ResultDevice;
  meta: LookupResult | null;
  postId: string;
  userId: string;
  sessionId: string | null | undefined;
  timestamp: string;
}) {
  try {
    const key = `impressions:${args.postId}:${args?.userId?.slice(-10) || args?.sessionId}`;
    const now = Date.now();
    const lastSeen = await redisClient.get(key);
    if (!lastSeen || now - Number(lastSeen) > 2 * 60 * 1000) {
      await redisClient.set(key, now, { EX: 10 * 60}); // keep for 1h
      await redisClient.rPush('impression:queue', JSON.stringify(args));
      return { data: { id: args.postId, userId: args.userId }, status: 200 }
    }
    return { data: "Too frequent & depublicated event", status: 400 }
  } catch (error) {
    return {data: "Sorry an error occurred to process request ", status: 500}
  }
}

export const getNewsfeed = async ( args: { feed: string, limit?: number, page?: number}, user: AuthUser,) => {
  try {
    const { limit = 21, page = 1} = args
    const feedPosts = await prisma.post.findMany({
      where: {
        OR: [{ kind: "ROOT" }, { kind: "REPOST" }, { kind: "QUOTE" }],
        status: PostStatus.PUBLISHED,
        deletedAt: null
      },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        thread: false,
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

            followers: {
              where: {
                followerId: user.id,
              },
              select: { id: true, followerId: true, followingId: true },
            },
            following: {
              where: {
                followingId: user.id,
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
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: { id: true, followerId: true, followingId: true },
                },
                following: {
                  where: {
                    followingId: user.id,
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
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: { id: true, followerId: true, followingId: true },
                    },
                    following: {
                      where: {
                        followingId: user.id,
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
    // Step 3: Mark both the original and the child reposts
    const repostedPostIds = new Set(
      userReposts.flatMap((repost) => [repost.id, repost.parentId]) // Include both original and child reposts
    );
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

    const _posts = data.map((p) => transformPost(p, true, user));

    console.log(_posts[0]?.author);

    return {
      data: _posts.length > 0 ? _posts : "Not found",
      status: _posts.length > 0 ? 200 : 404,
    };
  } catch (error: any) {
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
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

    const data = transformPost(post, true);

    return { data, status: 200 };
  } catch (error) {
    return {
      data: "Error occurred trying to get post, please try again",
      status: 500,
    };
  }
};

export const getPostReplies = async (
  args: { postId: string; userId?: string; page?: number; limit?: number; hidden?: boolean },
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
        },
      });
      userCanReply = !!result2;
    }

    const result = await fetchFeedPostReplies(args);

    const transformed = result.map((p) =>
      transformPost({ ...p, replies: result }, userCanReply, user)
    );

    return {
      data: transformed,
      status: 200,
    };
  } catch (error: any) {
    console.log(error?.message);
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
        tagUsers: post.tagUsers.map((u) => u.user),
        mentions: post.mentions.map((m) => m.user),
      }));
      const data = posts.map((p) => transformPost(p, false, user));
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
  user: AuthUser
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
            followers: {
              where: {
                followerId: user.id,
              },
              select: { id: true, followerId: true, followingId: true },
            },
            following: {
              where: {
                followingId: user.id,
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
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const reposters = result?.map((r) => composePostAuthor(r.user));
    return {
      data: reposters.length > 0 ? reposters : "Not found",
      status: reposters.length > 0 ? 200 : 404,
    };
  } catch (error: any) {
    console.log(error?.message);
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
  }
};

export const getAuthUser = async (userId?: string) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: userId },
      include: {
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
      },
    });
    if (!user) return undefined;
    const {
      id,
      username,
      avatar,
      userType,
      meta,
      accountVerified,
      role,
      name,
      subscriptions,
      email,
      telId,
      country,
    } = user;
    const subscription = subscriptions[0];
    const statuses = [
      SubStatusEnum.ACTIVE,
      SubStatusEnum.TRIAL,
      SubStatusEnum.PAYMENT_ERROR,
    ] as string[];
    return {
      id,
      avatar,
      username,
      role,
      name,
      userType,
      email,
      telId,
      country,
      meta: {
        ...meta,
        isPro: !!subscription,
        isLegacy: accountVerified,
        isActive: statuses.includes(String(meta?.status)),
      },
    } as AuthUser;
  } catch (error) {
    return undefined;
  }
};

export const getPostFeedDetails = async (postId: string, userId?: string) => {
  try {
    // get post details and parentChain if any
    // const result2 = await getPostParentChain(postId, userId!);
    const result = await fetchPostAncestry(postId, userId);

    if (!result) return { data: "not found", status: 404 };

    // get current user details
    const user = await getAuthUser(userId);

    // get feed post thread

    const thread = await getFeedPostThread(postId, userId);

    // get feed post replies
    const replies = await fetchFeedPostReplies({ postId, userId });
    // check if the current user is following author
    let userCanReply = false;
    if (
      result.scope === PostScopeEnum.FOLLOWED &&
      result?.root?.userId !== userId
    ) {
      // check if the post author is following the current user
      const result2 = await prisma.follow.findFirst({
        where: {
          followerId: result?.root?.userId,
          followingId: userId,
        },
      });
      userCanReply = !!result2;
    }

    const data = transformPost(
      {
        ...result,
        thread,
        replies,
      },
      userCanReply,
      user
    );

    return {
      data,
      status: 200,
    };
  } catch (error: any) {
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
        _count: { select: { replies: { where: { isHidden: true}} }},
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
      // Step 2: Mark both the original and the child reposts
      // const repostIds = new Set(
      //   userReposts.flatMap((repost) => [repost.id, repost.parentId]) // Include both original and child reposts
      // );
      // Step 3: Attach repost status to replies posts
      return thread.map((post) => ({
        ...post,
        reposts: userReposts.filter((r) => r.parentId === post.id),
        tagUsers: post.tagUsers.map((u) => u.user),
        mentions: post.mentions.map((m) => m.user),
        parent: post.parent
          ? {
              ...post.parent,
              reposts: userReposts.filter(
                (r) => r.parentId === post?.parent?.id
              ),
              tagUsers: post?.parent.tagUsers.map((u) => u.user),
              mentions: post?.parent.mentions.map((m) => m.user),
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
  hidden = false
}: {
  postId: string;
  userId?: string;
  page?: number;
  limit?: number;
  hidden?: boolean
}) => {
  const skip = (page - 1) * limit;
  try {
    // get some post replies of the current post
    let replies = await prisma.post.findMany({
      where: {
        parentId: postId,
        kind: PostKindEnum.REPLY,
        status: PostStatus.PUBLISHED,
        isHidden: hidden,
      },
      skip,
      take: limit,
      orderBy: [{ createdAt: "desc" }],
      include: {
        media: true,
        _count: { select: { replies: { where: { isHidden: true}} }},
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
      return replies.map((post) => ({
        ...post,
        reposts: userReposts.filter((r) => r.parentId === post.id),
        tagUsers: post.tagUsers.map((u) => u.user),
        mentions: post.mentions.map((m) => m.user),
      }));
    }
    return replies;
  } catch (error) {
    throw error;
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
    console.log("Updating post bookmarks", userId, postId);
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

export const updatePostShares = async (postId: string, userId: string) => {
  try {
    console.log("Updating post shares", userId, postId);
    const result = await prisma.post.update({
      where: { id: postId },
      data: { totalShares: { increment: 1 } },
    });
    return { data: { id: result.id, userId: result.userId }, status: 200 };
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
      return { isReposted, data: convertBigInts(post) };
    });
    return { data, status: 200 };
  } catch (error: any) {
    return { data: "Error occurred reposting, please try again", status: 500 };
  }
};

export const deletePost = async (postId: string, user: AuthUser) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // check post ownership
      const check = await tx.post.findUniqueOrThrow({where: { id: postId}, include: { user: { select: { id: true, role: true }  }}})
      if(check?.user?.role === UserRoleEnum.USER && check.user.id !== user.id){
        throw new Error("Invalid permission")
      }
      const post = await tx.post.update({ where: { id: postId }, data: { deletedAt: new Date() } });
      // decrease counters for the original post
      await updateParentCounter(tx, post, "decrement")
      // save history record
      await tx.postHistory.create({ data: { postId, userId: user.id, action: PostAction.DELETE } })
      return post;
    });
    return { data: { id: result.id, userId: user.id, deletedAt: result.deletedAt }, status: 200 };
  } catch (error) {
    return { data: "Error occurred reposting, please try again", status: 500 };
  }
};

export const restorePost = async (postId: string, user: AuthUser) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // check post ownership
      const check = await tx.post.findUniqueOrThrow({where: { id: postId}, include: { user: { select: { id: true, role: true }  }}})
      if(check?.user?.role === UserRoleEnum.USER && check.user.id !== user.id){
        throw new Error("Invalid permission")
      }
      const post = await tx.post.update({ where: { id: postId }, data: { deletedAt: null} });
      // increase counters for the original post
      await updateParentCounter(tx, post, "increment")
      // save history record
      await tx.postHistory.create({ data: { postId, userId: user.id, action: PostAction.RESTORE } })
      return post;
    });
    return { data: { id: result.id, userId: user.id, deletedAt: result.deletedAt }, status: 200 };
  } catch (error) {
    return { data: "Error occurred reposting, please try again", status: 500 };
  }
};

export const hidePostReply = async (postId: string, user: AuthUser) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // check post ownership
      const check = await tx.post.findUniqueOrThrow({where: { id: postId}, include: { user: { select: { id: true, role: true }  }, root: { select: { id: true, userId: true}}}})
      const isPostAuthor = check?.root ? check?.root?.userId === user.id : check?.userId === user?.id
      const isHidden = !check.isHidden
      if(check?.user?.role === UserRoleEnum.USER && !isPostAuthor){
        throw new Error("Invalid permission")
      }
      const post = await tx.post.update({ where: { id: postId }, data: { isHidden  } });
      // save history record
      await tx.postHistory.create({ data: { postId, userId: user.id, action: isHidden ? PostAction.HIDDEN : PostAction.UNHIDDEN } })
      return { id: post.id, isHidden,};
    });
    return { data: { id: result.id, userId: user.id, hidden: result.isHidden }, status: 200 };
  } catch (error: any) {
    logger.error(error.message)
    return { data: "Error occurred processing request, please try again", status: 500 };
  }
};

async function updateParentCounter(tx: Prisma.TransactionClient, post: Post, direction: "increment" | "decrement") {
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
    console.log("Post option voted ");
    return {
      data: JSON.parse(
        JSON.stringify(data, (_, value) =>
          typeof value === "bigint" ? Number(value) : value
        )
      ),
      status: 200,
    };
  } catch (error: any) {
    console.log("Voting option error ", error?.message);
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
        _count: { select: { replies: { where: { isHidden: true}} }},
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
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
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
        ...post,
        reposts: repost ? [repost] : [],
        tagUsers: post.tagUsers.map((u) => u.user),
        mentions: post.mentions.map((m) => m.user),
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
    const rootPost = convertBigInts(rootRaw);

    for (const post of posts) {
      const converted = convertBigInts(post);
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
