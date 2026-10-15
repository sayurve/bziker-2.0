# Растровые варианты персонажей v14

Режим: встроенный инструмент image_gen; исходный мужской персонаж напрямую извлекается из присланных пользователем файлов и не перегенерируется.

Исходные изображения: `codex-clipboard-ba7fae41-722e-4f38-b344-6bd286a217cb.png`, `codex-clipboard-9fce4808-88a7-4851-93c5-ed9402dae0d2.png`.

Новый файл: `assets/actor-custom-reference-v14.png`.

## Запрос для женских вариантов

```text
Use case: stylized-concept
Asset type: transparent production sprite atlas for a detailed 2D pixel-art social city game.
Input images: Image 1 is the exact approved canonical male idle appearance with front, left, rear and right directions. Image 2 is the approved movement/style reference. Preserve the references' very distinctive face, large eyes, head proportions, pixel block size, warm brown textured hair, rich 5-tone material shading and modern gray jacket over light gray shirt, black trousers, black shoes.
Primary request: Derive a FEMALE character and two longer hairstyle variants from this precise character art. This is a matching companion sprite sheet, not a new art style.
Scene/backdrop: genuine fully transparent background, no scene.
Composition/framing: exactly 12 full-body idle character sprites in a rigorous uniform grid of FOUR columns by THREE rows. Column order is FRONT facing viewer, LEFT profile facing left, REAR facing away, RIGHT profile facing right. Every row has all four of those directions. Uniform cells, ample transparent gaps; all soles align to an identical bottom baseline within each cell; include complete hair, hands and shoes.
Row 1: female companion of the reference, with the SAME short brown curly textured hair, same facial drawing and head size, same gray jacket/light undershirt/black pants. Her total height is about 95% of the male reference, achieved by slightly shorter body and legs; slightly narrower shoulders and waist. Subtle, natural difference only, not exaggerated body shape, not a bigger head.
Row 2: the exact same female companion, clothing and proportions, but with a chin-length brown bob hairstyle; show its coherent volume from all four directions.
Row 3: the exact same female companion, clothing and proportions, but with shoulder-length brown wavy hair; show coherent volume from all four directions.
Style/medium: sharply constructed pixel-art sprites matching the input artwork exactly, not flat vector icons, not 3D render, not softly airbrushed illustration. Retain texture made from chunky small square pixels. Small dark contours, warm face shadow and highlights, readable jacket folds and shoelaces/shoe highlights.
Lighting/mood: same diffuse light and highlights as the canonical artwork.
Constraints: all 12 sprites the exact same camera angle and perspective as the four-direction idle input, arms naturally at sides, neutral expression. SAME facial anatomy and large bright eyes as the canonical input. Maintain consistent color palette, clothing, sprite scale and head size throughout. Female shorter body with head size unchanged. Do not copy the male face into a stylistically different drawing.
Avoid: no text, no labels, no numbers, no borders, no checkerboard pattern, no floor shadows, no background, no weapons, no walking poses, no costumes, no wide hips, no high heels, no sexualization. Pixel-crisp edges. Actual alpha transparency.
```

Нормализация для игры: 4 направления × 3 причёски; поле 40×64; общая линия стоп y=63; непрозрачные элементы изображения снимаются без сглаживания. Видимая высота женского персонажа — 59 строк (y=4…62), мужского исходного персонажа — 62 строки (y=1…62). Отношение роста составляет 59 / 62 ≈ 95,16%.


## Дополнительные причёски: восемь вариантов

Файл: `assets/actor-hair-reference-v14.png`. Данные: `web/actor-hair-data.js`.

Режим: встроенный image_gen. Генерация вариантов головы по утверждённому мужскому референсу; лица в итоговом игровом рендере сохраняются из канонического исходника.

```text
Use case: stylized-concept
Asset type: hairstyle raster sprite atlas for detailed 2D pixel game character customization.
Input image: the attached four-direction male idle sprite is the EXACT approved canonical pixel-art style, facial shape, face colors, large eyes, head proportions and hair material. Keep its face unchanged.
Primary request: Create 32 HEAD-ONLY pixel-art sprite portraits, precisely EIGHT ROWS by FOUR COLUMNS, to provide eight brown hairstyle choices in all four directions. This sheet is for slicing into game sprites. Real transparent alpha background.
Layout: FOUR columns in order FRONT toward viewer, LEFT profile looking left, REAR facing away, RIGHT profile looking right. EIGHT rows in order:
1. short curly haircut with tighter curls and textured rounded volume.
2. high single bun, gathered brown hair with one tidy bun centered toward the back on top.
3. very short crew cut, with closely cropped hair and clearly visible scalp silhouette.
4. neat short side-part hairstyle with a readable swept part.
5. low ponytail tied behind the head, visible and consistently placed in left, rear and right views.
6. short pixie haircut with a compact tapered silhouette and light asymmetric fringe.
7. narrow upright mohawk, clear crest down the middle of the head with close-cropped sides.
8. two symmetric small buns, one on each side high on the head.
All portraits are the SAME person from the reference with SAME head size, SAME eyes, ears, eyebrows and skin; hairstyle is the only change. Show only head and a short neck, no shoulders, no jacket, no body.
Composition/framing: uniform equal-size cells in a portrait sheet roughly twice as tall as wide. Heads have the exact same position within all cells. Eyes, nose and mouth aligned identically in all front portraits, identical profile landmarks in all side portraits. Constant ear height. The rear portraits show the back of the same head and short neck. Include every strand/bun/ponytail fully with generous transparent margins, never crop.
Style/medium: strictly match the attached chunky sharp pixel block artwork, rich 5-tone shaded warm brown hair, warm peach skin, dark brown fine contour, very large white eyes with dark pupils. Do not redesign the facial features. Pixel square clusters, crisp stepped contours. No blur, no vector, no 3D rendering.
Color palette: the same warm brown hair and peach skin as the attached male, identical color palette throughout.
Constraints: all heads the same scale and skull shape. No enlarged heads, no change to eyes or mouth or face. Only hairstyle differs. Readable distinctive hairstyle silhouettes in small game sprite sizes.
Avoid: no text, no captions, no row numbers, no frame lines, no grid lines, no checkerboard, no background, no shadows on background, no additional props, no clothing, no eyelashes or make-up, no expressions, no floating labels.
```
