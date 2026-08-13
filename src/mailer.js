'use strict';

const config = require('./config');

function configured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass && config.smtp.from);
}

async function sendPasswordResetCode({ to, code }) {
  if (!configured()) return false;
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    throw new Error('Email support is not installed. Run npm install before deploying.');
  }
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass }
  });
  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject: 'Your VibeManagement password reset code',
    text: `Your password reset code is ${code}. It expires in ${config.passwordResetCodeTtlMinutes} minutes. If you did not request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Password reset</h2><p>Use this code to reset your VibeManagement password:</p><p style="font-size:30px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in ${config.passwordResetCodeTtlMinutes} minutes.</p><p>If you did not request this, you can ignore this email.</p></div>`
  });
  return true;
}

module.exports = { configured, sendPasswordResetCode };
