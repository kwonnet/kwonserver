export const recurringJobs = [
  {name:'sync_subscription_catalog',pattern:'*/15 * * * *',load:()=>import('./sync_subscription_catalog')},
  {name:'reconcile_subscription_payments',pattern:'*/5 * * * *',load:()=>import('./reconcile_subscription_payments')},
  {name:'sync_game_energy',pattern:'* * * * *',load:()=>import('./sync_game_energy')},
  {name:'recover_game_integrity_cases',pattern:'* * * * *',load:()=>import('./recover_game_integrity_cases')},
  {name:'recover_game_rounds',pattern:'* * * * *',load:()=>import('./recover_game_rounds')},
  {name:'recover_monthly_rewards',pattern:'* * * * *',load:()=>import('./recover_monthly_rewards')},
  {name:"settle_quiz_rewards",pattern:"* * * * *",load:()=>import("./settle_quiz_rewards")},
  {name:"reconcile_coin_withdrawals",pattern:"*/5 * * * *",load:()=>import("./reconcile_coin_withdrawals")},
  {name:"reconcile_purchase_refunds",pattern:"*/5 * * * *",load:()=>import("./reconcile_purchase_refunds")},
  {name:'recover_messaging_relay',pattern:'* * * * *',load:()=>import('./recover_messaging_relay')},
  {name:'migrate_messaging_blobs',pattern:'* * * * *',load:()=>import('./migrate_messaging_blobs')},
  {name:'clean_messaging_retention',pattern:'*/5 * * * *',load:()=>import('./clean_messaging_retention')},
  {name:'recover_email_messages',pattern:'* * * * *',load:()=>import('./recover_email_messages')},
  {name:'rotate_engagement_rewards',pattern:'0 0 * * 1',tz:'UTC',load:()=>import('./rotate_engagement_rewards')},
  { name: 'publish_scheduled_posts', pattern: '* * * * *', load: () => import('./publish_scheduled_posts') },
  { name: 'deliver_push_notifications', pattern: '* * * * *', load: () => import('./deliver_push_notifications') },
  { name: 'infer_pending_post_topics', pattern: '* * * * *', load: () => import('./infer_pending_post_topics') },
  { name: 'recover_game_wallet_actions', pattern: '* * * * *', load: () => import('./recover_game_wallet_actions') },
  { name: 'settle_pending_tips', pattern: '*/5 * * * *', load: () => import('./settle_pending_tips') },
  { name: 'sync_redis_prisma_transactions', pattern: '*/30 * * * *', load: () => import('./sync_redis_prisma_transactions') },
  { name: 'sync_redis_prisma_wallet', pattern: '*/45 * * * *', load: () => import('./sync_redis_prisma_wallet') },
  { name: 'reward_top_players_every_week', pattern: '0 0 * * 1', load: () => import('./reward_top_players_every_week') },
  { name: 'reward_top_players_every_month', pattern: '0 2 1 * *', load: () => import('./reward_top_players_every_month') },
  { name: 'sync_redis_prisma_game_month_stat', pattern: '0 12 1 * *', load: () => import('./sync_redis_prisma_game_month_stat') },
  { name: 'reward_top_players_of_the_year', pattern: '0 12 2 1 *', load: () => import('./reward_top_players_of_the_year') },
  { name: 'reward_champ_of_the_year', pattern: '0 12 2 1 *', load: () => import('./reward_champ_of_the_year') },
  { name: 'reward_grand_champ_of_the_year', pattern: '0 12 2 1 *', load: () => import('./reward_grand_champ_of_the_year') },
  { name: 'schedule_app_wallet_subscription', pattern: '*/2 * * * *', load: () => import('./schedule_app_wallet_subscription') },
  // Previously unscheduled: available for explicit invocation without inventing a cadence.
  { name: 'sync_redis_prisma_player_game_month_stat', pattern: null, load: () => import('./sync_redis_prisma_player_game_month_stat') },
  { name: 'sync_users_interactions_clickhouse', pattern: '*/2 * * * *', optIn: 'ENABLE_CLICKHOUSE_SYNC', load: () => import('./sync_users_interactions_clickhouse') },
] as const;

export async function processRecurringJob(job: { name: string }) {
  const definition = recurringJobs.find(item => item.name === job.name);
  if (!definition) throw new Error(`Unknown background job: ${job.name}`);
  if ('optIn' in definition && process.env[definition.optIn] !== 'true') {
    throw new Error(`${job.name} is disabled`);
  }
  const handler = await definition.load();
  await handler.run();
}

export async function registerRecurringJobs(queue: {
  upsertJobScheduler: (...args: any[]) => Promise<any>;
  removeJobScheduler: (id: string) => Promise<any>;
}, env: NodeJS.ProcessEnv = process.env) {
  const tz = env.JOBS_TIMEZONE || 'UTC';
  for (const job of recurringJobs) {
    if (!job.pattern || ('optIn' in job && env[job.optIn] !== 'true')) {
      await queue.removeJobScheduler(job.name);
      continue;
    }
    await queue.upsertJobScheduler(job.name, { pattern: job.pattern, tz: "tz" in job ? job.tz : tz }, {
      name: job.name, data: {},
      // Generic schedules retain failures for inspection. Game reward dispatchers
      // persist tasks whose dedicated workers and watchdog handle payout retries.
      opts: { attempts: 1, removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 } },
    });
  }
}
