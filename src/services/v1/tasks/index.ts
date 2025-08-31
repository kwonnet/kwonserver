import prisma from "@/db";
import { RewardTypeEnum } from "@prisma/client";

export const checkUserTask = async (userId: string, taskId: string) => {
  try {
    const userTask = await prisma.userTask.findFirst({
      where: { userId, taskId },
      include: { task: true },
    });
    if (userTask) {
      return { data: "Task already done", status: 402 };
    }

    const task = await prisma.task.findFirst({ where: { id: taskId } });

    if (!task) {
      return { data: "Task not found", status: 402 };
    }

    return { data: task, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const insertUserTask = async (userId: string, taskId: string) => {
  try {
    const task = await prisma.userTask.create({ data: { taskId, userId } });

    return { data: task, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const createTask = async (
  task: {
    title: string;
    description: string;
    url: string;
    reward: number;
    code?: string | undefined;
    rewardType: RewardTypeEnum;
  },
  userId: string
) => {
  try {
    const result = await prisma.task.create({ data: { ...task, userId } });

    return { data: result, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getTasks = async (
  userId: string,
  {
    page,
    limit,
  }: {
    page: number;
    limit: number;
  }
) => {
  try {
    const skip = (page - 1) * limit;

    const result = await prisma.task.findMany({
      where: {
        performedBy: {
          none: {
            userId,
          },
        },
      },
      skip,
      take: limit,
      orderBy: [{ createdAt: "desc" }],
    });

    return result.length === 0
      ? { status: 404, data: "Not found" }
      : { status: 200, data: result };
  } catch (error: any) {
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};

export const getTask = async (id: string) => {
  try {
    const result = await prisma.task.findFirst({
      where: { id },
    });

    if (!result) return { data: "Not found", status: 404 };

    return { status: 200, data: result };
  } catch (error: any) {
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};

export const getUserCompletedTasks = async (
    userId: string,
    {
      page,
      limit,
    }: {
      page: number;
      limit: number;
    }
  ) => {
    try {

      const skip = (page - 1) * limit;

      const result = await prisma.userTask.findMany({
        where: {
          userId,
        },
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }],
        include: { task: true}
        
      });
  
    //   const result = await prisma.task.findMany({
    //     where: {
    //       performedBy: {
    //         some: {
    //           userId,
    //         },
    //       },
    //     },
    //     skip,
    //     take: limit,
    //     orderBy: [{ createdAt: "desc" }],
    //   });
  
      return result.length === 0
        ? { status: 404, data: "Not found" }
        : { status: 200, data: result.map(r => r.task)};
    } catch (error: any) {
      return {
        status: 500,
        data: "Sorry an error occurred, please try again later.",
      };
    }
  };
