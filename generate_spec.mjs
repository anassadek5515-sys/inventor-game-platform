import fs from "node:fs";

const SYSTEM_PROMPT = `
أنت مهندس معماري ومخطط ألعاب AAA محترف. حوّل وصف المستخدم إلى كائن JSON صالح فقط بدون أي نص إضافي أو شرح.
يجب أن يضم الحقول التالية بدقة:
- project_name (string)
- genre (string)
- objective_label (string)
- target_platforms (array of strings: ["Windows", "Linux", "Android", "Tablet"])
- performance_profile (object: streaming_chunks, asset_cache, android_texture_compression, desktop_packaging, target_fps, dynamic_lod)
- atmosphere (object: mood, ambient_light, fog, post_processing, flicker_enabled, screen_curve_strength)
- gameplay_systems (object: battery_drain_per_sec, battery_pickups_count, keycards_required, threat_enabled, threat_speed, tension_sensitivity, stealth_multiplier, sprint_multiplier, sonar_cooldown)
- controls_profile (object: pc_mode, tablet_mode, mobile_mode, auto_detect_device)
- state_machine (object: initial_state, states)
- zones (array of objects: id, type, grid_snap, assets, triggers)
- player (object: controller, spawn_zone, inventory_slots, move_speed, max_stamina)
`;

async function getKeyModels(apiKey) {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`تعذر فحص النماذج المتاحة للمفتاح (${res.status}): ${err}`);
  }

  const data = await res.json();
  const ids = Array.isArray(data?.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
  if (!ids.length) {
    throw new Error("المفتاح شغال لكن لا توجد نماذج متاحة له.");
  }

  return ids;
}

export async function buildWorldSpec(promptText, apiKey = process.env.GROQ_API_KEY) {
  if (!apiKey) {
    throw new Error("GROQ_API_KEY غير موجود. تأكد من إضافته في GitHub Secrets.");
  }

  const candidates = await getKeyModels(apiKey);
  let lastError = "";

  for (const model of candidates) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: promptText }
        ]
      })
    });

    if (res.ok) {
      console.log("تم التوليد بنجاح عبر الموديل:", model);
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("لم يتم استلام محتوى من Groq.");
      return JSON.parse(content);
    }

    lastError = `[${model} -> ${res.status}]: ${await res.text()}`;
  }

  throw new Error(`لم ينجح أي نموذج متاح للمفتاح. آخر خطأ: ${lastError}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const promptText =
    process.env.GAME_PROMPT ||
    "لعبة رعب وبقاء ومحاكاة متكاملة في منشأة أبحاث ضخمة مظلمة وضبابية، تضم جري ولياقة وتسلل صامت، كشاف ببطاريات قابلة للالتقاط، بطاقات وصول لفتح المخرج، مطاردة بذكاء اصطناعي يتأثر بالصوت والضوء، نبضة استشعار، عوجة شاشة سينمائية، وتحكم مخصص لكل من الكمبيوتر والتابلت والموبايل.";

  buildWorldSpec(promptText)
    .then((spec) => {
      fs.writeFileSync("world_spec.json", JSON.stringify(spec, null, 2), "utf8");
      console.log("تم توليد وحفظ world_spec.json الشامل بنجاح.");
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
