const RECIPIENT = "info.bot.nosense@gmail.com";

/** Optional owner notification, after verified submissions have been saved. */
export async function notifyOwner(env, data) {
  if (!env.CF_EMAIL_API_TOKEN || !env.CF_EMAIL_ACCOUNT_ID || !env.CF_EMAIL_FROM)
    return;
  if (!/^[a-f0-9]{32}$/i.test(env.CF_EMAIL_ACCOUNT_ID))
    throw new Error("NOTIFICATION_FAILED");

  const feedback = data.kind === "feedback";
  const text = [
    feedback ? "New Z2PL feedback" : "New Z2PL waitlist signup",
    `Email: ${data.email || "Not provided"}`,
    `Launch updates: ${data.updates ? "Opted in" : "Not opted in"}`,
    ...(feedback ? [`Topic: ${data.topic}`, "", data.message] : []),
  ].join("\n");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_EMAIL_ACCOUNT_ID}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CF_EMAIL_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.CF_EMAIL_FROM,
        to: RECIPIENT,
        subject: feedback
          ? "[Z2PL] New feedback"
          : "[Z2PL] New waitlist signup",
        text,
        ...(data.email ? { reply_to: data.email } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) throw new Error("NOTIFICATION_FAILED");
  const result = await response.json();
  const status = result.result;
  if (
    result.success !== true ||
    status?.permanent_bounces?.includes(RECIPIENT) ||
    !(
      status?.delivered?.includes(RECIPIENT) ||
      status?.queued?.includes(RECIPIENT)
    )
  ) {
    throw new Error("NOTIFICATION_FAILED");
  }
}
