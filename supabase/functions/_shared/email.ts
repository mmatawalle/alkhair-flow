const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function baseTemplate(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f6f6;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
<h2 style="margin:0 0 16px;">${escapeHtml(title)}</h2>
<div style="font-size:14px;color:#333;line-height:1.6;">${bodyHtml}</div>
<hr style="margin:24px 0;border:none;border-top:1px solid #eee;" />
<p style="font-size:12px;color:#888;">AL-KHAIR DRINKS &amp; SNACKS</p>
</div></body></html>`;
}

export const Templates = {
  welcome(params: { name: string; email: string; tempPassword?: string; loginUrl: string }) {
    const subject = "Your AL-KHAIR account is ready";
    const safeBody =
      `<p>Hello ${escapeHtml(params.name || params.email)},</p>` +
      `<p>Your account has been created. Sign in with <strong>${escapeHtml(params.email)}</strong>` +
      (params.tempPassword
        ? ` and your temporary password: <code>${escapeHtml(params.tempPassword)}</code>. Please change it after signing in.`
        : ".") +
      `</p><p><a href="${escapeHtml(params.loginUrl)}">Sign in here</a></p>`;
    return { subject, html: baseTemplate(subject, safeBody) };
  },
  passwordChanged(params: { name: string }) {
    const subject = "Your password was changed";
    const safeBody =
      `<p>Hello ${escapeHtml(params.name || "there")},</p>` +
      `<p>An administrator has reset your AL-KHAIR password. If this wasn't expected, contact your administrator immediately.</p>`;
    return { subject, html: baseTemplate(subject, safeBody) };
  },
  generic(params: { subject: string; message: string }) {
    const safeBody = `<p>${escapeHtml(params.message).replace(/\n/g, "<br />")}</p>`;
    return { subject: params.subject, html: baseTemplate(params.subject, safeBody) };
  },
  loyaltyEarned(params: { name: string; points: number; totalBalance: number; saleNumber?: string; branchName?: string }) {
    const subject = `You earned ${params.points} points — AL-KHAIR Loyalty`;
    const safeBody =
      `<p>Hello ${escapeHtml(params.name)},</p>` +
      `<p>You just earned <strong>${params.points} points</strong>${params.saleNumber ? ` on sale <code>${escapeHtml(params.saleNumber)}</code>` : ""}${params.branchName ? ` at ${escapeHtml(params.branchName)}` : ""}.</p>` +
      `<p>Your current balance is <strong>${params.totalBalance} points</strong>.</p>` +
      `<p>Thank you for choosing Al-Khair — present your loyalty QR next time to keep earning.</p>`;
    return { subject, html: baseTemplate(subject, safeBody) };
  },
  loyaltyRedeemed(params: { name: string; rewardName: string; pointsSpent: number; totalBalance: number; discountText?: string }) {
    const subject = `Reward redeemed: ${params.rewardName}`;
    const safeBody =
      `<p>Hello ${escapeHtml(params.name)},</p>` +
      `<p>You redeemed <strong>${escapeHtml(params.rewardName)}</strong> for <strong>${params.pointsSpent} points</strong>${params.discountText ? ` (${escapeHtml(params.discountText)})` : ""}.</p>` +
      `<p>Remaining balance: <strong>${params.totalBalance} points</strong>.</p>` +
      `<p>We appreciate your loyalty — see you again soon!</p>`;
    return { subject, html: baseTemplate(subject, safeBody) };
  },
  loyaltyCardIssued(params: { name: string; token: string }) {
    const subject = `Your AL-KHAIR loyalty card is ready`;
    const safeBody =
      `<p>Hello ${escapeHtml(params.name)},</p>` +
      `<p>Welcome to AL-KHAIR Loyalty! Your card token is <code style="font-size:16px; letter-spacing:0.12em;">${escapeHtml(params.token)}</code>.</p>` +
      `<p>Present the QR at checkout — or give your phone number — to earn points on every purchase and redeem rewards.</p>` +
      `<p style="font-size:12px;color:#888;">Keep this token private. If you lose your card, ask any branch to reissue — your points stay on your account.</p>`;
    return { subject, html: baseTemplate(subject, safeBody) };
  },
};
