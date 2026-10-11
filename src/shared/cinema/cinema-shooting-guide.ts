import type { CinemaCategory } from "./cinema-catalog";

type ShootingCategory = Extract<CinemaCategory, "camera" | "lens" | "composition" | "aperture">;
type Guide = readonly [ko: string, en: string];
const guides: Record<ShootingCategory, Record<string, Guide>> = {
  camera: {
    auto: ["장비를 지정하지 않고 장면 의도에 맡기고 싶을 때", "Let the scene guide the camera choice"],
    "modular-8k": ["세부 질감이 또렷한 현대적인 영상을 원할 때", "For crisp detail and a contemporary digital look"],
    "full-frame": ["인물과 공간을 자연스럽고 풍부하게 담고 싶을 때", "For rich, natural portraits and environments"],
    "70mm-film": ["장대한 풍경과 웅장한 영화적 스케일을 원할 때", "For epic landscapes and a grand cinematic scale"],
    "studio-s35": ["균형 잡힌 색감의 정돈된 영화 장면을 원할 때", "For balanced color and a polished cinema look"],
    "16mm-film": ["거친 입자와 독립영화의 친밀한 분위기를 원할 때", "For textured grain and an intimate indie-film feel"],
    "large-format": ["넓은 공간감과 부드러운 인물 표현을 원할 때", "For spacious compositions and gentle portrait rendering"],
  },
  lens: {
    auto: ["특정 렌즈 효과 없이 장면을 표현하고 싶을 때", "Let the scene guide the lens character"],
    "creative-tilt": ["꿈같은 선택적 초점과 미니어처 느낌을 원할 때", "For dreamlike selective focus and a miniature feel"],
    "compact-anamorphic": ["가로로 펼쳐지는 화면과 아나모픽 플레어를 원할 때", "For a widescreen feel and anamorphic flares"],
    "extreme-macro": ["작은 물체의 질감과 디테일을 크게 담고 싶을 때", "For close-up textures and tiny details"],
    "70s-prime": ["부드러운 대비와 70년대 영화의 분위기를 원할 때", "For soft contrast and a 1970s cinema feel"],
    "classic-anamorphic": ["타원형 보케와 클래식한 대작 영화 느낌을 원할 때", "For oval bokeh and classic widescreen cinema"],
    "modern-prime": ["깨끗하고 정교한 현대 영화의 표현을 원할 때", "For clean, refined contemporary cinema"],
    "warm-prime": ["따뜻한 피부색과 부드러운 인물 표현을 원할 때", "For warm skin tones and gentle portraits"],
    "swirl-bokeh": ["인물 주변 배경이 소용돌이치는 감성을 원할 때", "For portraits with swirling background bokeh"],
    "vintage-prime": ["낮은 대비와 오래된 필름의 감성을 원할 때", "For lower contrast and a nostalgic film feel"],
    halation: ["빛 주변에 은은한 번짐과 몽환적인 분위기를 원할 때", "For glowing highlights and a dreamy atmosphere"],
    "clinical-prime": ["질감과 윤곽이 선명한 차가운 표현을 원할 때", "For precise textures and crisp, cool rendering"],
  },
  composition: {
    "auto": ["원문의 구도를 따르고 싶을 때","Follow the scene’s own framing"],
    "extreme-wide": ["공간 전체와 장면의 규모를 보여주고 싶을 때","Establish the setting and its scale"],
    "wide": ["전신과 주변 환경을 함께 보여주고 싶을 때","Show the full body within its environment"],
    "full": ["머리부터 발끝까지 인물 전체를 크게 담고 싶을 때", "Show the whole subject prominently from head to toe"],
    "medium-wide": ["무릎 위부터 담아 동작과 배경을 함께 보여주고 싶을 때","Show movement and context from the knees up"],
    "medium": ["허리 위부터 담아 표정과 몸짓을 보여주고 싶을 때","Show expressions and gestures from the waist up"],
    "medium-close-up": ["가슴 위부터 담아 인물의 감정에 집중하고 싶을 때","Focus on emotion from the chest up"],
    "close-up": ["얼굴과 어깨를 크게 담아 표정을 강조하고 싶을 때","Emphasize expressions with face and shoulders"],
    "extreme-close-up": ["눈·손·질감 등 특정 부분의 세밀한 디테일을 보여주고 싶을 때","Emphasize a specific detail, such as eyes, hands, or textures"],
  },
  aperture: {
    auto: ["심도를 고정하지 않고 장면의 초점을 맡기고 싶을 때", "Let the scene guide the depth of field"],
    f14: ["배경을 흐리게 하고 한 인물에 시선을 모으고 싶을 때", "For soft backgrounds and attention on one subject"],
    f4: ["인물을 강조하면서 주변 맥락도 남기고 싶을 때", "For a distinct subject with some surrounding context"],
    f11: ["앞부터 뒤까지 공간 전체가 또렷한 장면을 원할 때", "For deep focus across the whole scene"],
  },
};

export function cinemaShootingGuide(category: ShootingCategory, id: string, locale: string) {
  const guide = guides[category][id];
  return guide?.[locale === "ko" ? 0 : 1] ?? "";
}
