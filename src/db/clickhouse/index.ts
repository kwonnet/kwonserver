import { createClient } from '@clickhouse/client' // or '@clickhouse/client-web'

export const clickHouseClient = createClient({
    url: process.env.CLICKHOUSE_HOST,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    database: process.env.CLICKHOUSE_DATABASE
})
