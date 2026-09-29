# Foundations Duel — design project

This folder is a **Design Studio** project. Designs are plain HTML/CSS files.
A human watches them live on a canvas (with a layers tree) and gives feedback
by pointing at layers. You (Claude, Codex, …) do all the editing.

## Structure

```
design.json              project name, page names/order, optional screen order
system/tokens.css        design tokens: colors, type, spacing, radii, shadows
system/base.css          reset + base typography (uses tokens)
system/components.css    reusable components (.c-* classes)
system/components.html   component gallery — the "Components" page
screens/*.html           the main page ("Screens"); one file = one frame
screens/<page>/*.html    other pages; one sub-folder = one page
assets/                  images, icons, fonts (create when needed)
```

## Pages

The canvas shows one page at a time, like Figma pages. A page is a sub-folder
of `screens/` (one level deep), e.g. `screens/onboarding/welcome.html`.
Page display names and order live in `design.json`:

```json
{ "mainPage": "Screens", "pages": [{ "folder": "onboarding", "name": "Onboarding" }] }
```

When asked for a new page, create the folder (kebab-case) and add an entry to
`pages`. Folders not listed still show up, named after the folder. Screens
inside a page folder link the system with `../../system/…` instead of
`../system/…`.

## Layer references

The human refers to parts of a design like this:

```
screens/pricing.html › Hero › Actions › Primary CTA
```

Resolve it by opening the file and following the chain of `data-name`
attributes from the outside in (`[data-name="Hero"] [data-name="Actions"] [data-name="Primary CTA"]`).
A segment may also be a component name (`data-component`) or, for unnamed
elements, a tag label like `p.lead "Starting at…"`. A trailing ` #2` means the
second sibling with that name.
A reference may carry source lines after the file (`screens/pricing.html:40-48 › …`):
the layer's lines when it was copied. Read those lines (plus a little margin)
instead of the whole file; if they no longer match, follow the `data-name` chain.
A reference to `system/components.html` means a component: change it in
`system/components.css` so every screen using it updates.

## Rules

1. **Every screen** is a standalone HTML file in `screens/` or a page folder,
   kebab-case (`home.html`, `onboarding/welcome.html`). Its `<head>` must
   contain (use `../../system/` inside a page folder):
   ```html
   <title>Pricing</title>                         <!-- frame name on the canvas -->
   <meta name="frame" content="1440">             <!-- width; height grows to fit -->
   <!-- or content="390x844" for a fixed-size (e.g. mobile) frame -->
   <link rel="stylesheet" href="../system/tokens.css">
   <link rel="stylesheet" href="../system/base.css">
   <link rel="stylesheet" href="../system/components.css">
   ```
2. **Name the layers.** Give every meaningful element a `data-name` in Title
   Case: page sections, groups, and anything a human might point at (headings,
   buttons, cards, images). Names must be unique among siblings. Don't name
   pure wrappers nobody would talk about.
3. **Keep names stable.** Never rename or restructure named layers unless asked
   — the human's references depend on them. When adding, reuse the existing
   naming style.
4. **Tokens only.** Colors, font families, font sizes, spacing, radii and
   shadows come from `var(--…)` in `system/tokens.css`. No raw hex/px values for
   those in screens. If a value is missing, add a token (and say so).
5. **Components.** Anything used twice or more becomes a component: a `.c-name`
   class in `components.css`, shown in `components.html`, and marked where used
   with `data-component="Name"` (plus a `data-name` if the instance needs its
   own name, e.g. `data-component="Button" data-name="Primary CTA"`).
6. **Screen-specific layout** goes in a `<style>` block in that screen, still
   using tokens.
7. **Variants:** when asked for an alternative, copy to a new file
   (`pricing-v2.html`) instead of overwriting, unless told to replace.
8. **No JavaScript** unless asked. Use inline SVG or `assets/` for images; for
   placeholders use a tokened `div` with a label, not external URLs.
9. Designs must hold up at the frame width. Don't rely on `100vh` in
   auto-height frames (fixed-height frames like `390x844` are fine).

## Finding your way (read less)

Run these from the project folder. They print compact text instead of whole files:

```
node "C:\dev\design_tool\bin\design-studio.js" context [page]    briefs (with line numbers), locked layers, frames, token and component names
node "C:\dev\design_tool\bin\design-studio.js" outline <file>    a screen's layer tree with line numbers and status marks
node "C:\dev\design_tool\bin\design-studio.js" outline "<ref>"   just that layer and what's inside it
node "C:\dev\design_tool\bin\design-studio.js" outline [page]    top-level layers of every screen on a page (or all pages)
node "C:\dev\design_tool\bin\design-studio.js" done <pin> "…"    mark a brief pin done (see Briefs below)
```

Start a task with `context`, use `outline` to find the lines, then read and edit
only those lines. Read whole files only when restructuring them or when a
screen is new to you. Line numbers shift as you edit: run `outline` again
instead of guessing.

## Status marks and briefs

Design Studio keeps two files in `.design-studio/` (created when first used):

- `status.json` — review state, keyed by layer reference:
  ```json
  { "screens/pricing.html": "ready", "screens/pricing.html › Hero": "approved" }
  ```
  `approved` = the human signed it off; `ready` = ready for dev (also approved).
  A mark covers the layer and everything inside it (a marked file covers the
  whole screen). **Before editing, check this file** (`context` lists these marks). **Do not change approved or
  ready layers** unless the human explicitly asks for that layer; if a request
  would affect one, say so instead of changing it. Never edit `status.json`.
- `briefs.json` — the human's pinned requests per page:
  `{ "<page id>": { "pins": [{ "id": "k3f9a2", "ref": "...", "note": "..." }], "note": "..." } }`.
  Page ids: `@screens` (main page), `@components`, or the page folder name.
  "Do the brief on <page>" means: run `context <page>` (it lists the open pins
  with their ids), work through them in order, then the page note.
  **When a pin is handled, mark it done** with one line for the human on what
  you changed: `node "C:\dev\design_tool\bin\design-studio.js" done <pin id> "Made the count faint"` (the page note's
  id is `note:<page id>`). Leave a pin open if you couldn't do it, and say why.
  Don't edit `briefs.json` by hand; the human reviews done pins and clears them.

## Workflow

- The canvas reloads on save — no build step. Just edit files.
- After changes, briefly list what you changed using layer references, so the
  human can find them on the canvas.
