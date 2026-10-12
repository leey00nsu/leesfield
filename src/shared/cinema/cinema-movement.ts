type Scene = "portrait" | "focus" | "interior" | "street" | "product" | "pov";
type Movement = {
  id: string; name: string; ko: string; prompt: string;
  guide: string; guideEn: string; scene: Scene;
};
const movement = (id: string, name: string, ko: string, prompt: string, guide: string, guideEn: string, scene: Scene = "portrait"): Movement =>
  ({ id, name, ko, prompt, guide, guideEn, scene });

// The display order follows the observed Cinema Studio movement menu.
// Preview assets are produced for this project, rather than copied from Higgsfield.
export const cinemaMovements = [
  movement("snorricam", "Snorricam", "스노리캠", "Use a body-mounted Snorricam: keep the moving subject's face fixed in the frame while the surroundings sway and move around them.", "인물은 고정되고 배경이 흔들리는 불안감과 몰입을 원할 때", "Keep the face anchored while the surroundings sway."),
  movement("robot-arm", "Robot arm", "로봇 암", "Move the camera in a precise, smooth robotic-arm sweep around the subject, transitioning between low and high angles without cuts.", "제품을 정밀하고 역동적인 각도 변화로 보여주고 싶을 때", "Reveal a product with precise changes of angle.", "product"),
  movement("tilt-up", "Tilt up", "틸트 업", "Tilt the camera upward from a fixed position, revealing the subject from bottom to top without raising the camera.", "아래에서 위로 드러내며 높이와 규모를 강조할 때", "Reveal height by rotating upward from a fixed position.", "interior"),
  movement("rack-focus", "Rack focus", "랙 포커스", "Keep the camera stationary and smoothly rack focus from a nearby foreground subject to a more distant background subject. Shift sharpness between depth planes without zooming or changing framing.", "구도를 유지하며 앞과 뒤 피사체 사이로 시선을 옮길 때", "Shift attention between foreground and background.", "focus"),
  movement("tilt-down", "Tilt down", "틸트 다운", "Tilt the camera downward from a fixed position, revealing the scene from top to bottom without lowering the camera.", "위에서 아래로 장면이나 인물을 차례로 드러낼 때", "Reveal the scene by rotating downward.", "interior"),
  movement("pov", "POV", "1인칭 시점", "Show a first-person point-of-view shot from the moving character's eye level, with natural walking motion through the scene.", "주인공이 보는 장면을 직접 경험하게 하고 싶을 때", "Experience the scene through the character's eyes.", "pov"),
  movement("pan-left", "Pan left", "팬 레프트", "camera pans to the left", "카메라 위치를 고정하고 왼쪽 공간을 드러낼 때", "Rotate left from a fixed position.", "interior"),
  movement("crane-up", "Crane up", "크레인 업", "Raise the camera in a sweeping upward crane movement, revealing a broader view of the surroundings as the viewpoint rises.", "위로 크게 상승하며 인물과 주변 공간을 함께 드러낼 때", "Rise in a broad sweep to reveal the setting.", "street"),
  movement("pan-right", "Pan right", "팬 라이트", "camera pans to the right", "카메라 위치를 고정하고 오른쪽 공간을 드러낼 때", "Rotate right from a fixed position.", "interior"),
  movement("crane-down", "Crane down", "크레인 다운", "Lower the camera in a sweeping downward crane movement from an elevated overview toward the subject.", "높은 전경에서 인물에게 내려오며 시선을 집중할 때", "Descend from an elevated view toward the subject.", "street"),
  movement("side-tracking", "Side tracking", "사이드 트래킹", "Track alongside the moving subject at matching speed, showing their side profile while the background passes laterally.", "움직이는 인물을 옆에서 따라가며 진행 방향을 보여줄 때", "Follow a moving subject from the side.", "street"),
  movement("pedestal-up", "Pedestal up", "페데스털 업", "Translate the camera vertically upward on a pedestal, keeping its viewing direction level. Show changing foreground-background parallax without tilting.", "앵글을 유지한 채 시점만 수직으로 높이고 싶을 때", "Raise the viewpoint vertically without tilting.", "interior"),
  movement("pedestal-down", "Pedestal down", "페데스털 다운", "Translate the camera vertically downward on a pedestal, keeping its viewing direction level. Show changing foreground-background parallax without tilting.", "앵글을 유지한 채 시점만 수직으로 낮추고 싶을 때", "Lower the viewpoint vertically without tilting.", "interior"),
  movement("handheld", "Handheld", "핸드헬드", "subtle handheld camera movement", "현장감과 자연스러운 미세한 흔들림을 원할 때", "Add subtle, natural handheld movement."),
  movement("tracking", "Tracking", "트래킹", "camera tracks the moving subject", "움직이는 피사체를 따라가며 장면의 흐름을 유지할 때", "Follow the moving subject.", "street"),
  movement("drone-orbit", "Drone orbit", "드론 오빗", "Orbit the subject from an elevated drone viewpoint, smoothly circling while keeping the subject near the center and revealing the surrounding landscape.", "공중에서 피사체를 돌며 주변의 규모를 보여줄 때", "Circle from an elevated aerial viewpoint.", "street"),
  movement("dolly-zoom", "Dolly zoom", "달리 줌", "Dolly the camera backward while simultaneously zooming in to keep the subject approximately the same size. Make the background's apparent scale change dramatically while the subject stays centered.", "인물 크기를 유지하며 배경이 늘어나는 긴장감을 원할 때", "Keep subject size steady while the background scale changes."),
  movement("aerial-pullback", "Aerial pullback", "에어리얼 풀백", "Pull the camera backward and upward in an aerial retreat, making the subject smaller while revealing an increasingly expansive landscape.", "피사체에서 멀어지며 광대한 주변 공간을 드러낼 때", "Retreat upward and backward to reveal the landscape.", "street"),
  movement("static", "Static shot", "고정", "locked-off static camera", "구도를 고정해 인물의 행동이나 작은 변화에 집중할 때", "Hold the frame steady and emphasize subject action."),
  movement("bullet-time", "Bullet time", "불릿 타임", "Orbit the camera around the subject while the subject and surrounding action appear almost frozen in time. Show changing perspective in a continuous slow-motion shot.", "멈춘 듯한 순간을 여러 각도에서 극적으로 보여줄 때", "Circle a moment that appears almost frozen."),
  movement("whip-pan", "Whip pan", "휩 팬", "Perform a rapid horizontal whip pan with strong directional motion blur during the turn, then settle into a stable view. Keep the shot continuous.", "빠른 시선 전환과 강한 속도감을 만들고 싶을 때", "Turn rapidly with directional blur, then settle.", "interior"),
  movement("slow-zoom-in", "Slow zoom in", "슬로우 줌 인", "Slowly zoom in from a fixed camera position, tightening the framing on the subject without moving the camera or changing perspective.", "시점은 유지하면서 인물에게 서서히 집중할 때", "Tighten framing slowly from a fixed position."),
  movement("arc-left", "Arc left", "아크 레프트", "Move the camera left along a curved horizontal arc around the subject at eye level, keeping the subject centered and revealing changing background parallax.", "인물을 중심에 두고 왼쪽 곡선으로 시점을 바꿀 때", "Move left on a curved path around the subject."),
  movement("slow-zoom-out", "Slow zoom out", "슬로우 줌 아웃", "Slowly zoom out from a fixed camera position, widening the framing without moving the camera or changing perspective.", "인물에서 주변으로 서서히 관심을 넓힐 때", "Widen framing slowly from a fixed position."),
  movement("arc-right", "Arc right", "아크 라이트", "Move the camera right along a curved horizontal arc around the subject at eye level, keeping the subject centered and revealing changing background parallax.", "인물을 중심에 두고 오른쪽 곡선으로 시점을 바꿀 때", "Move right on a curved path around the subject."),
  movement("truck-right", "Truck right", "트럭 라이트", "Translate the camera horizontally to the right on a straight path while keeping its viewing direction fixed, creating lateral parallax across foreground and background.", "오른쪽으로 수평 이동하며 공간의 깊이를 보여줄 때", "Move right on a straight path with lateral parallax.", "interior"),
  movement("dolly-in", "Dolly in", "달리 인", "camera slowly dollies toward the subject", "실제로 인물에게 다가가는 친밀감과 집중을 원할 때", "Move toward the subject and deepen engagement."),
  movement("truck-left", "Truck left", "트럭 레프트", "Translate the camera horizontally to the left on a straight path while keeping its viewing direction fixed, creating lateral parallax across foreground and background.", "왼쪽으로 수평 이동하며 공간의 깊이를 보여줄 때", "Move left on a straight path with lateral parallax.", "interior"),
  movement("dolly-out", "Dolly out", "달리 아웃", "camera slowly dollies away from the subject", "인물에게서 물러나며 거리감과 맥락을 드러낼 때", "Move away from the subject to reveal context."),
  movement("slider-right", "Slider right", "슬라이더 라이트", "Make a short, smooth camera slide to the right on a slider, using nearby foreground objects to reveal gentle parallax while keeping a level viewing direction.", "제품 가까이에서 작고 매끄러운 오른쪽 이동을 원할 때", "Make a short, smooth rightward slide.", "product"),
  movement("crush-zoom", "Crush zoom", "크러시 줌", "Make a sudden, fast zoom in from a fixed camera position, snapping from a wider view to a tight view of the subject without a cut.", "갑자기 인물에게 집중하며 놀람이나 강조를 만들 때", "Snap rapidly into a tight view."),
  movement("slider-left", "Slider left", "슬라이더 레프트", "Make a short, smooth camera slide to the left on a slider, using nearby foreground objects to reveal gentle parallax while keeping a level viewing direction.", "제품 가까이에서 작고 매끄러운 왼쪽 이동을 원할 때", "Make a short, smooth leftward slide.", "product"),
  movement("helicopter-shot", "Helicopter shot", "헬리콥터 샷", "Show a sweeping aerial flyover from a helicopter-height viewpoint, moving forward across the landscape with a gentle bank and subtle flight vibration.", "넓은 풍경 위를 비행하는 규모감과 현장감을 원할 때", "Sweep across the landscape from a high aerial viewpoint.", "street"),
] as const;

export const legacyOrbit = {
  id: "orbit", name: "Orbit (saved)", ko: "오빗 (기존 설정)", prompt: "camera orbits around the subject",
  image: "/assets/cinema/movement-orbit.webp",
};
export const legacyMovementIds = ["static", "tracking", "dolly-in", "dolly-out", "pan-left", "pan-right", "orbit", "handheld"] as const;
export const cinemaMovementOptions = cinemaMovements.map(item => ({
  ...item, image: `/assets/cinema/movements/${item.id}.webp`,
  video: `/assets/cinema/movements/${item.id}.mp4`,
}));
