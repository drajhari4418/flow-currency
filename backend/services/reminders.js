const { supabaseAdmin } = require('../config/supabaseClient');
const { sendReminderEmail } = require('../config/mailer');

/**
 * Finds every incomplete task due tomorrow that hasn't been reminded yet,
 * emails the owning user, and marks reminder_sent = true so it never goes
 * out twice. Safe to call repeatedly (e.g. from a cron job) — already-sent
 * reminders are skipped. Uses supabaseAdmin (service role) since it needs
 * to see every user's tasks, not just one.
 */
async function sendDueTomorrowReminders() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDate = tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: tasks, error } = await supabaseAdmin
    .from('tasks')
    .select('id, user_id, title, description, priority, due_date')
    .eq('due_date', dueDate)
    .eq('is_complete', false)
    .eq('reminder_sent', false);

  if (error) {
    console.error('[reminders] Could not fetch tasks due tomorrow:', error.message);
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

      const delivered = await sendReminderEmail(email, task);

      // Marked as sent even when mail is disabled, so it doesn't get
      // reprocessed every run — the frontend's own "due tomorrow" banner
      // covers reminders for anyone running without SMTP configured.
      await supabaseAdmin.from('tasks').update({ reminder_sent: true }).eq('id', task.id);

      if (delivered) sent += 1;
    } catch (err) {
      console.error(`[reminders] Failed to send reminder for task ${task.id}:`, err);
      failed += 1;
    }
  }

  if (tasks.length > 0) {
    console.log(`[reminders] ${tasks.length} task(s) due tomorrow — ${sent} email(s) sent, ${failed} failed.`);
  }

  return { sent, failed, checked: tasks.length };
}

module.exports = { sendDueTomorrowReminders };
