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

const SCENARIO_PRESETS = {
  dark_lab: {
    project_name: "DarkLabContainment",
    mood: "clinical_dread",
    ambientColor: "#141820",
    ambientEnergy: 0.22,
    fogColor: "#1b222c",
    fogDensity: 0.044,
    curveStrength: 0.12,
    threatSpeed: 2.35,
    batteryDrain: 0.62,
    zones: [
      { id: "zone_01_intake", type: "entry_hall", grid_snap: 2.0, assets: ["crate", "pillar", "light"], triggers: ["keycard_1"] },
      { id: "zone_02_corridor", type: "research_corridor", grid_snap: 2.2, assets: ["crate", "pillar", "light"], triggers: ["keycard_2"] },
      { id: "zone_03_core", type: "containment_wing", grid_snap: 2.4, assets: ["crate", "pillar", "light"], triggers: ["keycard_3", "exit_gate"] }
    ]
  },
  subway_tunnels: {
    project_name: "SubwayAbyssSurvival",
    mood: "claustrophobic_shadow",
    ambientColor: "#11161d",
    ambientEnergy: 0.18,
    fogColor: "#161d26",
    fogDensity: 0.055,
    curveStrength: 0.14,
    threatSpeed: 2.65,
    batteryDrain: 0.72,
    zones: [
      { id: "zone_01_platform", type: "station_platform", grid_snap: 2.1, assets: ["pillar", "crate", "light"], triggers: ["keycard_1"] },
      { id: "zone_02_tunnel_a", type: "rail_tunnel", grid_snap: 2.0, assets: ["pillar", "crate", "light"], triggers: ["keycard_2"] },
      { id: "zone_03_switchyard", type: "signal_vault", grid_snap: 2.3, assets: ["pillar", "crate", "light"], triggers: ["keycard_3", "exit_gate"] }
    ]
  },
  abandoned_hospital: {
    project_name: "WardZeroEcho",
    mood: "paranoid_isolation",
    ambientColor: "#17191f",
    ambientEnergy: 0.25,
    fogColor: "#20252e",
    fogDensity: 0.038,
    curveStrength: 0.11,
    threatSpeed: 2.2,
    batteryDrain: 0.58,
    zones: [
      { id: "zone_01_reception", type: "triage_hall", grid_snap: 2.0, assets: ["crate", "pillar", "light"], triggers: ["keycard_1"] },
      { id: "zone_02_ward_b", type: "isolation_corridor", grid_snap: 2.1, assets: ["crate", "pillar", "light"], triggers: ["keycard_2"] },
      { id: "zone_03_surgery", type: "operating_wing", grid_snap: 2.3, assets: ["crate", "pillar", "light"], triggers: ["keycard_3", "exit_gate"] }
    ]
  }
};

function clampNum(val, fallback, minVal, maxVal) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(minVal, Math.min(maxVal, n));
}

