import { supabase } from "@/integrations/supabase/client";

export interface SendAppEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

/**
 * Send an email through the `send-email` edge function (Resend).
 * All app emails should go through this helper so Resend handles delivery.
 */
export async function sendAppEmail(params: SendAppEmailParams): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("send-email", {
    body: {
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      cc: params.cc,
      bcc: params.bcc,
      reply_to: params.replyTo,
    },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.id as string | null) ?? null;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function baseTemplate(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f6f6;padding:24px;"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;"><h2 style="margin:0 0 16px;">${esc(title)}</h2><div style="font-size:14px;color:#333;line-height:1.6;">${bodyHtml}</div><hr style="margin:24px 0;border:none;border-top:1px solid #eee;" /><p style="font-size:12px;color:#888;">AL-KHAIR DRINKS &amp; SNACKS</p></div></body></html>`;
}

export async function sendLoyaltyEarnedEmail(opts: { to: string; name: string; points: number; totalBalance: number; saleNumber?: string; branchName?: string }) {
  if (!opts.to) return null;
  const subject = `You earned ${opts.points} points — AL-KHAIR Loyalty`;
  const body =
    `<p>Hello ${esc(opts.name)},</p>` +
    `<p>You just earned <strong>${opts.points} points</strong>${opts.saleNumber ? ` on sale <code>${esc(opts.saleNumber)}</code>` : ""}${opts.branchName ? ` at ${esc(opts.branchName)}` : ""}.</p>` +
    `<p>Your current balance is <strong>${opts.totalBalance} points</strong>.</p>` +
    `<p>Thank you for choosing Al-Khair — present your loyalty QR next time to keep earning.</p>`;
  return sendAppEmail({ to: opts.to, subject, html: baseTemplate(subject, body) }).catch((e) => {
    console.warn("loyalty earned email failed (non-blocking):", e);
    return null;
  });
}

export async function sendLoyaltyRedeemedEmail(opts: { to: string; name: string; rewardName: string; pointsSpent: number; totalBalance: number; discountText?: string }) {
  if (!opts.to) return null;
  const subject = `Reward redeemed: ${opts.rewardName}`;
  const body =
    `<p>Hello ${esc(opts.name)},</p>` +
    `<p>You redeemed <strong>${esc(opts.rewardName)}</strong> for <strong>${opts.pointsSpent} points</strong>${opts.discountText ? ` (${esc(opts.discountText)})` : ""}.</p>` +
    `<p>Remaining balance: <strong>${opts.totalBalance} points</strong>.</p>` +
    `<p>We appreciate your loyalty — see you again soon!</p>`;
  return sendAppEmail({ to: opts.to, subject, html: baseTemplate(subject, body) }).catch((e) => {
    console.warn("loyalty redeemed email failed (non-blocking):", e);
    return null;
  });
}

export async function sendLoyaltyCardIssuedEmail(opts: { to: string; name: string; token: string }) {
  if (!opts.to) return null;
  const subject = `Your AL-KHAIR loyalty card is ready`;
  const body =
    `<p>Hello ${esc(opts.name)},</p>` +
    `<p>Welcome to AL-KHAIR Loyalty! Your card token is <code style="font-size:16px; letter-spacing:0.12em;">${esc(opts.token)}</code>.</p>` +
    `<p>Present the QR at checkout — or give your phone number — to earn points on every purchase and redeem rewards.</p>` +
    `<p style="font-size:12px;color:#888;">Keep this token private. If you lose your card, ask any branch to reissue — your points stay on your account.</p>`;
  return sendAppEmail({ to: opts.to, subject, html: baseTemplate(subject, body) }).catch((e) => {
    console.warn("card issued email failed (non-blocking):", e);
    return null;
  });
}
