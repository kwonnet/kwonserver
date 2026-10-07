import {isIP} from 'node:net';
const privateKey = /password|passwd|secret|token|api[_-]?key|private[_-]?key|authorization|cookie|^(headers|body|payload|config|data|email|ipAddress|ipHash|keys|auth|p256dh|command|smtp_user)$/i;
export function safeLogText(value: string): string {
  let text = value;
  for (const [name, secret] of Object.entries(process.env)) {
    if (secret && secret.length >= 6 && /PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|DATABASE_URL|REDIS_URL/.test(name)) text = text.split(secret).join('[REDACTED]');
  }
  return text.replace(/Bearer\s+[^\s"',]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED_TOKEN]')
    .replace(/\b(?:https?|postgres(?:ql)?|redis(?:s)?):\/\/[^\s"'<>]+/gi, value => {
      try {const url = new URL(value); return `${url.protocol}//${url.hostname}${url.port ? ':'+url.port : ''}/[REDACTED_PATH]`;} catch {return '[REDACTED_URL]';}
    })
    .replace(/\b[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+\b/g, '[REDACTED_EMAIL]')
    .replace(/\b(password|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[REDACTED_IP]')
    .replace(/[0-9a-f]*:[0-9a-f:]+/gi,value=>isIP(value)===6?'[REDACTED_IP]':value)
    .slice(0, 2000);
}
const smtpErrors: Record<string,string> = {EAUTH:'SMTP authentication failed', EENVELOPE:'SMTP rejected the sender or recipient', ECONNECTION:'Connection failed', ESOCKET:'Socket connection failed', ETIMEDOUT:'Operation timed out', ENOTFOUND:'Host lookup failed', CONFIG:'Email configuration is missing or invalid'};
export function safeError(error: unknown, depth = 0): Record<string,unknown> {
  if (!error || typeof error !== 'object') return {name:'Error', message:safeLogText(String(error))};
  const value = error as Record<string,any>;
  const code = typeof value.code === 'string' ? value.code.slice(0,80) : undefined;
  const name = typeof value.name === 'string' ? value.name : 'Error';
  let message = String(value.message ?? 'Operation failed');
  if (name==='SyntaxError') message='Input parsing failed';
  else if(name==='ZodError') message='Input validation failed';
  else if (name.startsWith('Prisma') || /^P\d{4}$/.test(code ?? '')) {
    const reasons: Record<string,string> = {P2002:'Unique constraint violation', P2003:'Foreign key constraint violation', P2025:'Required record not found', P2024:'Database connection pool timed out', P2010:'Database query failed'};
    message = reasons[code ?? ''] ?? 'Database operation failed';
  } else if (smtpErrors[code ?? '']) message = ['EAUTH','EENVELOPE','CONFIG'].includes(code!) ? smtpErrors[code!] : message.startsWith(`${smtpErrors[code!]}:`) ? message : `${smtpErrors[code!]}: ${safeLogText(message)}`;
  else if (value.isAxiosError) message = 'HTTP service request failed';
  else if (value.command) message = 'Redis command failed';
  const result: Record<string,unknown> = {name:safeLogText(name), message:safeLogText(message), ...(code ? {code} : {})};
  const status = value.statusCode ?? value.status ?? value.response?.status;
  if (Number.isInteger(status)) result.statusCode=status;
  if (typeof value.stack === 'string') result.stack=[`${result.name}: ${result.message}`, ...value.stack.split('\n').filter((line:string)=>/^\s+at /.test(line)).slice(0,8).map(safeLogText)].join('\n');
  if (value.cause && depth < 2) result.cause=safeError(value.cause,depth+1);
  return result;
}
export function safeLogRecord(value: any, depth = 0): any {
  if (depth > 6) return '[REDACTED_DEPTH]';
  if (value instanceof Error) return safeError(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return safeLogText(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0,50).map(item=>safeLogRecord(item,depth+1));
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key, privateKey.test(key) ? '[REDACTED]' : key==='err'||key==='error' ? safeError(item) : safeLogRecord(item,depth+1)]));
}
