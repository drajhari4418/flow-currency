const { supabaseAdmin } = require('../config/supabaseClient');
const { sendReminderEmail } = require('../config/mailer');

function dateStrWithOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Runs one reminder stage: finds incomplete tasks due on `dueDate` that
 * haven't had this particular stage's flag set yet, emails their owners,
 * and sets the flag so this stage never fires twice for the same task.
 */
async function processStage({ dueDate, flagColumn, when }) {
  const { data: tasks, error } = await supabaseAdmin
    .from('tasks')
    .select('id, user_id, title, description, priority, due_date')
    .eq('due_date', dueDate)
    .eq('is_complete', false)
    .eq(flagColumn, false);

  if (error) {
    console.error(`[reminders] Could not fetch tasks due ${when}:`, error.message);
    return { sent: 0, failed: 0, checked: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const task of tasks) {
    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(task.user_id);
      const email = userData?.user?.email;

      if (userError || !email) {
        console.warn(`[reminders] Skipping task ${task.id} — could not resolve owner's email.`);
        failed += 1;
        continue;
      }

      const delivered = await sendReminderEmail(email, task, when);

      // Marked as sent even when mail is disabled, so it doesn't get
      // reprocessed every run — the frontend's own banner covers reminders
      // for anyone running without SMTP configured.
      await supabaseAdmin.from('tasks').update({ [flagColumn]: true }).eq('id', task.id);

      if (delivered) sent += 1;
    } catch (err) {
      console.error(`[reminders] Failed to send ${when} reminder for task ${task.id}:`, err);
      failed += 1;
    }
  }

  if (tasks.length > 0) {
    console.log(`[reminders] ${tasks.length} task(s) due ${when} — ${sent} email(s) sent, ${failed} failed.`);
  }

  return { sent, failed, checked: tasks.length };
}

/**
 * Runs both reminder stages every time it's called:
 *   - day-before: tasks due tomorrow, tracked by reminder_day_before_sent
 *   - due-day:    tasks due today, tracked by reminder_due_day_sent
 * The two flags are independent, so a task can receive both emails across
 * its lifetime without either stage blocking the other. Safe to call
 * repeatedly (e.g. from a cron job) — already-sent stages are skipped.
 */
async function sendDueDateReminders() {
  const dayBefore = await processStage({
    dueDate: dateStrWithOffset(1),
    flagColumn: 'reminder_day_before_sent',
    when: 'tomorrow',
  });

  const dueDay = await processStage({
    dueDate: dateStrWithOffset(0),
    flagColumn: 'reminder_due_day_sent',
    when: 'today',
  });

  return {
    sent: dayBefore.sent + dueDay.sent,
    failed: dayBefore.failed + dueDay.failed,
    checked: dayBefore.checked + dueDay.checked,
    dayBefore,
    dueDay,
  };
}

module.exports = { sendDueDateReminders };
