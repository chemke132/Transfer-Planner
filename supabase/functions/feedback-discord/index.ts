// Forward new feedback rows to Discord.
// Triggered by a Supabase Database Webhook on INSERT into feedback.
// Required secret: DISCORD_WEBHOOK_URL

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhook = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (!webhook) {
    return new Response("Webhook URL not configured", { status: 500 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const row = payload && payload.record;
  if (!row || payload.type !== "INSERT") {
    return new Response("Ignored", { status: 200 });
  }

  const message = String(row.message || "(empty)");
  const contact = String(row.contact || "(none)");
  const page = String(row.page || "?");
  const setup = row.setup || {};
  const cc = setup.cc_id || "?";
  const major = setup.target_major_id || "?";

  const trimmed = message.length > 4000 ? message.slice(0, 4000) + "..." : message;

  const discordPayload = {
    username: "Transfer Planner",
    embeds: [
      {
        title: "New feedback",
        description: trimmed,
        color: 999125,
        fields: [
          { name: "Page", value: page, inline: true },
          { name: "Setup", value: cc + " -> " + major, inline: true },
          { name: "Contact", value: contact, inline: false },
        ],
      },
    ],
  };

  const r = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(discordPayload),
  });

  if (!r.ok) {
    const errText = await r.text();
    console.error("Discord error", r.status, errText);
    return new Response("Discord error: " + r.status, { status: 502 });
  }

  return new Response("ok", { status: 200 });
});
