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
  const safeTitle = String(projectName || "OmniHorrorEngine").replace(/"/g, "");
  return `; Engine configuration file.
; Generated automatically from world_spec.json (Full-Spectrum Engine)

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
environment/defaults/default_clear_color=Color(0.03, 0.04, 0.06, 1)
`;
}

function buildScreenCurveShader() {
  return `shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float curve_strength : hint_range(0.0, 0.35) = 0.12;
uniform float vignette_strength : hint_range(0.0, 1.0) = 0.45;
uniform float tension_pulse : hint_range(0.0, 1.0) = 0.0;
uniform float sonar_flash : hint_range(0.0, 1.0) = 0.0;

vec2 warp_uv(vec2 uv) {
	vec2 centered = uv * 2.0 - 1.0;
	float dyn_curve = curve_strength + tension_pulse * 0.035;
	vec2 offset = centered.yx * dyn_curve;
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
		float vig = clamp(1.0 - dist * (vignette_strength + tension_pulse * 0.25) * 1.35, 0.15, 1.0);
		vec3 sonar_tint = vec3(0.05, 0.35, 0.45) * sonar_flash * (1.0 - dist);
		COLOR = vec4(col * vig + sonar_tint, 1.0);
	}
}
`;
}

function buildMainScene(spec) {
  const ambientColor = hexToGodotColor(spec?.atmosphere?.ambient_light?.color || "#141820");
  const ambientEnergy = Number(spec?.atmosphere?.ambient_light?.intensity ?? 0.22);
  const fogEnabled = Boolean(spec?.atmosphere?.fog?.enabled ?? true);
  const fogColor = hexToGodotColor(spec?.atmosphere?.fog?.color || "#1b222c");
  const fogDensity = Number(spec?.atmosphere?.fog?.density ?? 0.042);
  const curveStrength = Number(spec?.atmosphere?.screen_curve_strength ?? 0.12);
  const zones = Array.isArray(spec?.zones) && spec.zones.length > 0
    ? spec.zones
    : [
        { id: "zone_01", type: "entry_hall", grid_snap: 2.0 },
        { id: "zone_02", type: "research_corridor", grid_snap: 2.2 },
        { id: "zone_03", type: "containment_wing", grid_snap: 2.4 }
      ];

  let zoneNodes = "";
  let pickupNodes = "";
  let keycardNodes = "";
  let lastZ = 0;

  zones.forEach((zone, idx) => {
    const zPos = -(idx * 14);
    lastZ = zPos;
    const snap = Number(zone?.grid_snap || 2.0);
    const width = Math.max(7.5, snap * 4.3);
    const length = Math.max(13, snap * 7);
    const safeName = String(zone?.id || `Zone_${idx + 1}`).replace(/[^A-Za-z0-9_]/g, "_");
    const crateX = (idx % 2 === 0 ? -1 : 1) * (width * 0.24);
    const pillarX = (idx % 2 === 0 ? 1 : -1) * (width * 0.34);
    const cellX = -(idx % 2 === 0 ? -1 : 1) * (width * 0.22);
    const cellZ = zPos - 3.2;
    const keyX = (idx % 2 === 0 ? 1 : -1) * (width * 0.2);
    const keyZ = zPos + 2.8;

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

[node name="Pillar" type="CSGBox3D" parent="World/${safeName}"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${pillarX}, 2.0, -2.5)
use_collision = true
size = Vector3(0.8, 4.0, 0.8)
material = SubResource("Mat_Prop")

[node name="SupplyCrate" type="CSGBox3D" parent="World/${safeName}"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${crateX}, 0.55, 2.0)
use_collision = true
size = Vector3(1.15, 1.1, 1.15)
material = SubResource("Mat_Prop")

[node name="CorridorLight" type="OmniLight3D" parent="World/${safeName}"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 3.4, 0)
light_color = Color(0.85, 0.9, 1.0, 1.0)
light_energy = 1.6
omni_range = 9.5
`;

    pickupNodes += `
[node name="BatteryCell_${idx + 1}" type="Area3D" parent="World/Pickups"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${cellX}, 0.8, ${cellZ})

[node name="CellShape" type="CollisionShape3D" parent="World/Pickups/BatteryCell_${idx + 1}"]
shape = SubResource("SphereShape3D_Cell")

[node name="CellMesh" type="CSGBox3D" parent="World/Pickups/BatteryCell_${idx + 1}"]
size = Vector3(0.45, 0.45, 0.45)
material = SubResource("Mat_BatteryCell")
`;

    keycardNodes += `
[node name="Keycard_${idx + 1}" type="Area3D" parent="World/Keycards"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${keyX}, 0.85, ${keyZ})

[node name="KeyShape" type="CollisionShape3D" parent="World/Keycards/Keycard_${idx + 1}"]
shape = SubResource("SphereShape3D_Cell")

[node name="KeyMesh" type="CSGBox3D" parent="World/Keycards/Keycard_${idx + 1}"]
size = Vector3(0.5, 0.32, 0.08)
material = SubResource("Mat_Keycard")
`;
  });

  const gateZ = lastZ - 2.2;
  const exitZ = lastZ - 4.8;
  const stalkerStartZ = lastZ - 1.2;

  return `[gd_scene load_steps=19 format=3]

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

[sub_resource type="CapsuleShape3D" id="CapsuleShape3D_Stalker"]
radius = 0.5
height = 1.9

[sub_resource type="BoxShape3D" id="BoxShape3D_Exit"]
size = Vector3(2.8, 3.0, 2.0)

[sub_resource type="SphereShape3D" id="SphereShape3D_Cell"]
radius = 0.8

[sub_resource type="AudioStreamGenerator" id="AudioStreamGenerator_SFX"]
mix_rate = 22050.0
buffer_length = 0.25

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

[sub_resource type="StandardMaterial3D" id="Mat_Prop"]
albedo_color = Color(0.28, 0.24, 0.19, 1)
metallic = 0.2
roughness = 0.65

[sub_resource type="StandardMaterial3D" id="Mat_SecurityGate"]
albedo_color = Color(0.45, 0.16, 0.16, 1)
metallic = 0.6
roughness = 0.35

[sub_resource type="StandardMaterial3D" id="Mat_BatteryCell"]
albedo_color = Color(0.2, 0.75, 1.0, 1)
emission_enabled = true
emission = Color(0.15, 0.65, 1.0, 1)
emission_energy_multiplier = 1.8

[sub_resource type="StandardMaterial3D" id="Mat_Keycard"]
albedo_color = Color(1.0, 0.82, 0.15, 1)
emission_enabled = true
emission = Color(0.95, 0.75, 0.1, 1)
emission_energy_multiplier = 1.9

[sub_resource type="StandardMaterial3D" id="Mat_Stalker"]
albedo_color = Color(0.75, 0.12, 0.14, 1)
emission_enabled = true
emission = Color(0.55, 0.05, 0.08, 1)
emission_energy_multiplier = 1.5

[sub_resource type="StandardMaterial3D" id="Mat_ExitBeacon"]
albedo_color = Color(0.15, 0.9, 0.55, 1)
emission_enabled = true
emission = Color(0.12, 0.85, 0.5, 1)
emission_energy_multiplier = 2.0

[sub_resource type="ShaderMaterial" id="Mat_ScreenCurve"]
shader = ExtResource("2_shd")
shader_parameter/curve_strength = ${curveStrength}
shader_parameter/vignette_strength = 0.45
shader_parameter/tension_pulse = 0.0
shader_parameter/sonar_flash = 0.0

[node name="Main" type="Node3D"]
script = ExtResource("1_ctrl")

[node name="SFXPlayer" type="AudioStreamPlayer" parent="."]
stream = SubResource("AudioStreamGenerator_SFX")
volume_db = -8.0

[node name="WorldEnvironment" type="WorldEnvironment" parent="."]
environment = SubResource("Environment_1")

[node name="DirectionalLight3D" type="DirectionalLight3D" parent="."]
transform = Transform3D(0.866, -0.25, 0.433, 0, 0.866, 0.5, -0.5, -0.433, 0.75, 0, 8, 0)
light_energy = 0.22
shadow_enabled = true

[node name="World" type="Node3D" parent="."]
${zoneNodes}
[node name="Pickups" type="Node3D" parent="World"]
${pickupNodes}
[node name="Keycards" type="Node3D" parent="World"]
${keycardNodes}
[node name="SecurityGate" type="CSGBox3D" parent="World"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1.8, ${gateZ})
use_collision = true
size = Vector3(6.8, 3.6, 0.45)
material = SubResource("Mat_SecurityGate")

[node name="Stalker" type="CharacterBody3D" parent="World"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1.0, ${stalkerStartZ})

[node name="StalkerShape" type="CollisionShape3D" parent="World/Stalker"]
shape = SubResource("CapsuleShape3D_Stalker")

[node name="StalkerBody" type="CSGBox3D" parent="World/Stalker"]
size = Vector3(0.8, 1.9, 0.8)
material = SubResource("Mat_Stalker")

[node name="ExitZone" type="Area3D" parent="World"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1.5, ${exitZ})

[node name="ExitShape" type="CollisionShape3D" parent="World/ExitZone"]
shape = SubResource("BoxShape3D_Exit")

[node name="ExitBeacon" type="CSGBox3D" parent="World/ExitZone"]
size = Vector3(1.8, 2.6, 0.3)
material = SubResource("Mat_ExitBeacon")

[node name="ExitLight" type="OmniLight3D" parent="World/ExitZone"]
light_color = Color(0.2, 1.0, 0.6, 1.0)
light_energy = 2.5
omni_range = 7.5

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

[node name="HUD" type="CanvasLayer" parent="."]
layer = 15

[node name="StatusLabel" type="Label" parent="HUD"]
offset_left = 20.0
offset_top = 14.0
offset_right = 880.0
offset_bottom = 52.0
text = "Loading..."

[node name="ObjectiveLabel" type="Label" parent="HUD"]
offset_left = 20.0
offset_top = 46.0
offset_right = 1040.0
offset_bottom = 82.0
text = "Objective..."

[node name="BtnMute" type="Button" parent="HUD"]
offset_left = 895.0
offset_top = 14.0
offset_right = 1055.0
offset_bottom = 54.0
text = "Audio: ON"

[node name="BtnMode" type="Button" parent="HUD"]
offset_left = 1070.0
offset_top = 14.0
offset_right = 1260.0
offset_bottom = 54.0
text = "Device: AUTO"

[node name="TouchUI" type="CanvasLayer" parent="."]
layer = 20

[node name="BtnUp" type="Button" parent="TouchUI"]
offset_left = 100.0
offset_top = 460.0
offset_right = 180.0
offset_bottom = 530.0
text = "UP"

[node name="BtnDown" type="Button" parent="TouchUI"]
offset_left = 100.0
offset_top = 600.0
offset_right = 180.0
offset_bottom = 670.0
text = "DOWN"

[node name="BtnLeft" type="Button" parent="TouchUI"]
offset_left = 20.0
offset_top = 530.0
offset_right = 100.0
offset_bottom = 600.0
text = "LEFT"

[node name="BtnRight" type="Button" parent="TouchUI"]
offset_left = 180.0
offset_top = 530.0
offset_right = 260.0
offset_bottom = 600.0
text = "RIGHT"

[node name="BtnSprint" type="Button" parent="TouchUI"]
offset_left = 960.0
offset_top = 460.0
offset_right = 1100.0
offset_bottom = 530.0
text = "Sprint"

[node name="BtnStealth" type="Button" parent="TouchUI"]
offset_left = 1115.0
offset_top = 460.0
offset_right = 1255.0
offset_bottom = 530.0
text = "Stealth"

[node name="BtnLight" type="Button" parent="TouchUI"]
offset_left = 960.0
offset_top = 545.0
offset_right = 1100.0
offset_bottom = 615.0
text = "Light"

[node name="BtnSonar" type="Button" parent="TouchUI"]
offset_left = 1115.0
offset_top = 545.0
offset_right = 1255.0
offset_bottom = 615.0
text = "Sonar"

[node name="BtnReset" type="Button" parent="TouchUI"]
offset_left = 1115.0
offset_top = 630.0
offset_right = 1255.0
offset_bottom = 690.0
text = "Reset"
`;
}

function buildGameController(spec) {
  const initialState = String(spec?.state_machine?.initial_state || "gameplay");
  const zonesCount = Array.isArray(spec?.zones) ? spec.zones.length : 3;
  const requiredKeys = Math.min(zonesCount, Number(spec?.gameplay_systems?.keycards_required ?? zonesCount));
  const batteryDrain = Number(spec?.gameplay_systems?.battery_drain_per_sec ?? 0.6);
  const threatSpeed = Number(spec?.gameplay_systems?.threat_speed ?? 2.35);
  const moveSpeed = Number(spec?.player?.move_speed ?? 5.2);
  const maxStamina = Number(spec?.player?.max_stamina ?? 100.0);
  const stalkerStartZ = -((zonesCount - 1) * 14) - 1.2;
  const gateOpenY = 5.4;

  return `extends Node3D

@onready var player: CharacterBody3D = $Player
@onready var head: Node3D = $Player/Head
@onready var flashlight: SpotLight3D = $Player/Head/Flashlight
@onready var sfx_player: AudioStreamPlayer = $SFXPlayer
@onready var world_node: Node3D = $World
@onready var pickups_node: Node3D = $World/Pickups
@onready var keycards_node: Node3D = $World/Keycards
@onready var security_gate: CSGBox3D = $World/SecurityGate
@onready var stalker: CharacterBody3D = $World/Stalker
@onready var exit_zone: Area3D = $World/ExitZone
@onready var status_label: Label = $HUD/StatusLabel
@onready var objective_label: Label = $HUD/ObjectiveLabel
@onready var btn_mute: Button = $HUD/BtnMute
@onready var btn_mode: Button = $HUD/BtnMode
@onready var curve_overlay: ColorRect = $ScreenFXLayer/CurveOverlay

@onready var touch_ui: CanvasLayer = $TouchUI
@onready var btn_up: Button = $TouchUI/BtnUp
@onready var btn_down: Button = $TouchUI/BtnDown
@onready var btn_left: Button = $TouchUI/BtnLeft
@onready var btn_right: Button = $TouchUI/BtnRight
@onready var btn_sprint: Button = $TouchUI/BtnSprint
@onready var btn_stealth: Button = $TouchUI/BtnStealth
@onready var btn_light: Button = $TouchUI/BtnLight
@onready var btn_sonar: Button = $TouchUI/BtnSonar
@onready var btn_reset: Button = $TouchUI/BtnReset

var game_state: String = "${initialState}"
var base_move_speed: float = ${moveSpeed}
var max_stamina: float = ${maxStamina}
var stamina: float = ${maxStamina}
var look_sensitivity: float = 0.004
var battery_level: float = 100.0
var battery_drain: float = ${batteryDrain}
var threat_speed: float = ${threatSpeed}
var tension_level: float = 0.0
var cells_collected: int = 0
var keycards_collected: int = 0
var required_keycards: int = ${requiredKeys}
var zones_count: int = ${zonesCount}
var escapes_count: int = 0
var flicker_clock: float = 0.0
var bob_clock: float = 0.0
var step_accum: float = 0.0
var heartbeat_accum: float = 0.0
var sonar_flash: float = 0.0
var gate_unlocked: bool = false
var audio_muted: bool = false
var run_status: String = "active"

var is_sprinting: bool = false
var is_stealth: bool = false
var hold_up: bool = false
var hold_down: bool = false
var hold_left: bool = false
var hold_right: bool = false
var is_dragging_look: bool = false

var control_modes: Array[String] = ["PC", "TABLET", "MOBILE"]
var active_mode_idx: int = 0

func _ready() -> void:
	game_state = "gameplay"
	_detect_initial_device_profile()
	_apply_control_layout()

	btn_mute.pressed.connect(_toggle_mute)
	btn_mode.pressed.connect(_cycle_control_mode)
	btn_up.button_down.connect(func(): hold_up = true)
	btn_up.button_up.connect(func(): hold_up = false)
	btn_down.button_down.connect(func(): hold_down = true)
	btn_down.button_up.connect(func(): hold_down = false)
	btn_left.button_down.connect(func(): hold_left = true)
	btn_left.button_up.connect(func(): hold_left = false)
	btn_right.button_down.connect(func(): hold_right = true)
	btn_right.button_up.connect(func(): hold_right = false)

	btn_sprint.button_down.connect(func(): is_sprinting = true)
	btn_sprint.button_up.connect(func(): is_sprinting = false)
	btn_stealth.pressed.connect(toggle_stealth)
	btn_light.pressed.connect(toggle_flashlight)
	btn_sonar.pressed.connect(trigger_sonar)
	btn_reset.pressed.connect(reset_run)

	exit_zone.body_entered.connect(_on_exit_entered)

	for cell in pickups_node.get_children():
		if cell is Area3D:
			cell.body_entered.connect(_on_battery_collected.bind(cell))

	for key in keycards_node.get_children():
		if key is Area3D:
			key.body_entered.connect(_on_keycard_collected.bind(key))

	if sfx_player and not sfx_player.playing:
		sfx_player.play()

	update_hud()

func _play_tone(freq: float, duration: float, amp: float = 0.25) -> void:
	if audio_muted or not sfx_player:
		return
	if not sfx_player.playing:
		sfx_player.play()
	var pb := sfx_player.get_stream_playback() as AudioStreamGeneratorPlayback
	if not pb:
		return
	var mix_rate := 22050.0
	var samples := int(max(1.0, duration * mix_rate))
	var avail := pb.get_frames_available()
	var count := min(samples, avail)
	for i in range(count):
		var t := float(i) / mix_rate
		var env := 1.0 - (float(i) / float(max(1, count)))
		var val := sin(TAU * freq * t) * amp * env
		pb.push_frame(Vector2(val, val))

func _toggle_mute() -> void:
	audio_muted = not audio_muted
	btn_mute.text = "Audio: OFF" if audio_muted else "Audio: ON"

func _detect_initial_device_profile() -> void:
	var has_touch := DisplayServer.is_touchscreen_available()
	var screen_size := DisplayServer.screen_get_size()
	if not has_touch:
		active_mode_idx = 0
	elif max(screen_size.x, screen_size.y) >= 1400:
		active_mode_idx = 1
	else:
		active_mode_idx = 2

func _cycle_control_mode() -> void:
	active_mode_idx = (active_mode_idx + 1) % control_modes.size()
	_apply_control_layout()
	update_hud()

func _apply_control_layout() -> void:
	var mode := control_modes[active_mode_idx]
	btn_mode.text = "Device: " + mode

	if mode == "PC":
		touch_ui.visible = false
		look_sensitivity = 0.0038
	elif mode == "TABLET":
		touch_ui.visible = true
		look_sensitivity = 0.0046
		_set_rect(btn_up, 110, 440, 195, 515)
		_set_rect(btn_down, 110, 595, 195, 670)
		_set_rect(btn_left, 25, 518, 110, 593)
		_set_rect(btn_right, 195, 518, 280, 593)
		_set_rect(btn_sprint, 950, 445, 1095, 515)
		_set_rect(btn_stealth, 1110, 445, 1255, 515)
		_set_rect(btn_light, 950, 530, 1095, 600)
		_set_rect(btn_sonar, 1110, 530, 1255, 600)
		_set_rect(btn_reset, 1110, 615, 1255, 680)
	else:
		touch_ui.visible = true
		look_sensitivity = 0.0062
		_set_rect(btn_up, 120, 415, 225, 505)
		_set_rect(btn_down, 120, 595, 225, 685)
		_set_rect(btn_left, 15, 505, 120, 595)
		_set_rect(btn_right, 225, 505, 330, 595)
		_set_rect(btn_sprint, 910, 415, 1075, 505)
		_set_rect(btn_stealth, 1090, 415, 1260, 505)
		_set_rect(btn_light, 910, 515, 1075, 605)
		_set_rect(btn_sonar, 1090, 515, 1260, 605)
		_set_rect(btn_reset, 1090, 615, 1260, 690)

func _set_rect(ctrl: Control, l: float, t: float, r: float, b: float) -> void:
	ctrl.offset_left = l
	ctrl.offset_top = t
	ctrl.offset_right = r
	ctrl.offset_bottom = b

func _on_battery_collected(body: Node, cell: Area3D) -> void:
	if body == player and cell.visible:
		cell.visible = false
		cell.monitoring = false
		battery_level = min(100.0, battery_level + 35.0)
		cells_collected += 1
		_play_tone(660.0, 0.12, 0.25)
		update_hud()

func _on_keycard_collected(body: Node, key: Area3D) -> void:
	if body == player and key.visible:
		key.visible = false
		key.monitoring = false
		keycards_collected += 1
		_play_tone(880.0, 0.15, 0.28)
		if keycards_collected >= required_keycards and not gate_unlocked:
			gate_unlocked = true
			_play_tone(523.0, 0.25, 0.3)
		update_hud()

func _on_exit_entered(body: Node) -> void:
	if body == player and run_status == "active":
		if keycards_collected >= required_keycards:
			run_status = "escaped"
			game_state = "escaped"
			escapes_count += 1
			_play_tone(784.0, 0.3, 0.3)
		else:
			objective_label.text = "LOCKED EXIT! Collect all Keycards first (%d/%d)" % [keycards_collected, required_keycards]
		update_hud()

func reset_run() -> void:
	run_status = "active"
	game_state = "gameplay"
	battery_level = 100.0
	stamina = max_stamina
	tension_level = 0.0
	cells_collected = 0
	keycards_collected = 0
	gate_unlocked = false
	is_sprinting = false
	is_stealth = false
	head.position.y = 0.65
	player.global_position = Vector3(0.0, 1.2, 4.0)
	player.velocity = Vector3.ZERO
	player.rotation = Vector3.ZERO
	head.rotation = Vector3.ZERO
	stalker.global_position = Vector3(0.0, 1.0, ${stalkerStartZ})
	stalker.velocity = Vector3.ZERO
	if security_gate:
		security_gate.position.y = 1.8
	flashlight.visible = true

	for cell in pickups_node.get_children():
		if cell is Area3D:
			cell.visible = true
			cell.monitoring = true

	for key in keycards_node.get_children():
		if key is Area3D:
			key.visible = true
			key.monitoring = true

	update_hud()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey:
		if event.keycode == KEY_SHIFT:
			is_sprinting = event.pressed
		elif event.pressed and not event.echo:
			if event.keycode == KEY_F:
				toggle_flashlight()
			elif event.keycode == KEY_C or event.keycode == KEY_CTRL:
				toggle_stealth()
			elif event.keycode == KEY_Q:
				trigger_sonar()
			elif event.keycode == KEY_M:
				_toggle_mute()
			elif event.keycode == KEY_R:
				reset_run()
			elif event.keycode == KEY_TAB:
				_cycle_control_mode()
	elif event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT or event.button_index == MOUSE_BUTTON_RIGHT:
			is_dragging_look = event.pressed
	elif event is InputEventMouseMotion and is_dragging_look:
		player.rotate_y(-event.relative.x * look_sensitivity)
		head.rotate_x(-event.relative.y * look_sensitivity)
		head.rotation.x = clamp(head.rotation.x, deg_to_rad(-75.0), deg_to_rad(75.0))

func toggle_flashlight() -> void:
	if flashlight and battery_level > 0.0 and run_status == "active":
		flashlight.visible = not flashlight.visible
		_play_tone(420.0, 0.05, 0.16)
		update_hud()

func toggle_stealth() -> void:
	if run_status != "active":
		return
	is_stealth = not is_stealth
	if is_stealth:
		is_sprinting = false
		head.position.y = 0.25
	else:
		head.position.y = 0.65
	_play_tone(260.0, 0.06, 0.15)
	update_hud()

func trigger_sonar() -> void:
	if run_status == "active" and battery_level >= 8.0:
		battery_level -= 8.0
		sonar_flash = 1.0
		_play_tone(980.0, 0.18, 0.25)
		update_hud()

func _update_security_gate(delta: float) -> void:
	if not security_gate:
		return
	var target_y := ${gateOpenY} if gate_unlocked else 1.8
	security_gate.position.y = lerp(security_gate.position.y, target_y, delta * 4.0)

func _update_corridor_flicker(delta: float) -> void:
	flicker_clock += delta * (13.0 + tension_level * 12.0)
	var pulse := 1.25 + sin(flicker_clock) * 0.25 + cos(flicker_clock * 2.7) * 0.15
	for child in world_node.get_children():
		var light_node := child.get_node_or_null("CorridorLight")
		if light_node and light_node is OmniLight3D:
			light_node.light_energy = max(0.25, pulse)

func _update_stalker_and_tension(delta: float) -> void:
	if run_status != "active" or not stalker or not player:
		return

	var to_player := player.global_position - stalker.global_position
	to_player.y = 0.0
	var dist := to_player.length()

	var prox_tension := clamp(1.0 - (dist / 24.0), 0.0, 1.0)
	var bat_tension := clamp((30.0 - battery_level) / 30.0, 0.0, 1.0) * 0.35
	tension_level = clamp(max(prox_tension, bat_tension), 0.0, 1.0)

	if tension_level > 0.35:
		heartbeat_accum += delta * (1.2 + tension_level * 2.5)
		if heartbeat_accum >= 1.0:
			heartbeat_accum = 0.0
			_play_tone(110.0, 0.09, 0.22 * tension_level)

	if sonar_flash > 0.0:
		sonar_flash = max(0.0, sonar_flash - delta * 1.4)

	if curve_overlay and curve_overlay.material is ShaderMaterial:
		var mat := curve_overlay.material as ShaderMaterial
		mat.set_shader_parameter("tension_pulse", tension_level)
		mat.set_shader_parameter("sonar_flash", sonar_flash)

	var detection_range := 12.0 if is_stealth else 26.0
	if flashlight and flashlight.visible:
		detection_range += 8.0
	if is_sprinting:
		detection_range += 10.0

	if dist <= detection_range and dist > 1.2:
		var dir := to_player.normalized()
		var speed_boost := 1.25 if (flashlight and flashlight.visible) else 0.9
		if is_stealth:
			speed_boost *= 0.65
		stalker.velocity.x = dir.x * threat_speed * speed_boost
		stalker.velocity.z = dir.z * threat_speed * speed_boost
	elif dist <= 1.2:
		stalker.velocity = Vector3.ZERO
		run_status = "caught"
		game_state = "caught"
		_play_tone(140.0, 0.35, 0.32)
		update_hud()
		return
	else:
		stalker.velocity.x = move_toward(stalker.velocity.x, 0.0, threat_speed)
		stalker.velocity.z = move_toward(stalker.velocity.z, 0.0, threat_speed)

	if not stalker.is_on_floor():
		stalker.velocity.y -= 9.8 * delta
	else:
		stalker.velocity.y = 0.0

	stalker.move_and_slide()

func update_hud() -> void:
	if not status_label or not objective_label:
		return

	var fps := Engine.get_frames_per_second()
	var mode := control_modes[active_mode_idx]

	if run_status == "escaped":
		status_label.text = "ESCAPED! Escapes: %d | Bat: %d%% | FPS: %d" % [
			escapes_count, int(round(battery_level)), fps
		]
		objective_label.text = "Mission Complete! Press R or Reset to play again."
	elif run_status == "caught":
		status_label.text = "CAUGHT! Stalker detected you | Escapes: %d | FPS: %d" % [escapes_count, fps]
		objective_label.text = "Tip: Use Stealth (C) and turn off Flashlight when close. Press R or Reset."
	else:
		var light_state := "ON" if (flashlight and flashlight.visible) else "OFF"
		var stance := "STEALTH" if is_stealth else ("SPRINT" if is_sprinting else "WALK")
		status_label.text = "[%s] Bat: %d%% (%s) | Stam: %d%% | %s | Tension: %d%% | FPS: %d" % [
			mode,
			int(round(battery_level)),
			light_state,
			int(round(stamina)),
			stance,
			int(round(tension_level * 100.0)),
			fps
		]
		if gate_unlocked:
			objective_label.text = "Security Gate OPEN! Reach the green exit | Keycards: %d/%d | Cells: %d" % [
				keycards_collected, required_keycards, cells_collected
			]
		else:
			objective_label.text = "Collect Yellow Keycards (%d/%d) to open the gate | Cells: %d" % [
				keycards_collected, required_keycards, cells_collected
			]

func _physics_process(delta: float) -> void:
	_update_corridor_flicker(delta)
	_update_security_gate(delta)
	_update_stalker_and_tension(delta)

	if not player:
		return

	if run_status == "active" and flashlight and flashlight.visible and battery_level > 0.0:
		battery_level = max(0.0, battery_level - delta * battery_drain)
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

	var current_speed := base_move_speed
	if is_stealth:
		current_speed = base_move_speed * 0.55
		stamina = min(max_stamina, stamina + delta * 14.0)
	elif is_sprinting and input_dir != Vector2.ZERO and stamina > 2.0:
		current_speed = base_move_speed * 1.55
		stamina = max(0.0, stamina - delta * 22.0)
	else:
		stamina = min(max_stamina, stamina + delta * 12.0)

	var direction := (player.transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()

	if direction != Vector3.ZERO and run_status == "active":
		player.velocity.x = direction.x * current_speed
		player.velocity.z = direction.z * current_speed
		bob_clock += delta * (current_speed * 2.2)
		var base_y := 0.25 if is_stealth else 0.65
		head.position.y = base_y + sin(bob_clock) * 0.045

		if not is_stealth:
			step_accum += delta * (current_speed * (1.4 if is_sprinting else 0.9))
			if step_accum >= 1.0:
				step_accum = 0.0
				_play_tone(180.0 if is_sprinting else 145.0, 0.04, 0.12)
	else:
		player.velocity.x = move_toward(player.velocity.x, 0.0, current_speed)
		player.velocity.z = move_toward(player.velocity.z, 0.0, current_speed)

	if not player.is_on_floor():
		player.velocity.y -= 9.8 * delta
	else:
		player.velocity.y = 0.0

	player.move_and_slide()
	update_hud()
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

  console.log("تم توليد مشروع Godot الكامل مع الصوت المولّد، بوابة الأمان، التوتر، وأوضاع التحكم الثلاثة بنجاح.");
}

main();