function normalizeAndValidateSpec(rawSpec, presetKey = "dark_lab", promptText = "") {
  const preset = SCENARIO_PRESETS[presetKey] || SCENARIO_PRESETS.dark_lab;
  const s = rawSpec && typeof rawSpec === "object" ? rawSpec : {};

  const zones = Array.isArray(s.zones) && s.zones.length > 0
    ? s.zones.slice(0, 6).map((z, idx) => ({
        id: String(z?.id || `zone_${String(idx + 1).padStart(2, "0")}`),
        type: String(z?.type || "corridor"),
        grid_snap: clampNum(z?.grid_snap, 2.0, 1.5, 4.0),
        assets: Array.isArray(z?.assets) && z.assets.length ? z.assets : ["crate", "pillar", "light"],
        triggers: Array.isArray(z?.triggers) && z.triggers.length ? z.triggers : ["checkpoint"]
      }))
    : preset.zones;

  const keycardsRequired = Math.min(
    zones.length,
    Math.max(1, Math.round(clampNum(s?.gameplay_systems?.keycards_required, zones.length, 1, zones.length)))
  );

  return {
    project_name: String(s.project_name || preset.project_name).slice(0, 48),
    genre: String(s.genre || "horror_survival_simulation"),
    objective_label: String(s.objective_label || "Collect keycards, unlock the security gate, and escape"),
    source_prompt: String(promptText || "").slice(0, 240),
    target_platforms: Array.isArray(s.target_platforms) && s.target_platforms.length
      ? s.target_platforms
      : ["Windows", "Linux", "Android", "Tablet"],
    performance_profile: {
      streaming_chunks: Boolean(s?.performance_profile?.streaming_chunks ?? true),
      asset_cache: Boolean(s?.performance_profile?.asset_cache ?? true),
      android_texture_compression: String(s?.performance_profile?.android_texture_compression || "etc2_astc"),
      desktop_packaging: String(s?.performance_profile?.desktop_packaging || "standalone_executable"),
      target_fps: Math.round(clampNum(s?.performance_profile?.target_fps, 60, 30, 144)),
      dynamic_lod: Boolean(s?.performance_profile?.dynamic_lod ?? true)
    },
    atmosphere: {
      mood: String(s?.atmosphere?.mood || preset.mood),
      ambient_light: {
        color: String(s?.atmosphere?.ambient_light?.color || preset.ambientColor),
        intensity: clampNum(s?.atmosphere?.ambient_light?.intensity, preset.ambientEnergy, 0.05, 1.5)
      },
      fog: {
        enabled: Boolean(s?.atmosphere?.fog?.enabled ?? true),
        color: String(s?.atmosphere?.fog?.color || preset.fogColor),
        density: clampNum(s?.atmosphere?.fog?.density, preset.fogDensity, 0.005, 0.15)
      },
      post_processing: Array.isArray(s?.atmosphere?.post_processing) && s.atmosphere.post_processing.length
        ? s.atmosphere.post_processing
        : ["screen_curve", "vignette", "tension_pulse", "sonar_tint"],
      flicker_enabled: Boolean(s?.atmosphere?.flicker_enabled ?? true),
      screen_curve_strength: clampNum(s?.atmosphere?.screen_curve_strength, preset.curveStrength, 0.0, 0.35)
    },
    gameplay_systems: {
      battery_drain_per_sec: clampNum(s?.gameplay_systems?.battery_drain_per_sec, preset.batteryDrain, 0.1, 4.0),
      battery_pickups_count: Math.round(clampNum(s?.gameplay_systems?.battery_pickups_count, zones.length, 0, 12)),
      keycards_required: keycardsRequired,
      threat_enabled: Boolean(s?.gameplay_systems?.threat_enabled ?? true),
      threat_speed: clampNum(s?.gameplay_systems?.threat_speed, preset.threatSpeed, 0.5, 6.0),
      tension_sensitivity: clampNum(s?.gameplay_systems?.tension_sensitivity, 1.0, 0.2, 2.5),
      stealth_multiplier: clampNum(s?.gameplay_systems?.stealth_multiplier, 0.55, 0.25, 0.9),
      sprint_multiplier: clampNum(s?.gameplay_systems?.sprint_multiplier, 1.55, 1.15, 2.2),
      sonar_cooldown: clampNum(s?.gameplay_systems?.sonar_cooldown, 2.0, 0.5, 10.0)
    },
    controls_profile: {
      pc_mode: { movement: "WASD/Arrows", look: "MouseDrag", sprint: "Shift", stealth: "C/Ctrl", light: "F", sonar: "Q", reset: "R" },
      tablet_mode: { layout: "split_large_touch", look: "TouchDrag", sensitivity: 0.0046 },
      mobile_mode: { layout: "compact_thumb_zone", look: "TouchDrag", sensitivity: 0.0062 },
      auto_detect_device: true
    },
    state_machine: {
      initial_state: "gameplay",
      states: Array.isArray(s?.state_machine?.states) && s.state_machine.states.length
        ? s.state_machine.states
        : ["gameplay", "escaped", "caught"]
    },
    zones,
    player: {
      controller: String(s?.player?.controller || "first_person_hybrid"),
      spawn_zone: zones[0].id,
      inventory_slots: Math.round(clampNum(s?.player?.inventory_slots, 6, 2, 20)),
      move_speed: clampNum(s?.player?.move_speed, 5.2, 2.5, 10.0),
      max_stamina: clampNum(s?.player?.max_stamina, 100.0, 40.0, 200.0)
    }
  };
}

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

export async function buildWorldSpec(promptText, apiKey = process.env.GROQ_API_KEY, presetKey = "dark_lab") {
  const effectivePrompt =
    promptText ||
    "لعبة رعب وبقاء ومحاكاة متكاملة في منشأة أبحاث ضخمة مظلمة وضبابية، تضم جري ولياقة وتسلل صامت، كشاف ببطاريات قابلة للالتقاط، بطاقات وصول لفتح المخرج، مطاردة بذكاء اصطناعي يتأثر بالصوت والضوء، نبضة استشعار، عوجة شاشة سينمائية، وتحكم مخصص لكل من الكمبيوتر والتابلت والموبايل.";

  if (!apiKey) {
    console.warn("GROQ_API_KEY غير متوفر؛ سيتم استخدام المخطط المضمون (Fallback Spec) تلقائياً.");
    return normalizeAndValidateSpec({}, presetKey, effectivePrompt);
  }

  try {
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
            { role: "user", content: `Scenario: ${presetKey}\nPrompt: ${effectivePrompt}` }
          ]
        })
      });

      if (res.ok) {
        console.log("تم التوليد بنجاح عبر الموديل:", model);
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) {
          return normalizeAndValidateSpec(JSON.parse(content), presetKey, effectivePrompt);
        }
      }

      lastError = `[${model} -> ${res.status}]: ${await res.text()}`;
    }

    console.warn("لم ينجح أي نموذج من Groq؛ تفعيل Fallback الآمن. آخر خطأ:", lastError);
  } catch (err) {
    console.warn("تعذر الاتصال بـ Groq؛ تفعيل Fallback الآمن:", err.message);
  }

  return normalizeAndValidateSpec({}, presetKey, effectivePrompt);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const presetKey = process.env.SCENARIO_PRESET || "dark_lab";
  const promptText = process.env.GAME_PROMPT || "";

  buildWorldSpec(promptText, process.env.GROQ_API_KEY, presetKey)
    .then((spec) => {
      fs.writeFileSync("world_spec.json", JSON.stringify(spec, null, 2), "utf8");
      console.log("تم توليد والتحقق وحفظ world_spec.json بنجاح.");
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
