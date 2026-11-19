import fs from "node:fs";

const SYSTEM_PROMPT = `
أنت وكيل تخطيط ألعاب محترف. حوّل وصف المستخدم إلى كائن JSON صالح فقط بدون أي نص إضافي أو شرح.
يجب أن يضم الحقول التالية:
- project_name (string)
- genre (string)
- target_platforms (array of strings)
- performance_profile (object: streaming_chunks, asset_cache, android_texture_compression, desktop_packaging)
- atmosphere (object: mood, ambient_light, fog, post_processing)
- state_machine (object: initial_state, states)
- zones (array of objects: id, type, grid_snap, assets, triggers)
- player (object: controller, spawn_zone, inventory_slots)
`;

export async function buildWorldSpec(promptText, apiKey = process.env.GROQ_API_KEY) {
  if (!apiKey) {
    throw new Error("GROQ_API_KEY غير موجود. تأكد من إضافته في GitHub Secrets.");
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: promptText }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`خطأ من Groq (${res.status}): ${err}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("لم يتم استلام محتوى من Groq.");

  return JSON.parse(content);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const promptText =
    process.env.GAME_PROMPT ||
    "لعبة رعب وبقاء في مختبر مظلم وضبابي، اللاعب معاه كشاف ببطارية، فيه أبواب مقفولة وإضاءة بتقطع، ومطلوب تصديرها لأندرويد وويندوز بأداء سلس.";

  buildWorldSpec(promptText)
    .then((spec) => {
      fs.writeFileSync("world_spec.json", JSON.stringify(spec, null, 2), "utf8");
      console.log("تم توليد وحفظ world_spec.json بنجاح.");
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
