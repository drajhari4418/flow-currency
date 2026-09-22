const nodemailer = require('nodemailer');

// Reminder emails are optional: if SMTP env vars aren't set, the transport
// stays null and sendReminderEmail() just returns false (logged once here)
// instead of crashing the server. The in-app banner still works either way.
let transporter = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
} else {
  console.warn('[mailer] SMTP_HOST/SMTP_USER/SMTP_PASS not set — task reminder emails are disabled (in-app banner still works).');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Emails one "due tomorrow" reminder for a single task.
 * Returns true if an email was actually sent, false if mail is disabled.
 */
async function sendReminderEmail(to, task) {
  if (!transporter) return false;

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"TaskFlow" <${fromAddress}>`,
    to,
    subject: `Reminder: "${task.title}" is due tomorrow`,
    text: `Just a heads-up — your task "${task.title}" is due on ${task.due_date}.\n\nPriority: ${task.priority}\n\n— TaskFlow`,
    html: `
      <p>Just a heads-up — your task is due tomorrow:</p>
      <p style="font-size:16px;"><strong>${escapeHtml(task.title)}</strong></p>
      <p>Due: <strong>${task.due_date}</strong> &nbsp;·&nbsp; Priority: <strong>${task.priority}</strong></p>
      ${task.description ? `<p style="color:#555;">${escapeHtml(task.description)}</p>` : ''}
      <p style="color:#888;font-size:12px;">— TaskFlow</p>
    `,
  });

  return true;
}

module.exports = { sendReminderEmail };
