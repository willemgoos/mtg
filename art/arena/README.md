# Sandstone arena

The game's current source scene is `sandstone-arena-damaged.blend`. The original
scene and the brick material revision remain available for comparison. Rendered
previews show the full scene and a closer view of the masonry.

The scripts form a reproducible sequence: `build_arena.py`, `refine_bricks.py`,
`damage_stones.py`, then `export_arena.py`. Run each with Blender's `--background
--python` options. The export script requires the damaged scene and writes the
bundled GLB into `apps/web/public/arena`; it does not modify the source scene.

The export bakes lighting and procedural shading into an unlit 2048px floor and
4096px scenery atlas. These textures are embedded in the GLB. The matching static
WebP is a card-free capture of the runtime perspective camera. Live spell effects remain in the
Three.js runtime rather than the Blender export.

Initial browser validation at 1920×1080 in headless Microsoft Edge on an RTX 4080
SUPER measured 60 FPS after warm-up, about 23 draw calls including effects, and
106k triangles. This is a desktop measurement, not a lower-end hardware result.
Balanced, Low, Static, gameplay interactions, reduced motion, hidden-tab pause,
context loss, and responsive layouts were checked. The GLB is about 8 MB.
