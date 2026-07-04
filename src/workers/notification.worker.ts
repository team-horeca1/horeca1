// Notification delivery worker.
// Consumes the "notification" BullMQ queue and delivers via the job's channel.
// Run separately from Next.js: `npm run worker:notifications`

import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/providers/email';
import { sendSms } from '@/lib/providers/sms';
import { sendWhatsApp } from '@/lib/providers/whatsapp';
import { sendPushToUser } from '@/lib/providers/push';

interface NotificationJobData {
  notificationId: string;
  userId: string;
  type: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'push' | 'in_app';
  title: string;
  body: string;
  referenceId?: string;
  referenceType?: string;
  smsTemplateId?: string;
  smsVariables?: Record<string, string>;
}

async function processNotification(job: Job<NotificationJobData>) {
  const { notificationId, channel, title, body, userId, smsTemplateId, smsVariables } = job.data;

  if (channel === 'in_app') {
    await prisma.notification.update({ where: { id: notificationId }, data: { status: 'sent' } });
    return { delivered: false, reason: 'in_app: persisted only' };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, phone: true, fullName: true },
  });
  if (!user) throw new Error(`User ${userId} not found`);

  try {
    if (channel === 'email') {
      if (!user.email) throw new Error('User has no email address');
      await sendEmail({ to: user.email, subject: title, text: body, name: user.fullName ?? undefined });
    } else if (channel === 'sms') {
      if (!user.phone) throw new Error('User has no phone number');
      await sendSms({
        to: user.phone,
        body: smsTemplateId ? body : `${title}\n\n${body}`,
        templateId: smsTemplateId,
        variables: smsVariables,
        channel,
      });
    } else if (channel === 'whatsapp') {
      if (!user.phone) throw new Error('User has no phone number');
      await sendWhatsApp(user.phone, smsTemplateId ? body : `${title}\n\n${body}`);
    } else if (channel === 'push') {
      await sendPushToUser(userId, title, body);
    }
    await prisma.notification.update({ where: { id: notificationId }, data: { status: 'sent' } });
    return { delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'failed', body: `${body}\n\n[delivery error] ${message}`.slice(0, 4000) },
    });
    throw err;
  }
}

function start() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const worker = new Worker<NotificationJobData>('notification', processNotification, {
    connection: connection as never,
    concurrency: Number(process.env.NOTIFICATION_WORKER_CONCURRENCY) || 5,
  });

  worker.on('completed', (job, result) => {
    console.log(`[notification] ${job.id} → ${job.data.channel}:`, result);
  });
  worker.on('failed', (job, err) => {
    console.error(`[notification] ${job?.id} failed:`, err.message);
  });

  console.log('[notification] worker started');

  const shutdown = async () => {
    console.log('[notification] shutting down');
    await worker.close();
    await connection.quit();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
