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

[input_devices]

pointing/emulate_touch_from_mouse=true

[rendering]

anti_aliasing/quality/msaa_3d=1
lights_and_shadows/directional_shadow/soft_shadow_filter_quality=1
environment/defaults/default_clear_color=Color(0.04, 0.05, 0.07, 1)
`;
}

function buildScreenCurveShader() {
  return `shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float curve_strength : hint_range(0.0, 0.35) = 0.12;
uniform float vignette_strength : hint_range(0.0, 1.0) = 0.45;

vec2 warp_uv(vec2 uv) {
	vec2 centered = uv * 2.0 - 1.0;
	vec2 offset = centered.yx * curve_strength;
	centered = centered + centered * (offset * offset);
	return centered * 0.5 + 0.5;
}

void fragment() {
	vec2 warped_uv = warp_uv(SCREEN_UV);
	if (warped_uv.x < 0.0 || warped_uv.x > 1.0 || warped_uv.y < 0.0 || warped_uv.y > 1.0) {
		COLOR = vec4(0.01, 0.01, 0.015, 1.0);
	} else {
		vec3 col = texture(screen_tex, warped_uv).rgb;
		float dist = length(warped_uv - vec2(0.5));
		float vig = clamp(1.0 - dist * vignette_strength * 1.35, 0.2, 1.0);
		COLOR = vec4(col * vig, 1.0);
	}
}
`;
}

function buildMainScene(spec) {
  const ambientColor = hexToGodotColor(spec?.atmosphere?.ambient_light?.color || "#141820");
  const ambientEnergy = Number(spec?.atmosphere?.ambient_light?.intensity ?? 0.25);
  const fogEnabled = Boolean(spec?.atmosphere?.fog?.enabled ?? true);
  const fogColor = hexToGodotColor(spec?.atmosphere?.fog?.color || "#1b222c");
  const fogDensity = Number(spec?.atmosphere?.fog?.density ?? 0.045);
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
material = SubResource("Mat_Floor")

[node name="LeftWall" type="CSGBox3D" parent="World/${safeName}"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${-(width / 2)}, 2.0, 0)
use_collision = true
size = Vector3(0.4, 4.0, ${length})
material = SubResource("Mat_Wall")

[node name="RightWall" type="CSGBox3D" parent="World/${safeName}"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${width / 2}, 2.0, 0)
use_collision = true
size = Vector3(0.4, 4.0, ${length})
material = SubResource("Mat_Wall")

[node name="Ceiling" type="CSGBox3D" parent="World/${safeName}"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 4.1, 0)
use_collision = true
size = Vector3(${width + 0.8}, 0.3, ${length})
material = SubResource("Mat_Ceiling")
`;
  });

  return `[gd_scene load_steps=9 format=3]

[ext_resource type="Script" path="res://game_controller.gd" id="1_ctrl"]
[ext_resource type="Shader" path="res://screen_curve.gdshader" id="2_shd"]

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

[sub_resource type="StandardMaterial3D" id="Mat_Floor"]
albedo_color = Color(0.14, 0.16, 0.19, 1)
metallic = 0.25
roughness = 0.42

[sub_resource type="StandardMaterial3D" id="Mat_Wall"]
albedo_color = Color(0.22, 0.24, 0.27, 1)
metallic = 0.15
roughness = 0.78

[sub_resource type="StandardMaterial3D" id="Mat_Ceiling"]
albedo_color = Color(0.09, 0.1, 0.12, 1)
metallic = 0.1
roughness = 0.88

[sub_resource type="ShaderMaterial" id="Mat_ScreenCurve"]
shader = ExtResource("2_shd")
shader_parameter/curve_strength = 0.12
shader_parameter/vignette_strength = 0.45

[node name="Main" type="Node3D"]
script = ExtResource("1_ctrl")

[node name="WorldEnvironment" type="WorldEnvironment" parent="."]
environment = SubResource("Environment_1")

[node name="DirectionalLight3D" type="DirectionalLight3D" parent="."]
transform = Transform3D(0.866, -0.25, 0.433, 0, 0.866, 0.5, -0.5, -0.433, 0.75, 0, 8, 0)
light_energy = 0.25
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
light_energy = 4.2
spot_range = 20.0
spot_angle = 34.0
shadow_enabled = true

[node name="ScreenFXLayer" type="CanvasLayer" parent="."]
layer = 10

[node name="CurveOverlay" type="ColorRect" parent="ScreenFXLayer"]
material = SubResource("Mat_ScreenCurve")
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
grow_horizontal = 2
grow_vertical = 2
mouse_filter = 2

[node name="TouchUI" type="CanvasLayer" parent="."]
layer = 20

[node name="BtnUp" type="Button" parent="TouchUI"]
offset_left = 100.0
offset_top = 470.0
offset_right = 180.0
offset_bottom = 540.0
text = "W"

[node name="BtnDown" type="Button" parent="TouchUI"]
offset_left = 100.0
offset_top = 610.0
offset_right = 180.0
offset_bottom = 680.0
text = "S"

[node name="BtnLeft" type="Button" parent="TouchUI"]
offset_left = 20.0
offset_top = 540.0
offset_right = 100.0
offset_bottom = 610.0
text = "A"

[node name="BtnRight" type="Button" parent="TouchUI"]
offset_left = 180.0
offset_top = 540.0
offset_right = 260.0
offset_bottom = 610.0
text = "D"

[node name="BtnLight" type="Button" parent="TouchUI"]
offset_left = 1060.0
offset_top = 580.0
offset_right = 1240.0
offset_bottom = 660.0
text = "Flashlight (F)"
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
@onready var btn_up: Button = $TouchUI/BtnUp
@onready var btn_down: Button = $TouchUI/BtnDown
@onready var btn_left: Button = $TouchUI/BtnLeft
@onready var btn_right: Button = $TouchUI/BtnRight
@onready var btn_light: Button = $TouchUI/BtnLight

var game_state: String = "${initialState}"
var move_speed: float = 5.0
var look_sensitivity: float = 0.004
var battery_level: float = 100.0
var inventory_slots: int = ${inventorySlots}
var zones_count: int = ${zonesCount}

var hold_up: bool = false
var hold_down: bool = false
var hold_left: bool = false
var hold_right: bool = false
var is_dragging_look: bool = false

func _ready() -> void:
	game_state = "gameplay"
	btn_up.button_down.connect(func(): hold_up = true)
	btn_up.button_up.connect(func(): hold_up = false)
	btn_down.button_down.connect(func(): hold_down = true)
	btn_down.button_up.connect(func(): hold_down = false)
	btn_left.button_down.connect(func(): hold_left = true)
	btn_left.button_up.connect(func(): hold_left = false)
	btn_right.button_down.connect(func(): hold_right = true)
	btn_right.button_up.connect(func(): hold_right = false)
	btn_light.pressed.connect(toggle_flashlight)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F:
			toggle_flashlight()
	elif event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT or event.button_index == MOUSE_BUTTON_RIGHT:
			is_dragging_look = event.pressed
	elif event is InputEventMouseMotion and is_dragging_look:
		player.rotate_y(-event.relative.x * look_sensitivity)
		head.rotate_x(-event.relative.y * look_sensitivity)
		head.rotation.x = clamp(head.rotation.x, deg_to_rad(-75.0), deg_to_rad(75.0))

func toggle_flashlight() -> void:
	if flashlight and battery_level > 0.0:
		flashlight.visible = not flashlight.visible

func _physics_process(delta: float) -> void:
	if game_state != "gameplay" or not player:
		return

	if flashlight and flashlight.visible and battery_level > 0.0:
		battery_level = max(0.0, battery_level - delta * 0.7)
		if battery_level <= 0.0:
			flashlight.visible = false

	var input_dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if hold_left:
		input_dir.x -= 1.0
	if hold_right:
		input_dir.x += 1.0
	if hold_up:
		input_dir.y -= 1.0
	if hold_down:
		input_dir.y += 1.0

	if input_dir.length() > 1.0:
		input_dir = input_dir.normalized()

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
  fs.writeFileSync(path.join(OUT_DIR, "screen_curve.gdshader"), buildScreenCurveShader(), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "main.tscn"), buildMainScene(spec), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "game_controller.gd"), buildGameController(spec), "utf8");

  console.log("تم توليد مشروع Godot مع الخامات، أزرار اللمس، وعوجة الشاشة بنجاح.");
}

main();
