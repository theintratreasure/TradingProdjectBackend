import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/* ======================================================
   PATH SETUP (ESM SAFE)
====================================================== */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_DIR = path.join(
  __dirname,
  '../templates/emails'
);

/* ======================================================
   TRANSPORTER
====================================================== */

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/* ======================================================
   TEMPLATE LOADER
====================================================== */

function loadTemplate(fileName, variables) {
  const filePath = path.join(TEMPLATE_DIR, fileName);
  let html = fs.readFileSync(filePath, 'utf8');

  Object.keys(variables).forEach((key) => {
    const value = variables[key];
    html = html.replace(
      new RegExp(`{{${key}}}`, 'g'),
      value
    );
  });

  return html;
}

/* ======================================================
   GENERIC SEND
====================================================== */

function sendMail({ to, subject, html }) {
  return transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html
  });
}



export function sendEmailVerificationMail(email, verifyLink) {
  const html = loadTemplate('email-verify.html', {
    APP_NAME: process.env.APP_NAME || 'Trading App',
    VERIFY_LINK: verifyLink,
    YEAR: new Date().getFullYear()
  });

  return sendMail({
    to: email,
    subject: 'Confirm your email address',
    html
  });
}


/* ======================================================
   RESET PASSWORD MAIL
====================================================== */

export function sendResetPasswordMail(email, resetLink) {
  const html = loadTemplate('reset-password.html', {
    APP_NAME: process.env.APP_NAME || 'Trading App',
    RESET_LINK: resetLink,
    YEAR: new Date().getFullYear()
  });

  return sendMail({
    to: email,
    subject: 'Reset Password',
    html
  });
}
