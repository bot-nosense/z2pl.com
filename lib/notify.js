const RECIPIENT = "info.bot.nosense@gmail.com";

/** Optional owner notification, after verified submissions have been saved. */
export async function notifyOwner(env, data) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return;

  const feedback = data.kind === "feedback";
  const text = [
    feedback ? "New Z2PL feedback" : "New Z2PL waitlist signup",
    `Email: ${data.email || "Not provided"}`,
    `Launch updates: ${data.updates ? "Opted in" : "Not opted in"}`,
    ...(feedback ? [`Topic: ${data.topic}`, "", data.message] : [])
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `z2pl-${data.kind}-${data.submissionId}`
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [RECIPIENT],
      subject: feedback ? "[Z2PL] New feedback" : "[Z2PL] New waitlist signup",
      text,
      ...(data.email ? { reply_to: data.email } : {})
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("NOTIFICATION_FAILED");
  const result = await response.json();
  if (typeof result.id !== "string" || !result.id) throw new Error("NOTIFICATION_FAILED");
}
