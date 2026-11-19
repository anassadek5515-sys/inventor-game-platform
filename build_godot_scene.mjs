import fs from "node:fs";
import path from "node:path";

const SPEC_PATH = "world_spec.json";
const OUT_DIR = "game_project";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function hexToGodotColor(hex, alpha = 1.0) {
  if (typeof hex !== "string") return `Color(0.1, 0.12, 0.15, ${alpha})`;
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) return `Color(0.1, 0.12, 0.15, ${alpha})`;
  const r = (parseInt(clean.slice(0, 2), 16) / 255).toFixed(3);
  const g = (parseInt(clean.slice(2, 4), 16) / 255).toFixed(3);
  const b = (parseInt(clean.slice(4, 6), 16) / 255).toFixed(3);
  return `Color(${r}, ${g}, ${b}, ${alpha})`;
}

function buildProjectGodot(projectName) {
  const safeTitle = String(projectName || "DarkLabHorror").replace(/"/g, "");
  return `; Engine configuration file.
; Generated automatically from world_spec.json

config_version=5

[application]

config/name="${safeTitle}"
run/main_scene="res://main.tscn"
config/features=PackedStringArray("4.3", "Forward Plus")

[display]

window/size/viewport_width=1280
window/size/viewport_height=720
window/stretch/mode="canvas_items"

[rendering]

anti_aliasing/quality/msaa_3d=1
lights_and_shadows/directional_shadow/soft_shadow_filter_quality=1
environment/defaults/default_clear_color=Color(0.05, 0.06, 0.08, 1)
`;
}

function buildMainScene(spec) {
  const ambientColor = hexToGodotColor(spec?.atmosphere?.ambient_light?.color || "#141820");
  const ambientEnergy = Number(spec?.atmosphere?.ambient_light?.intensity ?? 0.3);
  const fogEnabled = Boolean(spec?.atmosphere?.fog?.enabled ?? true);
  const fogColor = hexToGodotColor(spec?.atmosphere?.fog?.color || "#1b222c");
  const fogDensity = Number(spec?.atmosphere?.fog?.density ?? 0.04);
  const zones = Array.isArray(spec?.zones) && spec.zones.length > 0
    ? spec.zones
    : [{ id: "zone_01", type: "corridor", grid_snap: 2.0 }];

  let zoneNodes = "";
  zones.forEach((zone, idx) => {
    const zPos = -(idx * 14);
    const snap = Number(zone?.grid_snap || 2.0);
    const width = Math.max(6, snap * 4);
    const length = Math.max(12, snap * 7);
    const safeName = String(zone?.id || `Zone_${idx + 1}`).replace(/[^A-Za-z0-9_]/g, "_");

    zoneNodes += `
[node name="${safeName}" type="Node3D" parent="World"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, ${zPos})

[node name="Floor" type="CSGBox3D" parent="World/${safeName}"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -0.25, 0)
use_collision = true
size = Vector3(${width}, 0.5, ${length})

[node name="LeftWall" type="CSGBox3D" parent="World/${safeName}"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${-(width / 2)}, 2.0, 0)
use_collision = true
size = Vector3(0.4, 4.0, ${length})

[node name="RightWall" type="CSGBox3D" parent="World/${safeName}"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${width / 2}, 2.0, 0)
use_collision = true
size = Vector3(0.4, 4.0, ${length})

[node name="Ceiling" type="CSGBox3D" parent="World/${safeName}"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 4.1, 0)
use_collision = true
size = Vector3(${width + 0.8}, 0.3, ${length})
`;
  });

  return `[gd_scene load_steps=4 format=3]

[ext_resource type="Script" path="res://game_controller.gd" id="1_ctrl"]

[sub_resource type="Environment" id="Environment_1"]
background_mode = 1
background_color = ${ambientColor}
ambient_light_source = 2
ambient_light_color = ${ambientColor}
ambient_light_energy = ${ambientEnergy}
fog_enabled = ${fogEnabled}
fog_light_color = ${fogColor}
fog_density = ${fogDensity}

[sub_resource type="CapsuleShape3D" id="CapsuleShape3D_1"]
radius = 0.45
height = 1.8

[node name="Main" type="Node3D"]
script = ExtResource("1_ctrl")

[node name="WorldEnvironment" type="WorldEnvironment" parent="."]
environment = SubResource("Environment_1")

[node name="DirectionalLight3D" type="DirectionalLight3D" parent="."]
transform = Transform3D(0.866, -0.25, 0.433, 0, 0.866, 0.5, -0.5, -0.433, 0.75, 0, 8, 0)
light_energy = 0.35
shadow_enabled = true

[node name="World" type="Node3D" parent="."]
${zoneNodes}
[node name="Player" type="CharacterBody3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1.2, 4)

[node name="CollisionShape3D" type="CollisionShape3D" parent="Player"]
shape = SubResource("CapsuleShape3D_1")

[node name="Head" type="Node3D" parent="Player"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0.65, 0)

[node name="Camera3D" type="Camera3D" parent="Player/Head"]
current = true
fov = 75.0

[node name="Flashlight" type="SpotLight3D" parent="Player/Head"]
light_energy = 3.5
spot_range = 18.0
spot_angle = 32.0
shadow_enabled = true
`;
}

function buildGameController(spec) {
  const initialState = String(spec?.state_machine?.initial_state || "gameplay");
  const inventorySlots = Number(spec?.player?.inventory_slots ?? 6);
  const zonesCount = Array.isArray(spec?.zones) ? spec.zones.length : 1;

  return `extends Node3D

@onready var player: CharacterBody3D = $Player
@onready var head: Node3D = $Player/Head
@onready var flashlight: SpotLight3D = $Player/Head/Flashlight

var game_state: String = "${initialState}"
var move_speed: float = 5.0
var battery_level: float = 100.0
var inventory_slots: int = ${inventorySlots}
var zones_count: int = ${zonesCount}

func _ready() -> void:
	game_state = "gameplay"
	print("Game started | State: ", game_state, " | Zones: ", zones_count, " | Slots: ", inventory_slots)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F:
			toggle_flashlight()

func toggle_flashlight() -> void:
	if flashlight and battery_level > 0.0:
		flashlight.visible = not flashlight.visible

func _physics_process(delta: float) -> void:
	if game_state != "gameplay" or not player:
		return

	if flashlight and flashlight.visible and battery_level > 0.0:
		battery_level = max(0.0, battery_level - delta * 0.8)
		if battery_level <= 0.0:
			flashlight.visible = false

	var input_dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	var direction := (player.transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()

	if direction != Vector3.ZERO:
		player.velocity.x = direction.x * move_speed
		player.velocity.z = direction.z * move_speed
	else:
		player.velocity.x = move_toward(player.velocity.x, 0.0, move_speed)
		player.velocity.z = move_toward(player.velocity.z, 0.0, move_speed)

	if not player.is_on_floor():
		player.velocity.y -= 9.8 * delta
	else:
		player.velocity.y = 0.0

	player.move_and_slide()
`;
}

function main() {
  if (!fs.existsSync(SPEC_PATH)) {
    throw new Error(`لم يتم العثور على ${SPEC_PATH}. شغّل توليد الـ Spec أولاً.`);
  }

  const raw = fs.readFileSync(SPEC_PATH, "utf8");
  const spec = JSON.parse(raw);

  ensureDir(OUT_DIR);
  fs.writeFileSync(path.join(OUT_DIR, "project.godot"), buildProjectGodot(spec.project_name), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "main.tscn"), buildMainScene(spec), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "game_controller.gd"), buildGameController(spec), "utf8");

  console.log("تم توليد مشروع Godot بنجاح في مجلد:", OUT_DIR);
}

main();
